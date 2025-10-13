import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
// Use server-held state
import { auditLogger } from '@/lib/audit-logger'
import { withRateLimit, RATE_LIMITS } from '@/lib/rate-limiter'
import { isBsc } from '@/lib/chain'
import { evmEscrowService } from '@/lib/evm-escrow-service'
import { ethers } from 'ethers'

function getLobbyMetaLocal(lobbyId: string) {
  const CATALOG = [
    { id: 'tutorial-1', amount: 0, currency: 'FREE', capacity: 8, matchType: 'tutorial', escrowWalletId: null as any },
    { id: 'lobby-0p005', amount: 0.005, currency: 'BNB', capacity: 8, matchType: 'ranked', escrowWalletId: null as any },
    { id: 'lobby-0p005-2', amount: 0.005, currency: 'BNB', capacity: 8, matchType: 'ranked', escrowWalletId: null as any },
    { id: 'lobby-0.01', amount: 0.01, currency: 'BNB', capacity: 8, matchType: 'ranked', escrowWalletId: null as any },
  ];
  return CATALOG.find(l => l.id === lobbyId) || null;
}

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
  const lobbyMeta = (global as any).getLobbyMeta ? (global as any).getLobbyMeta(lobbyId) : getLobbyMetaLocal(lobbyId)
  if (!lobbyMeta) throw new Error('Lobby not found')
  if (lobbyMeta.matchType === 'tutorial' || lobbyMeta.amount <= 0) {
    return { ok: true, message: 'No refund for free/tutorial matches' }
  }
  const rosterMap = (global as any).lobbyRoster?.get(lobbyId) || new Map()
  const player = rosterMap.get(String(playerPublicKey||'').toLowerCase())
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
  if (!lobbyMeta.escrowWalletId) throw new Error('Escrow not assigned')

  // Idempotency lock
  if (!(global as any).__refundLocks) (global as any).__refundLocks = new Set<string>()
  const key = `${lobbyId}:${String(player.playerId).toLowerCase()}`
  if ((global as any).__refundLocks.has(key)) {
    return { ok: true, message: 'Refund already processing' }
  }
  (global as any).__refundLocks.add(key)
  setTimeout(() => { try { (global as any).__refundLocks.delete(key) } catch {} }, 30000)

  const escrow = evmEscrowService.getWallet(lobbyMeta.escrowWalletId as any)
  if (!escrow) throw new Error('Escrow wallet unavailable')
  const wei = ethers.parseUnits(String(lobbyMeta.amount), 18)
  const refundTo = String(((player as any)?.__fundingWallet || playerPublicKey) as string)
  const txHash = await evmEscrowService.transferNative(refundTo, wei, escrow)
  console.log('↩️ refund_executed', { lobbyId, player: String(player.playerId), amount: lobbyMeta.amount, currency: lobbyMeta.currency, escrowId: lobbyMeta.escrowWalletId, refundTo, txHash, reason: reason || null })
  try { (player as any).__refunded = true; player.hasWagered = false; player.isReady = false } catch {}
  try {
    await auditLogger.log({
      eventType: 'wager_confirmed',
      actorWallet: playerPublicKey,
      endpoint: 'server:processRefund',
      severity: 'info',
      metadata: { lobbyId, amount: lobbyMeta.amount, escrowId: lobbyMeta.escrowWalletId, txHash, reason, refundTo },
    })
  } catch {}
  try {
    const io = (global as any).socketIo
    if (io) {
      io.to(lobbyId).emit('player_ready_status', { lobbyId, playerId: playerPublicKey, isReady: false })
      const roster = Array.from(((global as any).lobbyRoster?.get(lobbyId) || new Map()).values())
      const lobbyPlayers = roster.map((p: any) => ({
        playerId: p.playerId,
        username: p.username || p.playerId.slice(0, 8) + '...',
        chickenName: p.chickenName || 'Default',
        isReady: p.isAi ? true : Boolean(p.isReady),
        isAi: p.isAi || false
      }))
      io.to(lobbyId).emit('lobby_updated', {
        id: lobbyId,
        players: lobbyPlayers,
        capacity: lobbyMeta.capacity,
        amount: lobbyMeta.amount,
        currency: lobbyMeta.currency,
        matchType: lobbyMeta.matchType
      })
    }
  } catch {}
  return { ok: true, txHash }
}


