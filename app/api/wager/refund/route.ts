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
        force: z.boolean().optional(),
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
  // Normalize player lookup to lowercase
  const playerPublicKeyLower = String(playerPublicKey||'').toLowerCase()
  let player = lobby.players.find(p => String(p.playerId||'').toLowerCase() === playerPublicKeyLower) as any
  // Fallback: consult socket-only roster map to recover player flags for wallets missing from lobby snapshot
  let rosterRec: any = null
  if (!player) {
    try {
      const map = ((global as any).lobbyRoster && (global as any).lobbyRoster.get?.(lobbyId)) || null
      if (map && map.get) {
        const key = playerPublicKeyLower
        rosterRec = map.get(key) || null
      }
    } catch {}
  }
  if (!player && !rosterRec) throw new Error('Player not found in lobby')

  const isCountdownActive = (() => { try { return Boolean((global as any).countdownActive && (global as any).countdownActive[lobbyId]) } catch { return false } })()
  const hasQueueSession = (() => { try { return Boolean((global as any).activeQueueForLobby && (global as any).activeQueueForLobby.get(lobbyId)) } catch { return false } })()
  // Allow server-triggered queue-time refunds (no-show / insufficient players) even with an active queue session
  const allowDuringQueue = reason === 'queue_no_show' || reason === 'insufficient_players'
  // Additional hard block: if the match session recently started or locked roster for this wallet, disallow refund
  const blockedByRecentMatch = (() => {
    try {
      const metaByWallet = (global as any).recentMatchMetaByWallet;
      const key = String(playerPublicKeyLower || '').toLowerCase();
      const meta = metaByWallet && metaByWallet.get ? metaByWallet.get(key) : null;
      // If meta exists for this wallet and lobby matches, and startAt is within last 2 minutes, block
      if (meta && meta.lobbyId === lobbyId) {
        const started = Number(meta.startAt || 0);
        if (started && (Date.now() - started) < 2 * 60 * 1000) return true;
      }
    } catch {}
    return false;
  })()
  if (!allowDuringQueue && (isCountdownActive || hasQueueSession || blockedByRecentMatch)) {
    return { error: 'Refund window closed' }
  }
  const hasWageredFlag = Boolean((player && player.hasWagered) || (rosterRec && rosterRec.hasWagered))
  const alreadyRefunded = Boolean(player && (player as any).__refunded)
  if (!hasWageredFlag || alreadyRefunded) {
    return { ok: true, message: 'Already refunded or no recorded wager' }
  }
  if (!isBsc()) throw new Error('Unsupported chain')
  // Ensure an escrow is assigned (mirror payout readiness auto-assign behavior)
  if (!lobby.escrowWalletId) {
    try {
      const wallet = evmEscrowService.getNextWallet()
      if (wallet && wallet.id) {
        lobby.escrowWalletId = wallet.id as any
        // Best-effort: also store on in-memory lobby for subsequent ops
      }
    } catch {}
  }
  if (!lobby.escrowWalletId) throw new Error('Escrow not assigned')

  // Idempotency lock
  if (!(global as any).__refundLocks) (global as any).__refundLocks = new Set<string>()
  const key = `${lobbyId}:${playerPublicKeyLower}`
  if ((global as any).__refundLocks.has(key)) {
    return { ok: true, message: 'Refund already processing' }
  }
  (global as any).__refundLocks.add(key)
  setTimeout(() => { try { (global as any).__refundLocks.delete(key) } catch {} }, 30000)

  const escrow = evmEscrowService.getWallet(lobby.escrowWalletId as any)
  if (!escrow) throw new Error('Escrow wallet unavailable')
  const wei = ethers.parseUnits(String(lobby.amount), 18)
  // Prefer original funding EVM address when known, fallback to the public key (wallet)
  const refundTo = String((((player as any)?.__fundingWallet) || (rosterRec && (rosterRec as any).__fundingWallet) || playerPublicKeyLower) as string)
  const baseOpId = `refund:${lobbyId}:${playerPublicKeyLower}`
  const opId = baseOpId
  const playerIdForLog = (() => { try { return String((player as any)?.playerId || rosterRec?.playerId || playerPublicKeyLower).toLowerCase() } catch { return playerPublicKeyLower } })()
  console.log('[REFUND][REQUEST]', { opId, lobbyId, player: playerIdForLog, escrowId: escrow.id, refundTo, wei: wei.toString(), hasWageredFlag, alreadyRefunded, reason })
  const res = await sendIdempotentPayment({ opId, type: 'refund', fromEscrowId: escrow.id as any, to: refundTo, amountWei: wei })
  const txHash = res.txHash
  console.log('[REFUND][SENT]', { opId, txHash })
  console.log('↩️ refund_executed', { lobbyId, player: playerIdForLog, amount: lobby.amount, currency: lobby.currency, escrowId: lobby.escrowWalletId, refundTo, txHash, reason: reason || null })
  try { if (player) { (player as any).__refunded = true; player.hasWagered = false; player.isReady = false } } catch {}
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


