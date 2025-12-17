import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { lobbies } from '@/lib/lobbies'
import { auditLogger } from '@/lib/audit-logger'
import { withRateLimit, RATE_LIMITS } from '@/lib/rate-limiter'
import { isBsc } from '@/lib/chain'
import { evmEscrowService } from '@/lib/evm-escrow-service'
import { sendIdempotentPayment } from '@/lib/evm-payments'
import { ethers } from 'ethers'
import escrowService from '@/lib/escrow-service'
import { Connection, LAMPORTS_PER_SOL, clusterApiUrl } from '@solana/web3.js'
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
  if (lobby.amount <= 0) {
    return { ok: true, message: 'No refund for free matches' }
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
  // Determine whether the player actually has a recorded wager
  let hasWageredFlag = Boolean((player && player.hasWagered) || (rosterRec && rosterRec.hasWagered))
  if (!hasWageredFlag) {
    // Fallback: check DB for a confirmed wager signature for this lobby (survives restarts)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const canDb = Boolean(supabaseUrl && supabaseServiceKey)
    const walletRaw = String(playerPublicKey || '')
    const walletLower = walletRaw.toLowerCase()
    const waitMs = Math.max(0, parseInt(String(process.env.REFUND_CONFIRM_WAIT_MS || ''), 10) || 12000)
    const pollMs = 1200
    const deadline = Date.now() + waitMs
    const checkOnce = async () => {
      try {
        if (!canDb) return false
        const supabase = createClient(supabaseUrl!, supabaseServiceKey!)
        const { data } = await supabase
          .from('used_signatures')
          .select('signature')
          .or(`wallet_address.eq.${walletRaw},wallet_address.eq.${walletLower}`)
          .eq('endpoint', '/api/wager/confirm')
          .contains('metadata', { lobbyId })
          .limit(1)
        return Array.isArray(data) && data.length > 0
      } catch {
        return false
      }
    }
    // Immediate check
    if (await checkOnce()) {
      hasWageredFlag = true
    } else if (waitMs > 0) {
      // Briefly wait for confirm record to be persisted
      while (!hasWageredFlag && Date.now() < deadline) {
        await new Promise(r => setTimeout(r, pollMs))
        if (await checkOnce()) { hasWageredFlag = true; break }
      }
    }
  }
  const alreadyRefunded = Boolean(player && (player as any).__refunded)
  if (!hasWageredFlag || alreadyRefunded) {
    return { ok: true, message: 'Already refunded or no recorded wager' }
  }
  // Idempotency lock
  if (!(global as any).__refundLocks) (global as any).__refundLocks = new Set<string>()
  const key = `${lobbyId}:${playerPublicKeyLower}`
  if ((global as any).__refundLocks.has(key)) {
    return { ok: true, message: 'Refund already processing' }
  }
  (global as any).__refundLocks.add(key)
  setTimeout(() => { try { (global as any).__refundLocks.delete(key) } catch {} }, 30000)

  // Chain-specific refund execution
  if (isBsc()) {
    // Ensure an escrow is assigned
    if (!lobby.escrowWalletId) {
      try {
        const wallet = evmEscrowService.getNextWallet()
        if (wallet && wallet.id) {
          lobby.escrowWalletId = wallet.id as any
        }
      } catch {}
    }
    if (!lobby.escrowWalletId) throw new Error('Escrow not assigned')
    const escrow = evmEscrowService.getWallet(lobby.escrowWalletId as any)
    if (!escrow) throw new Error('Escrow wallet unavailable')
    const wei = ethers.parseUnits(String(lobby.amount), 18)
    const refundTo = String((((player as any)?.__fundingWallet) || (rosterRec && (rosterRec as any).__fundingWallet) || playerPublicKeyLower) as string)
    // Continue with EVM path below
    
    // Build an incident-scoped opId using the confirmed wager signature so multiple distinct refunds
    // (across separate wager sessions) do not collide on idempotency.
    let incidentSig: string | null = null
    let incidentSigCreatedAt: string | null = null
    try { if (!incidentSig && player && (player as any).__lastWagerSig) incidentSig = String((player as any).__lastWagerSig) } catch {}
    try { if (!incidentSig && rosterRec && (rosterRec as any).lastWagerSig) incidentSig = String((rosterRec as any).lastWagerSig) } catch {}
    if (!incidentSig) {
      // Query Supabase used_signatures to fetch the last confirm signature for this wallet+lobby
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (supabaseUrl && supabaseServiceKey) {
          const supabase = createClient(supabaseUrl, supabaseServiceKey)
          const walletRaw = String(playerPublicKey || '')
          const walletLower = walletRaw.toLowerCase()
          const { data } = await supabase
            .from('used_signatures')
            .select('signature, created_at')
            .or(`wallet_address.eq.${walletRaw},wallet_address.eq.${walletLower}`)
            .eq('endpoint', '/api/wager/confirm')
            .contains('metadata', { lobbyId })
            .order('created_at', { ascending: false })
            .limit(1)
          if (Array.isArray(data) && data.length > 0) {
            incidentSig = String(data[0].signature)
            incidentSigCreatedAt = String(data[0].created_at || '')
          }
        }
      } catch {}
    } else if (!incidentSigCreatedAt) {
      // We know the signature from memory; fetch its created_at for ordering/idempotency
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (supabaseUrl && supabaseServiceKey) {
          const supabase = createClient(supabaseUrl, supabaseServiceKey)
          const { data } = await supabase
            .from('used_signatures')
            .select('created_at')
            .eq('endpoint', '/api/wager/confirm')
            .eq('signature', incidentSig)
            .limit(1)
          if (Array.isArray(data) && data.length > 0) {
            incidentSigCreatedAt = String(data[0].created_at || '')
          }
        }
      } catch {}
    }
    const baseOpId = `refund:${lobbyId}:${playerPublicKeyLower}`
    const timeSuffix = (!incidentSig && incidentSigCreatedAt) ? `t${Date.parse(incidentSigCreatedAt) || 0}` : null
    const opId = incidentSig ? `${baseOpId}:${incidentSig}` : (timeSuffix ? `${baseOpId}:${timeSuffix}` : baseOpId)
    const playerIdForLog = (() => { try { return String((player as any)?.playerId || rosterRec?.playerId || playerPublicKeyLower).toLowerCase() } catch { return playerPublicKeyLower } })()

    console.log('[REFUND][REQUEST]', { opId, lobbyId, player: playerIdForLog, escrowId: escrow.id, refundTo, wei: wei.toString(), hasWageredFlag, alreadyRefunded, reason })
    try {
      const res = await sendIdempotentPayment({ opId, type: 'refund', fromEscrowId: escrow.id as any, to: refundTo, amountWei: wei })
      const txHash = res.txHash
      console.log('[REFUND][SENT]', { opId, txHash })
      console.log('↩️ refund_executed', { lobbyId, player: playerIdForLog, amount: lobby.amount, currency: lobby.currency, escrowId: lobby.escrowWalletId, refundTo, txHash, reason })
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
    } catch (e: any) {
      console.warn('[REFUND][FAILED]', { opId, error: e?.message || String(e) })
      throw e
    }
  } else {
    // Solana: transfer back from escrow to player (server-signed)
    if (!lobby.escrowWalletId) throw new Error('Escrow not assigned')
    const network = (process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet') as 'devnet' | 'testnet' | 'mainnet-beta'
    const base = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl(network)
    const rpcUrl = (() => {
      try {
        const rebate = process.env.NEXT_PUBLIC_HELIUS_REBATE_ADDRESS || ''
        if (network === 'mainnet-beta' && rebate) {
          const sep = base.includes('?') ? '&' : '?'
          return `${base}${sep}rebate-address=${encodeURIComponent(rebate)}`
        }
      } catch {}
      return base
    })()
    const connection = new Connection(rpcUrl)
    escrowService.setConnection(connection)
    const lamports = Math.round(lobby.amount * LAMPORTS_PER_SOL)
    try {
      // Build an incident-scoped opId using the confirmed wager signature when available.
      let incidentSig: string | null = null
      try { if (!incidentSig && player && (player as any).__lastWagerSig) incidentSig = String((player as any).__lastWagerSig) } catch {}
      try { if (!incidentSig && rosterRec && (rosterRec as any).lastWagerSig) incidentSig = String((rosterRec as any).lastWagerSig) } catch {}
      if (!incidentSig) {
        // Best-effort DB lookup for last confirm signature (survives restarts)
        try {
          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
          const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
          if (supabaseUrl && supabaseServiceKey) {
            const supabase = createClient(supabaseUrl, supabaseServiceKey)
            const walletRaw = String(playerPublicKey || '')
            const walletLower = walletRaw.toLowerCase()
            const { data } = await supabase
              .from('used_signatures')
              .select('signature, created_at')
              .or(`wallet_address.eq.${walletRaw},wallet_address.eq.${walletLower}`)
              .eq('endpoint', '/api/wager/confirm')
              .contains('metadata', { lobbyId })
              .order('created_at', { ascending: false })
              .limit(1)
            if (Array.isArray(data) && data.length > 0) {
              incidentSig = String(data[0].signature)
            }
          }
        } catch {}
      }
      const opId = incidentSig ? `sol:refund:${lobbyId}:${playerPublicKeyLower}:${incidentSig}` : `sol:refund:${lobbyId}:${playerPublicKeyLower}`

      const res = await sendIdempotentSolPayment({
        opId,
        type: 'refund',
        fromEscrowId: lobby.escrowWalletId as any,
        to: playerPublicKey,
        lamports,
      })
      const sig = res.txSig
      try { if (player) { (player as any).__refunded = true; player.hasWagered = false; player.isReady = false } } catch {}
      return { ok: true, txHash: sig }
    } catch (e: any) {
      console.warn('[REFUND][FAILED][SOL]', { lobbyId, player: playerPublicKeyLower, error: e?.message || String(e) })
      throw e
    }
  }
}


