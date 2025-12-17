import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendIdempotentSolBundlePayment } from '@/lib/solana-payments'
import { getChain } from '@/lib/chain'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const providedAuth = request.headers.get('x-server-auth') || request.headers.get('authorization')
    const serverSecret = process.env.PAYOUT_SERVER_SECRET
    if (!serverSecret || !providedAuth || providedAuth.replace(/^Bearer\s+/i, '').trim() !== serverSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
    }

    const chain = getChain()
    if (chain !== 'solana') {
      return NextResponse.json({ error: 'Settlement runner only implemented for solana' }, { status: 501 })
    }

    const body = await request.json().catch(() => ({} as any))
    const maxRows = Math.max(1, Math.min(25, Number((body as any)?.maxRows || 5)))
    const matchId: string | null = (() => {
      try {
        const v = (body as any)?.matchId
        if (!v) return null
        const s = String(v)
        return s.length >= 8 ? s : null
      } catch {
        return null
      }
    })()

    const workerId = (() => {
      try {
        const explicit = process.env.SETTLEMENT_WORKER_ID
        if (explicit && explicit.trim()) return explicit.trim()
      } catch {}
      try {
        const host = process.env.HOSTNAME
        if (host && host.trim()) return host.trim()
      } catch {}
      return 'settlement_api'
    })()

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const claimCall = matchId
      ? supabase.rpc('claim_match_result_for_settlement', { p_match_id: matchId, p_claimed_by: workerId })
      : supabase.rpc('claim_match_results_for_settlement', { p_claimed_by: workerId, p_max_rows: maxRows })

    const { data: claimed, error: claimErr } = await claimCall

    if (claimErr) {
      return NextResponse.json({ error: 'Failed to claim settlement work', details: claimErr.message }, { status: 500 })
    }

    const rows: any[] = Array.isArray(claimed) ? claimed : []
    const settled: Array<{ matchId: string; txSig: string }> = []
    const failed: Array<{ matchId: string; error: string }> = []

    const houseWallet = process.env.NEXT_PUBLIC_ADMIN_WALLET
    if (!houseWallet) {
      return NextResponse.json({ error: 'House wallet not configured' }, { status: 500 })
    }

    const houseCutPercentage = parseFloat(process.env.HOUSE_CUT_PERCENTAGE || '0.04')

    for (const mr of rows) {
      const matchId = String(mr?.id || '')
      try {
        const winnerWallet = String(mr?.winner_wallet || '')
        const escrowWalletId = String(mr?.escrow_wallet_id || '') as any
        const prizeSol = Number(mr?.total_prize_pool || 0)
        if (!matchId || !escrowWalletId) {
          throw new Error('Invalid match record for settlement')
        }

        const shouldPayout = Boolean(winnerWallet && winnerWallet !== 'null' && prizeSol > 0)

        const ledgerRefundTransfers = await (async () => {
          try {
            const { data: rows } = await supabase
              .from('wager_deposits')
              .select('player_wallet, expected_lamports, status')
              .eq('match_result_id', matchId)
              .eq('status', 'confirmed')
              .limit(50)
            const byWallet = new Map<string, bigint>()
            for (const r of Array.isArray(rows) ? rows : []) {
              const w = String((r as any)?.player_wallet || '')
              const lamportsRaw = (r as any)?.expected_lamports
              if (!w || lamportsRaw === null || lamportsRaw === undefined) continue
              let lamports = 0n
              try {
                lamports = BigInt(String(lamportsRaw))
              } catch {
                continue
              }
              if (lamports <= 0n) continue
              byWallet.set(w, (byWallet.get(w) || 0n) + lamports)
            }

            const out: Array<{ to: string; lamports: number }> = []
            for (const [w, lamports] of byWallet.entries()) {
              if (lamports > BigInt(Number.MAX_SAFE_INTEGER)) {
                throw new Error('Refund amount too large')
              }
              out.push({ to: w, lamports: Number(lamports) })
            }
            return out
          } catch {
            return [] as Array<{ to: string; lamports: number }>
          }
        })()

        const participants = (() => {
          try {
            const p = (mr as any)?.participants
            if (!p) return []
            if (Array.isArray(p)) return p
            if (typeof p === 'string') return JSON.parse(p)
            return []
          } catch {
            return []
          }
        })()

        const refundTransfers = (() => {
          if (ledgerRefundTransfers.length > 0) return ledgerRefundTransfers
          const byWallet = new Map<string, number>()
          for (const p of Array.isArray(participants) ? participants : []) {
            const w = String((p as any)?.wallet || '')
            const amt = Number((p as any)?.wager_amount || 0)
            if (!w || !(amt > 0)) continue
            byWallet.set(w, (byWallet.get(w) || 0) + amt)
          }
          const out: Array<{ to: string; lamports: number }> = []
          for (const [w, amt] of byWallet.entries()) {
            out.push({ to: w, lamports: Math.round(amt * 1_000_000_000) })
          }
          return out
        })()

        let txSig: string | null = null
        let outcome: 'settled' | 'refunded' | 'canceled' = 'canceled'

        if (shouldPayout) {
          const totalLamports = Math.round(prizeSol * 1_000_000_000)
          const houseLamports = Math.floor(totalLamports * houseCutPercentage)
          const winnerLamports = Math.max(0, totalLamports - houseLamports)

          const opId = `settle:${matchId}:bundle_v1`
          const resp = await sendIdempotentSolBundlePayment({
            opId,
            type: 'payout',
            fromEscrowId: escrowWalletId,
            transfers: [
              { to: winnerWallet, lamports: winnerLamports },
              { to: houseWallet, lamports: houseLamports },
            ],
          })
          txSig = resp.txSig
          outcome = 'settled'

          try {
            await supabase
              .from('wager_deposits')
              .update({ status: 'consumed' })
              .eq('match_result_id', matchId)
              .eq('status', 'confirmed')
          } catch {}
        } else if (refundTransfers.length > 0) {
          const opId = `refund:${matchId}:bundle_v1`
          const resp = await sendIdempotentSolBundlePayment({
            opId,
            type: 'refund',
            fromEscrowId: escrowWalletId,
            transfers: refundTransfers,
          })
          txSig = resp.txSig
          outcome = 'refunded'

          try {
            await supabase
              .from('wager_deposits')
              .update({ status: 'refunded' })
              .eq('match_result_id', matchId)
              .eq('status', 'confirmed')
          } catch {}
        } else {
          outcome = 'canceled'
        }

        try {
          await supabase
            .from('match_results')
            .update({
              payout_processed: true,
              payout_tx_signature: txSig,
              payout_bundle_tx_signature: txSig,
              outcome,
              settlement_state: 'finalized',
              settlement_last_error: null,
            })
            .eq('id', matchId)
        } catch {}

        if (outcome === 'refunded') {
          try {
            const { data: existingRefund } = await supabase
              .from('transactions')
              .select('id')
              .eq('related_entity_id', matchId)
              .eq('transaction_type', 'refund')
              .limit(1)
            if (!Array.isArray(existingRefund) || existingRefund.length === 0) {
              for (const t of refundTransfers) {
                await supabase.from('transactions').insert({
                  wallet_address: t.to,
                  transaction_type: 'refund',
                  amount: t.lamports / 1_000_000_000,
                  related_entity_id: matchId,
                  description: 'Match refund',
                })
              }
            }
          } catch {}
        }

        if (outcome === 'settled') {
          try {
            const { data: existingWin } = await supabase
              .from('transactions')
              .select('id')
              .eq('related_entity_id', matchId)
              .eq('transaction_type', 'win')
              .limit(1)
            if (!Array.isArray(existingWin) || existingWin.length === 0) {
              await supabase.from('transactions').insert({
                wallet_address: winnerWallet,
                transaction_type: 'win',
                amount: prizeSol * (1 - houseCutPercentage),
                related_entity_id: matchId,
                description: 'Match winnings',
              })
            }
          } catch {}

          try {
            const { data: existingHouse } = await supabase
              .from('transactions')
              .select('id')
              .eq('related_entity_id', matchId)
              .eq('transaction_type', 'house_cut')
              .limit(1)
            if (!Array.isArray(existingHouse) || existingHouse.length === 0) {
              await supabase.from('transactions').insert({
                wallet_address: houseWallet,
                transaction_type: 'house_cut',
                amount: prizeSol * houseCutPercentage,
                related_entity_id: matchId,
                description: 'House cut',
              })
            }
          } catch {}
        }

        settled.push({ matchId, txSig: txSig || '' })
      } catch (e: any) {
        const msg = e?.message ? String(e.message) : String(e)
        failed.push({ matchId, error: msg })
        try {
          await supabase
            .from('match_results')
            .update({ settlement_state: 'retry', settlement_last_error: msg })
            .eq('id', matchId)
        } catch {}
      }
    }

    return NextResponse.json({ ok: true, claimed: rows.length, settled, failed })
  } catch (e: any) {
    const msg = e?.message ? String(e.message) : String(e)
    return NextResponse.json({ error: 'Settlement runner failed', details: msg }, { status: 500 })
  }
}
