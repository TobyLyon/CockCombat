import { createClient } from '@supabase/supabase-js'
import { ethers } from 'ethers'
import { getEvmProvider } from './evm-config'
import { evmEscrowService } from './evm-escrow-service'

type EscrowId = 'A' | 'B' | 'C'

export interface SendArgs {
  opId: string
  type: 'payout' | 'refund' | 'house'
  fromEscrowId: EscrowId
  to: string
  amountWei: bigint
}

/**
 * Idempotent payment sender backed by Supabase tables:
 * - payments(op_id PK)
 * - escrow_wallets(id, address)
 *
 * Notes:
 * - Uses per-escrow serialization already present in evmEscrowService.transferNative
 * - Persists idempotency rows (pending -> sent -> confirmed_soft)
 */
export async function sendIdempotentPayment(args: SendArgs) {
  const { opId, type, fromEscrowId, to, amountWei } = args

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const canDb = Boolean(supabaseUrl && supabaseServiceKey)
  const supabase = canDb ? createClient(supabaseUrl!, supabaseServiceKey!) : null

  // Process-wide in-flight guard to prevent duplicate sends for the same opId
  // even if multiple callers race. Ensures only one transferNative executes.
  ;(global as any).__paymentsInFlight = (global as any).__paymentsInFlight || new Map<string, Promise<{ txHash: string }>>()
  const inFlight: Map<string, Promise<{ txHash: string }>> = (global as any).__paymentsInFlight

  // If an identical op is already executing, wait for it and return the same result
  const existingPromise = inFlight.get(opId)
  if (existingPromise) {
    try {
      const res = await existingPromise
      console.log('[PAYMENTS][IDEMPOTENT_AWAIT]', { opId, txHash: res.txHash })
      return res
    } catch (e) {
      // fall through to attempt fresh execution; entry should be cleared by finally below
    }
  }

  // Resolve escrow wallet
  const from = evmEscrowService.getWallet(fromEscrowId)
  if (!from) throw new Error(`Escrow wallet ${fromEscrowId} unavailable`)

  // Fast idempotency check (DB)
  if (supabase) {
    try {
      const { data: existing } = await supabase
        .from('payments')
        .select('op_id, tx_hash, state')
        .eq('op_id', opId)
        .maybeSingle()
      if (existing && existing.tx_hash) {
        console.log('[PAYMENTS][IDEMPOTENT_HIT]', { opId, txHash: existing.tx_hash })
        return { txHash: existing.tx_hash as string }
      }
    } catch {}
  }

  // Create/update idempotency row (pending)
  if (supabase) {
    try {
      await supabase.from('payments').upsert({
        op_id: opId,
        type,
        from_address: from.address,
        to_address: to,
        token: 'BNB',
        amount_wei: amountWei.toString(),
        state: 'pending',
      }, { onConflict: 'op_id' })
      console.log('[PAYMENTS][PENDING]', { opId, from: from.address, to, amountWei: amountWei.toString() })
    } catch {}
  }

  // Define the execution as a promise and store it in in-flight map before sending
  const execPromise = (async () => {
    // Re-check DB just before sending to reduce race window (two processes)
    if (supabase) {
      try {
        const { data: existing } = await supabase
          .from('payments')
          .select('op_id, tx_hash, state')
          .eq('op_id', opId)
          .maybeSingle()
        if (existing && existing.tx_hash) {
          console.log('[PAYMENTS][IDEMPOTENT_HIT_BEFORE_SEND]', { opId, txHash: existing.tx_hash })
          return { txHash: existing.tx_hash as string }
        }
      } catch {}
    }

    // Send via escrow service (per-wallet serialized)
    const txHash = await evmEscrowService.transferNative(to, amountWei, from)
    console.log('[PAYMENTS][SENT]', { opId, txHash })

    // Mark sent + soft confirm, and upsert wallet row
    if (supabase) {
      try {
        await supabase.from('payments').update({ tx_hash: txHash, state: 'sent' }).eq('op_id', opId)
        await supabase.from('payments').update({ state: 'confirmed_soft' }).eq('op_id', opId)
        console.log('[PAYMENTS][SOFT_CONFIRMED]', { opId, txHash })
        await supabase.from('escrow_wallets').upsert({ id: from.id, address: from.address })
      } catch {}
    }

    return { txHash }
  })()

  inFlight.set(opId, execPromise)
  try {
    const result = await execPromise
    return result
  } finally {
    // Clear in-flight regardless of success/failure to avoid leaks
    try { if (inFlight.get(opId) === execPromise) inFlight.delete(opId) } catch {}
  }
}


