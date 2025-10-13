import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { lobbies } from '@/lib/lobbies'
import { auditLogger } from '@/lib/audit-logger'
import { withRateLimit, RATE_LIMITS } from '@/lib/rate-limiter'
import { isBsc } from '@/lib/chain'
import { evmEscrowService } from '@/lib/evm-escrow-service'
import { sendIdempotentPayment } from '@/lib/evm-payments'
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

      const result = await processRefundServerOnly({ lobbyId, playerPublicKey, reason })
      return NextResponse.json(result)
    } catch (error: any) {
      console.error('Refund error:', error)
      return NextResponse.json({ error: 'Refund failed', details: error?.message || String(error) }, { status: 500 })
    }
  })
}

export async function processRefundServerOnly(args: { lobbyId: string; playerPublicKey: string; reason?: string }) {
  const { lobbyId, playerPublicKey, reason } = args
  const lobby = lobbies.find(l => l.id === lobbyId)
  if (!lobby) throw new Error('Lobby not found')
  if (lobby.matchType === 'tutorial' || lobby.amount <= 0) {
    return { ok: true, message: 'No refund for free/tutorial matches' }
  }
  const player = lobby.players.find(p => String(p.playerId||'').toLowerCase() === String(playerPublicKey||'').toLowerCase())
  if (!player) throw new Error('Player not found in lobby')

  const isCountdownActive = (() => { try { return Boolean((global as any).countdownActive && (global as any).countdownActive[lobbyId]) } catch { return false } })()
  const hasQueueSession = (() => { try { return Boolean((global as any).activeQueueForLobby && (global as any).activeQueueForLobby.get(lobbyId)) } catch { return false } })()
  if (isCountdownActive || hasQueueSession) {
    return { error: 'Refund window closed' }
  }
  if (!player.hasWagered || (player as any).__refunded) {
    return { ok: true, message: 'Already refunded or no recorded wager' }
  }
  if (!isBsc()) throw new Error('Unsupported chain')
  if (!lobby.escrowWalletId) throw new Error('Escrow not assigned')

  // Idempotency lock
  if (!(global as any).__refundLocks) (global as any).__refundLocks = new Set<string>()
  const key = `${lobbyId}:${String(player.playerId).toLowerCase()}`
  if ((global as any).__refundLocks.has(key)) {
    return { ok: true, message: 'Refund already processing' }
  }
  (global as any).__refundLocks.add(key)
  setTimeout(() => { try { (global as any).__refundLocks.delete(key) } catch {} }, 30000)

  const escrow = evmEscrowService.getWallet(lobby.escrowWalletId as any)
  if (!escrow) throw new Error('Escrow wallet unavailable')
  const wei = ethers.parseUnits(String(lobby.amount), 18)
  const refundTo = String(((player as any)?.__fundingWallet || playerPublicKey) as string)
  const opId = `refund:${lobbyId}:${String(player.playerId).toLowerCase()}`
  const res = await sendIdempotentPayment({ opId, type: 'refund', fromEscrowId: escrow.id as any, to: refundTo, amountWei: wei })
  const txHash = res.txHash
  console.log('↩️ refund_executed', { lobbyId, player: String(player.playerId), amount: lobby.amount, currency: lobby.currency, escrowId: lobby.escrowWalletId, refundTo, txHash, reason: reason || null })
  try { (player as any).__refunded = true; player.hasWagered = false; player.isReady = false } catch {}
  try {
    await auditLogger.log({
      eventType: 'payout_executed',
      actorWallet: playerPublicKey,
      endpoint: 'server:processRefund',
      severity: 'info',
      metadata: { kind: 'refund', lobbyId, amount: lobby.amount, escrowId: lobby.escrowWalletId, txHash, reason, refundTo },
    })
  } catch {}
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
  return { ok: true, txHash }
}


