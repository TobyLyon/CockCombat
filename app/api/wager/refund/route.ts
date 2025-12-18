import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { lobbies } from '@/lib/lobbies'
import { auditLogger } from '@/lib/audit-logger'
import { withRateLimit, RATE_LIMITS } from '@/lib/rate-limiter'
import { isBsc } from '@/lib/chain'
import { evmEscrowService } from '@/lib/evm-escrow-service'
import { sendIdempotentPayment } from '@/lib/evm-payments'
import escrowService from '@/lib/escrow-service'
import { Connection, clusterApiUrl } from '@solana/web3.js'
import { createClient } from '@supabase/supabase-js'
import { sendIdempotentSolPayment } from '@/lib/solana-payments'

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
      const provided = (() => {
        try {
          const h = req.headers.get('x-server-auth') || req.headers.get('authorization')
          if (h) return h.replace(/^Bearer\s+/i, '').trim()
        } catch {}
        return String(__serverOnlyToken || '')
      })()
      if (!expected || provided !== expected) {
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
  if (lobby.amount <= 0) {
    return { ok: true, message: 'No refund for free matches' }
  }
  const playerPublicKeyRaw = String(playerPublicKey || '')
  const isEvmWallet = /^0x[0-9a-fA-F]{40}$/.test(playerPublicKeyRaw)
  const playerKeyForMatch = isEvmWallet ? playerPublicKeyRaw.toLowerCase() : playerPublicKeyRaw
  const playerKeyLower = String(playerKeyForMatch || '').toLowerCase()
  let player = lobby.players.find(p => String(p.playerId || '').toLowerCase() === playerKeyLower) as any

  const isCountdownActive = (() => { try { return Boolean((global as any).countdownActive && (global as any).countdownActive[lobbyId]) } catch { return false } })()
  const hasQueueSession = (() => { try { return Boolean((global as any).activeQueueForLobby && (global as any).activeQueueForLobby.get(lobbyId)) } catch { return false } })()
  // Allow server-triggered queue-time refunds (no-show / insufficient players) even with an active queue session
  const allowDuringQueue = reason === 'queue_no_show' || reason === 'insufficient_players'
  // Additional hard block: if the match session recently started or locked roster for this wallet, disallow refund
  const blockedByRecentMatch = (() => {
    try {
      const metaByWallet = (global as any).recentMatchMetaByWallet;
      const key = String(playerKeyLower || '').toLowerCase();
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
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const canDb = Boolean(supabaseUrl && supabaseServiceKey)
  if (!canDb && process.env.NODE_ENV === 'production') {
    throw new Error('Supabase not configured')
  }

  const supabase = canDb ? createClient(supabaseUrl!, supabaseServiceKey!) : null
  const deposit = await (async () => {
    try {
      if (!supabase) return null
      const candidates = isEvmWallet ? [playerPublicKeyRaw, playerPublicKeyRaw.toLowerCase()] : [playerPublicKeyRaw]
      const { data } = await supabase
        .from('wager_deposits')
        .select('intent_id, escrow_wallet_id, expected_lamports, deposit_signature, status')
        .eq('lobby_id', lobbyId)
        .in('player_wallet', candidates)
        .eq('status', 'confirmed')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      return data as any
    } catch {
      return null
    }
  })()

  if (!deposit || !deposit.intent_id || !deposit.escrow_wallet_id || deposit.expected_lamports === null || deposit.expected_lamports === undefined) {
    return { ok: true, message: 'Already refunded or no recorded wager' }
  }

  const escrowId = String(deposit.escrow_wallet_id || '') as any
  let expectedLamports = BigInt(0)
  try { expectedLamports = BigInt(String(deposit.expected_lamports)) } catch { expectedLamports = BigInt(0) }
  if (expectedLamports <= BigInt(0)) {
    return { ok: true, message: 'Already refunded or no recorded wager' }
  }

  const intentId = String(deposit.intent_id)

  // Chain-specific refund execution
  if (isBsc()) {
    const escrow = evmEscrowService.getWallet(escrowId)
    if (!escrow) throw new Error('Escrow wallet unavailable')
    const wei = expectedLamports
    const refundTo = String(((player as any)?.__fundingWallet) || playerKeyLower)
    // Continue with EVM path below
    const opId = `refund:intent:${intentId}`
    const playerIdForLog = (() => { try { return String((player as any)?.playerId || playerKeyLower).toLowerCase() } catch { return playerKeyLower } })()

    console.log('[REFUND][REQUEST]', { opId, lobbyId, player: playerIdForLog, escrowId: escrow.id, refundTo, wei: wei.toString(), reason })
    try {
      const res = await sendIdempotentPayment({ opId, type: 'refund', fromEscrowId: escrow.id as any, to: refundTo, amountWei: wei })
      const txHash = res.txHash
      console.log('[REFUND][SENT]', { opId, txHash })
      console.log('↩️ refund_executed', { lobbyId, player: playerIdForLog, amount: lobby.amount, currency: lobby.currency, escrowId: lobby.escrowWalletId, refundTo, txHash, reason })
      try { if (player) { (player as any).__refunded = true; player.hasWagered = false; player.isReady = false } } catch {}
      try {
        if (supabase) {
          await supabase
            .from('wager_deposits')
            .update({ status: 'refunded' })
            .eq('intent_id', intentId)
            .eq('status', 'confirmed')
        }
      } catch {}
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
    } catch (e: any) {
      console.warn('[REFUND][FAILED]', { opId, error: e?.message || String(e) })
      throw e
    }
  } else {
    // Solana: transfer back from escrow to player (server-signed)
    if (!escrowId) throw new Error('Escrow not assigned')
    const network = (process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet') as 'devnet' | 'testnet' | 'mainnet-beta'
    const base = process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl(network)
    const rpcUrl = (() => {
      try {
        const rebate = process.env.NEXT_PUBLIC_HELIUS_REBATE_ADDRESS || ''
        const isHelius = /helius/i.test(String(base || ''))
        if (network === 'mainnet-beta' && rebate && isHelius) {
          const sep = base.includes('?') ? '&' : '?'
          return `${base}${sep}rebate-address=${encodeURIComponent(rebate)}`
        }
      } catch {}
      return base
    })()
    const connection = new Connection(rpcUrl)
    escrowService.setConnection(connection)
    if (expectedLamports > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error('Refund amount too large')
    }
    const lamports = Number(expectedLamports)
    try {
      const opId = `sol:refund:intent:${intentId}`

      const res = await sendIdempotentSolPayment({
        opId,
        type: 'refund',
        fromEscrowId: escrowId,
        to: playerPublicKeyRaw,
        lamports,
      })
      const sig = res.txSig
      try { if (player) { (player as any).__refunded = true; player.hasWagered = false; player.isReady = false } } catch {}
      try {
        if (supabase) {
          await supabase
            .from('wager_deposits')
            .update({ status: 'refunded' })
            .eq('intent_id', intentId)
            .eq('status', 'confirmed')
        }
      } catch {}
      return { ok: true, txHash: sig }
    } catch (e: any) {
      console.warn('[REFUND][FAILED][SOL]', { lobbyId, player: playerKeyLower, error: e?.message || String(e) })
      throw e
    }
  }
}


