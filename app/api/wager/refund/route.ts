import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { lobbies } from '@/lib/lobbies'
import { auditLogger } from '@/lib/audit-logger'
import { withRateLimit, RATE_LIMITS } from '@/lib/rate-limiter'
import { isBsc } from '@/lib/chain'
import { evmEscrowService } from '@/lib/evm-escrow-service'
import { ethers } from 'ethers'

export async function POST(req: NextRequest) {
  return withRateLimit(req, RATE_LIMITS.WAGER, async () => {
    try {
      const BodySchema = z.object({
        lobbyId: z.string().min(3),
        playerPublicKey: z.string().min(32),
        reason: z.string().optional(),
        __serverOnlyToken: z.string().optional(),
      })
      const parsed = BodySchema.safeParse(await req.json())
      if (!parsed.success) {
        return NextResponse.json({ error: 'Invalid request body', details: parsed.error.flatten() }, { status: 400 })
      }
      const { lobbyId, playerPublicKey, reason, __serverOnlyToken } = parsed.data

      // Reject client-initiated refunds; only allow when invoked by our server logic
      // Server provides a shared-secret token via env
      const expected = process.env.REFUND_SERVER_TOKEN
      if (!expected || __serverOnlyToken !== expected) {
        return NextResponse.json({ error: 'Refunds must be initiated by server' }, { status: 403 })
      }

      const lobby = lobbies.find(l => l.id === lobbyId)
      if (!lobby) return NextResponse.json({ error: 'Lobby not found' }, { status: 404 })
      if (lobby.matchType === 'tutorial' || lobby.amount <= 0) {
        return NextResponse.json({ error: 'No refund for free/tutorial matches' }, { status: 400 })
      }

      const player = lobby.players.find(p => String(p.playerId||'').toLowerCase() === String(playerPublicKey||'').toLowerCase())
      if (!player) return NextResponse.json({ error: 'Player not found in lobby' }, { status: 404 })

      // Only allow refund if countdown not active and queue not started
      const isCountdownActive = (() => { try { return Boolean((global as any).countdownActive && (global as any).countdownActive[lobbyId]) } catch { return false } })()
      const hasQueueSession = (() => { try { return Boolean((global as any).activeQueueForLobby && (global as any).activeQueueForLobby.get(lobbyId)) } catch { return false } })()
      if (isCountdownActive || hasQueueSession) {
        return NextResponse.json({ error: 'Refund window closed' }, { status: 409 })
      }

      // Idempotent: require that the player previously paid and wasn't already refunded
      if (!player.hasWagered || (player as any).__refunded) {
        return NextResponse.json({ ok: true, message: 'Already refunded or no recorded wager' })
      }

      // In-memory idempotency key to avoid double-refunds due to retries
      try {
        if (!(global as any).__refundLocks) (global as any).__refundLocks = new Set<string>()
        const key = `${lobbyId}:${String(player.playerId).toLowerCase()}`
        if ((global as any).__refundLocks.has(key)) {
          return NextResponse.json({ ok: true, message: 'Refund already processing' })
        }
        (global as any).__refundLocks.add(key)
        // Clean up lock after 30s just in case
        setTimeout(() => { try { (global as any).__refundLocks.delete(key) } catch {} }, 30000)
      } catch {}

      if (!isBsc()) return NextResponse.json({ error: 'Unsupported chain' }, { status: 500 })
      if (!lobby.escrowWalletId) return NextResponse.json({ error: 'Escrow not assigned' }, { status: 500 })

      const escrow = evmEscrowService.getWallet(lobby.escrowWalletId as any)
      if (!escrow) return NextResponse.json({ error: 'Escrow wallet unavailable' }, { status: 500 })

      const wei = ethers.parseUnits(String(lobby.amount), 18)
      // Determine the exact funding wallet for this player to ensure refunds return to sender
      const refundTo = String(((player as any)?.__fundingWallet || playerPublicKey) as string)
      let txHash: string | null = null
      try {
        txHash = await evmEscrowService.transferNative(refundTo, wei, escrow)
      } catch (e: any) {
        // Non-fatal: surface to client
        return NextResponse.json({ error: 'Refund transfer failed', details: e?.message || String(e) }, { status: 502 })
      }

      // Update in-memory flags
      try { (player as any).__refunded = true; player.hasWagered = false; player.isReady = false } catch {}

      try {
        await auditLogger.log({
          eventType: 'wager_refund',
          actorWallet: playerPublicKey,
          endpoint: '/api/wager/refund',
          severity: 'info',
          metadata: { lobbyId, amount: lobby.amount, escrowId: lobby.escrowWalletId, txHash, reason, refundTo },
        })
      } catch {}

      // Notify room to refresh
      try {
        const io = (global as any).socketIo
        if (io) {
          io.to(lobbyId).emit('player_ready_status', { lobbyId, playerId: playerPublicKey, isReady: false })
          const lobbyPlayers = lobby.players.map(p => ({
            playerId: p.playerId,
            username: p.username || p.playerId.slice(0, 8) + '...',
            chickenName: p.chickenId || 'Default',
            isReady: p.isAi ? true : Boolean(p.isReady),
            isAi: p.isAi || false
          }))
          io.to(lobbyId).emit('lobby_updated', {
            id: lobbyId,
            players: lobbyPlayers,
            capacity: lobby.capacity,
            amount: lobby.amount,
            currency: lobby.currency,
            matchType: lobby.matchType
          })
        }
      } catch {}

      return NextResponse.json({ ok: true, txHash })
    } catch (error: any) {
      console.error('Refund error:', error)
      return NextResponse.json({ error: 'Refund failed', details: error?.message || String(error) }, { status: 500 })
    }
  })
}


