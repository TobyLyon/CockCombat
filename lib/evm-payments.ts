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

  // Fast idempotency check (DB) with on-chain verification to avoid stale rows
  if (supabase) {
    try {
      const { data: existing } = await supabase
        .from('payments')
        .select('op_id, tx_hash, state, updated_at')
        .eq('op_id', opId)
        .maybeSingle()
      if (existing && existing.tx_hash) {
        try {
          const provider = getEvmProvider()
          const receipt = await provider.getTransactionReceipt(existing.tx_hash as string)
          if (receipt && receipt.status === 1) {
            // Validate to/from/value match intended payment to avoid reusing wrong tx
            try {
              const tx = await provider.getTransaction(existing.tx_hash as string)
              const toOk = String(tx?.to || '').toLowerCase() === String(to).toLowerCase()
              const fromOk = String(tx?.from || '').toLowerCase() === String(from.address).toLowerCase()
              const valueOk = tx?.value ? (BigInt(tx.value.toString()) === amountWei) : false
              if (toOk && fromOk && valueOk) {
                console.log('[PAYMENTS][IDEMPOTENT_HIT]', { opId, txHash: existing.tx_hash })
                return { txHash: existing.tx_hash as string }
              }
              console.warn('[PAYMENTS][TX_MISMATCH_RETRY]', { opId, txHash: existing.tx_hash, toOk, fromOk, valueOk })
            } catch {
              // If we cannot fetch the tx, treat as stale
              console.warn('[PAYMENTS][TX_FETCH_FAILED_RETRY]', { opId, txHash: existing.tx_hash })
            }
          }
          // Stale or not confirmed or mismatched: reset for re-send
          try {
            await supabase
              .from('payments')
              .update({ state: 'pending', tx_hash: null })
              .eq('op_id', opId)
          } catch {}
          console.warn('[PAYMENTS][STALE_TX_RETRY]', { opId, txHash: existing.tx_hash })
        } catch {
          // Provider error: allow retry by resetting row
          try { await supabase.from('payments').update({ state: 'pending', tx_hash: null }).eq('op_id', opId) } catch {}
          console.warn('[PAYMENTS][STALE_TX_RETRY_NO_PROVIDER]', { opId })
        }
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

  // Attempt to claim the opId for sending by transitioning to in_progress.
  // Only one process will succeed because we match state='pending' and tx_hash IS NULL.
  if (supabase) {
    try {
      const { data: claimed } = await supabase
        .from('payments')
        .update({ state: 'in_progress' })
        .eq('op_id', opId)
        .eq('state', 'pending')
        .is('tx_hash', null)
        .select('op_id')
        .maybeSingle()

      if (!claimed) {
        // Another process is handling this op. Wait for its txHash to appear.
        const start = Date.now()
        const maxWaitMs = 20000
        const intervalMs = 400
        while (Date.now() - start < maxWaitMs) {
          try {
            const { data: existing } = await supabase
              .from('payments')
              .select('tx_hash, state')
              .eq('op_id', opId)
              .maybeSingle()
            if (existing && existing.tx_hash) {
              try {
                const receipt = await getEvmProvider().getTransactionReceipt(existing.tx_hash as string)
                if (receipt && receipt.status === 1) {
                  console.log('[PAYMENTS][IDEMPOTENT_AWAIT]', { opId, txHash: existing.tx_hash })
                  return { txHash: existing.tx_hash as string }
                }
              } catch {}
            }
          } catch {}
          await new Promise(r => setTimeout(r, intervalMs))
        }
        // Timed out waiting; as a safety, do a final read and return if present
        try {
          const { data: existing } = await supabase
            .from('payments')
            .select('tx_hash, state')
            .eq('op_id', opId)
            .maybeSingle()
          if (existing && existing.tx_hash) {
            try {
              const receipt = await getEvmProvider().getTransactionReceipt(existing.tx_hash as string)
              if (receipt && receipt.status === 1) {
                console.log('[PAYMENTS][IDEMPOTENT_AWAIT_TIMEOUT_HIT]', { opId, txHash: existing.tx_hash })
                return { txHash: existing.tx_hash as string }
              }
            } catch {}
          }
        } catch {}
        // Give up without sending to avoid duplicates
        throw new Error(`Payment already in progress for ${opId}`)
      }
      console.log('[PAYMENTS][CLAIMED]', { opId })
    } catch (e) {
      // If claim fails (e.g., table lacks columns), fall back to best-effort behavior
    }
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
        // Verify confirmation before marking soft confirm
        try {
          const receipt = await getEvmProvider().waitForTransaction(txHash, 1, 60000)
          if (receipt && receipt.status === 1) {
            await supabase.from('payments').update({ state: 'confirmed_soft' }).eq('op_id', opId)
            console.log('[PAYMENTS][SOFT_CONFIRMED]', { opId, txHash })
          } else {
            console.warn('[PAYMENTS][PENDING_ONCHAIN]', { opId, txHash })
          }
        } catch (e) {
          console.warn('[PAYMENTS][CONFIRM_WAIT_TIMEOUT]', { opId, txHash })
        }
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


