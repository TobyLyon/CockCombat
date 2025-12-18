import { createClient } from '@supabase/supabase-js'
import { Connection, clusterApiUrl } from '@solana/web3.js'
import escrowService from './escrow-service'
import crypto from 'crypto'

export interface SendSolArgs {
  opId: string
  type: 'payout' | 'refund' | 'house'
  fromEscrowId: 'A' | 'B' | 'C'
  to: string
  lamports: number
}

export interface SendSolBundleArgs {
  opId: string
  type: 'payout' | 'refund'
  fromEscrowId: 'A' | 'B' | 'C'
  transfers: Array<{ to: string; lamports: number }>
}

function getClaimedBy(): string {
  try {
    const explicit = process.env.SETTLEMENT_WORKER_ID
    if (explicit && explicit.trim()) return explicit.trim()
  } catch {}
  try {
    const host = process.env.HOSTNAME
    if (host && host.trim()) return host.trim()
  } catch {}
  try {
    return `pid:${process.pid}`
  } catch {
    return 'unknown'
  }
}

async function claimPaymentOpStrict(args: { supabase: any; opId: string; ttlSeconds: number }): Promise<boolean> {
  const { supabase, opId, ttlSeconds } = args
  try {
    const claimedBy = getClaimedBy()
    const { data, error } = await supabase.rpc('claim_payment_op', {
      p_op_id: opId,
      p_claimed_by: claimedBy,
      p_ttl_seconds: ttlSeconds,
    })
    if (error) return false
    return Boolean(data)
  } catch {
    return false
  }
}

function getSolanaConnection(): Connection {
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
  return new Connection(rpcUrl)
}

async function isConfirmedSignature(connection: Connection, signature: string): Promise<boolean> {
  try {
    const status = await connection.getSignatureStatus(signature, { searchTransactionHistory: true })
    const v = status?.value
    if (!v) return false
    if (v.err) return false
    return v.confirmationStatus === 'confirmed' || v.confirmationStatus === 'finalized'
  } catch {
    return false
  }
}

/**
 * Solana analogue of evm-payments.sendIdempotentPayment.
 * Uses Supabase table payments(op_id PK) to ensure exactly-once settlement.
 */
export async function sendIdempotentSolPayment(args: SendSolArgs): Promise<{ txSig: string }> {
  const { opId, type, fromEscrowId, to, lamports } = args

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const canDb = Boolean(supabaseUrl && supabaseServiceKey)
  const supabase = canDb ? createClient(supabaseUrl!, supabaseServiceKey!) : null

  // For real money, do not allow best-effort payouts/refunds without DB idempotency.
  // Keep local/dev flexibility.
  if (!supabase && process.env.NODE_ENV === 'production') {
    throw new Error('Solana payments idempotency unavailable (Supabase not configured)')
  }

  ;(global as any).__solPaymentsInFlight = (global as any).__solPaymentsInFlight || new Map<string, Promise<{ txSig: string }>>()
  const inFlight: Map<string, Promise<{ txSig: string }>> = (global as any).__solPaymentsInFlight

  const existingPromise = inFlight.get(opId)
  if (existingPromise) {
    return existingPromise
  }

  const connection = getSolanaConnection()
  escrowService.setConnection(connection)

  const dryRun = String(process.env.SOLANA_PAYMENTS_DRY_RUN || '').toLowerCase() === 'true'
  const fromWallet = escrowService.getWallet(fromEscrowId)
  const fromAddress = fromWallet ? fromWallet.publicKey.toBase58() : `dryrun_escrow_${fromEscrowId}`
  if (!fromWallet && !dryRun) throw new Error(`Escrow wallet ${fromEscrowId} unavailable`)
  const drySig = (() => {
    try {
      const h = crypto.createHash('sha256').update(`${opId}|${type}|${fromEscrowId}|${to}|${lamports}`).digest('hex').slice(0, 48)
      return `dryrun_${h}`
    } catch {
      return `dryrun_${Date.now()}_${Math.floor(Math.random() * 1e6)}`
    }
  })()

  const execPromise = (async () => {
    if (supabase) {
      try {
        const { data: existing } = await supabase
          .from('payments')
          .select('op_id, tx_hash, state')
          .eq('op_id', opId)
          .maybeSingle()

        if (existing && existing.tx_hash) {
          const sig = String(existing.tx_hash)
          if (await isConfirmedSignature(connection, sig)) {
            return { txSig: sig }
          }
          try {
            await supabase.from('payments').update({ state: 'pending', tx_hash: null }).eq('op_id', opId)
          } catch {}
        }
      } catch {}
    }

    if (supabase) {
      try {
        await supabase
          .from('payments')
          .upsert(
            {
              op_id: opId,
              type,
              from_address: fromAddress,
              to_address: to,
              token: 'SOL',
              amount_wei: String(lamports),
              state: 'pending',
              chain: 'solana',
            },
            { onConflict: 'op_id' }
          )
      } catch {}

      const ttlSeconds = 300
      const claimed = await claimPaymentOpStrict({ supabase, opId, ttlSeconds })
      if (!claimed) {
        const start = Date.now()
        const maxWaitMs = 20000
        const intervalMs = 400
        while (Date.now() - start < maxWaitMs) {
          try {
            const { data: row } = await supabase
              .from('payments')
              .select('tx_hash, state')
              .eq('op_id', opId)
              .maybeSingle()
            if (row && row.tx_hash) {
              const sig = String(row.tx_hash)
              if (await isConfirmedSignature(connection, sig)) return { txSig: sig }
            }
          } catch {}
          await new Promise((r) => setTimeout(r, intervalMs))
        }
        if (process.env.NODE_ENV === 'production') {
          throw new Error(`Payment lock unavailable for ${opId}`)
        }
      } else {
        try {
          await supabase
            .from('payments')
            .update({ state: 'in_progress', metadata: { attempt_id: `${Date.now()}_${Math.floor(Math.random() * 1e6)}` } })
            .eq('op_id', opId)
            .is('tx_hash', null)
        } catch {}
      }
    }

    const txSig = dryRun ? drySig : await escrowService.transferSOL(to, lamports, fromWallet)

    if (supabase) {
      try {
        await supabase.from('payments').update({ tx_hash: txSig, state: 'sent', locked_until: null }).eq('op_id', opId)
      } catch {}

      try {
        if (dryRun) {
          await supabase.from('payments').update({ state: 'confirmed_soft' }).eq('op_id', opId)
        } else if (await isConfirmedSignature(connection, txSig)) {
          await supabase.from('payments').update({ state: 'confirmed_soft' }).eq('op_id', opId)
        }
      } catch {}
    }

    return { txSig }
  })()

  inFlight.set(opId, execPromise)
  try {
    return await execPromise
  } finally {
    try {
      if (inFlight.get(opId) === execPromise) inFlight.delete(opId)
    } catch {}
  }
}

export async function sendIdempotentSolBundlePayment(args: SendSolBundleArgs): Promise<{ txSig: string }> {
  const { opId, type, fromEscrowId, transfers } = args

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const canDb = Boolean(supabaseUrl && supabaseServiceKey)
  const supabase = canDb ? createClient(supabaseUrl!, supabaseServiceKey!) : null

  if (!supabase && process.env.NODE_ENV === 'production') {
    throw new Error('Solana payments idempotency unavailable (Supabase not configured)')
  }

  ;(global as any).__solBundlePaymentsInFlight =
    (global as any).__solBundlePaymentsInFlight || new Map<string, Promise<{ txSig: string }>>()
  const inFlight: Map<string, Promise<{ txSig: string }>> = (global as any).__solBundlePaymentsInFlight

  const existingPromise = inFlight.get(opId)
  if (existingPromise) return existingPromise

  const connection = getSolanaConnection()
  escrowService.setConnection(connection)

  const dryRun = String(process.env.SOLANA_PAYMENTS_DRY_RUN || '').toLowerCase() === 'true'
  const fromWallet = escrowService.getWallet(fromEscrowId)
  const fromAddress = fromWallet ? fromWallet.publicKey.toBase58() : `dryrun_escrow_${fromEscrowId}`
  if (!fromWallet && !dryRun) throw new Error(`Escrow wallet ${fromEscrowId} unavailable`)

  const normalizedTransfers = (Array.isArray(transfers) ? transfers : [])
    .map((t) => ({ to: String((t as any)?.to || ''), lamports: Math.max(0, Math.floor(Number((t as any)?.lamports) || 0)) }))
    .filter((t) => t.to && t.lamports > 0)

  const totalLamports = normalizedTransfers.reduce((s, t) => s + t.lamports, 0)
  const drySig = (() => {
    try {
      const h = crypto
        .createHash('sha256')
        .update(`${opId}|${type}|${fromEscrowId}|bundle|${JSON.stringify(normalizedTransfers)}|${totalLamports}`)
        .digest('hex')
        .slice(0, 48)
      return `dryrun_${h}`
    } catch {
      return `dryrun_${Date.now()}_${Math.floor(Math.random() * 1e6)}`
    }
  })()

  const execPromise = (async () => {
    if (normalizedTransfers.length === 0) {
      throw new Error('No valid transfers provided')
    }

    if (supabase) {
      try {
        const { data: existing } = await supabase
          .from('payments')
          .select('op_id, tx_hash, state')
          .eq('op_id', opId)
          .maybeSingle()

        if (existing && existing.tx_hash) {
          const sig = String(existing.tx_hash)
          if (await isConfirmedSignature(connection, sig)) {
            return { txSig: sig }
          }
          try {
            await supabase.from('payments').update({ state: 'pending', tx_hash: null }).eq('op_id', opId)
          } catch {}
        }
      } catch {}
    }

    if (supabase) {
      try {
        await supabase
          .from('payments')
          .upsert(
            {
              op_id: opId,
              type,
              from_address: fromAddress,
              to_address: normalizedTransfers[0]?.to || null,
              token: 'SOL',
              amount_wei: String(totalLamports),
              state: 'pending',
              chain: 'solana',
              metadata: { transfers: normalizedTransfers },
            },
            { onConflict: 'op_id' }
          )
      } catch {}

      const ttlSeconds = 300
      const claimed = await claimPaymentOpStrict({ supabase, opId, ttlSeconds })
      if (!claimed) {
        const start = Date.now()
        const maxWaitMs = 20000
        const intervalMs = 400
        while (Date.now() - start < maxWaitMs) {
          try {
            const { data: row } = await supabase
              .from('payments')
              .select('tx_hash, state')
              .eq('op_id', opId)
              .maybeSingle()
            if (row && row.tx_hash) {
              const sig = String(row.tx_hash)
              if (await isConfirmedSignature(connection, sig)) return { txSig: sig }
            }
          } catch {}
          await new Promise((r) => setTimeout(r, intervalMs))
        }
        if (process.env.NODE_ENV === 'production') {
          throw new Error(`Payment lock unavailable for ${opId}`)
        }
      } else {
        try {
          await supabase
            .from('payments')
            .update({ state: 'in_progress', metadata: { transfers: normalizedTransfers, attempt_id: `${Date.now()}_${Math.floor(Math.random() * 1e6)}` } })
            .eq('op_id', opId)
            .is('tx_hash', null)
        } catch {}
      }
    }

    const txSig = dryRun
      ? drySig
      : await escrowService.transferSolBundle(
          normalizedTransfers.map((t) => ({ toAddress: t.to, lamports: t.lamports })),
          fromWallet
        )

    if (supabase) {
      try {
        await supabase.from('payments').update({ tx_hash: txSig, state: 'sent', locked_until: null }).eq('op_id', opId)
      } catch {}

      try {
        if (dryRun) {
          await supabase.from('payments').update({ state: 'confirmed_soft' }).eq('op_id', opId)
        } else if (await isConfirmedSignature(connection, txSig)) {
          await supabase.from('payments').update({ state: 'confirmed_soft' }).eq('op_id', opId)
        }
      } catch {}
    }

    return { txSig }
  })()

  inFlight.set(opId, execPromise)
  try {
    return await execPromise
  } finally {
    try {
      if (inFlight.get(opId) === execPromise) inFlight.delete(opId)
    } catch {}
  }
}
