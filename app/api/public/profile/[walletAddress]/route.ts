import { NextResponse } from 'next/server'
import { getWriteClient } from '@/lib/supabase'

type MatchResultRow = {
  id: string
  lobby_id: string
  escrow_wallet_id: string | null
  match_started_at: string
  match_ended_at: string | null
  winner_wallet: string | null
  total_prize_pool: number
  participants: any
  status: string
  payout_processed: boolean
  payout_tx_signature: string | null
  payout_bundle_tx_signature: string | null
  outcome: string | null
  settlement_state: string | null
  match_session_id: string | null
  updated_at: string
  created_at: string
}

type WagerDepositRow = {
  id: string
  intent_id: string
  match_result_id: string | null
  match_session_id: string | null
  lobby_id: string
  player_wallet: string
  escrow_wallet_id: string
  expected_lamports: number | string
  deposit_signature: string | null
  slot: number | null
  commitment: string | null
  status: string
  created_at: string
  updated_at: string
}

type PaymentRow = {
  op_id: string
  type: string
  from_address: string | null
  to_address: string | null
  token: string
  amount_wei: string
  tx_hash: string | null
  state: string
  chain: string | null
  match_result_id: string | null
  match_session_id: string | null
  metadata: any
  created_at: string
  updated_at: string
}

type PaymentRowForWallet = PaymentRow & {
  wallet_lamports: number
}

function uniqById<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const r of rows) {
    if (!r?.id) continue
    if (seen.has(r.id)) continue
    seen.add(r.id)
    out.push(r)
  }
  return out
}

function parseLamports(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function parseTransfersLamports(payment: PaymentRow, walletAddress: string): number {
  try {
    const w = String(walletAddress || '')
    const wLower = w.toLowerCase()
    const meta = (payment as any)?.metadata
    const transfers = Array.isArray(meta?.transfers) ? meta.transfers : []
    let sum = 0
    for (const t of transfers) {
      const to = String((t as any)?.to || '')
      const lamports = Math.max(0, Math.floor(Number((t as any)?.lamports) || 0))
      if (!to || !lamports) continue
      if (to === w || to.toLowerCase() === wLower) sum += lamports
    }
    if (sum > 0) return sum
  } catch {}
  try {
    const to = String((payment as any)?.to_address || '')
    const lamports = Math.max(0, Math.floor(Number((payment as any)?.amount_wei) || 0))
    if (!to || !lamports) return 0
    if (to === walletAddress || to.toLowerCase() === String(walletAddress || '').toLowerCase()) return lamports
  } catch {}
  return 0
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ walletAddress: string }> }
) {
  try {
    const { walletAddress: walletRaw } = await params
    const walletAddress = String(walletRaw || '').trim()
    const walletLower = walletAddress.toLowerCase()

    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 })
    }

    // Prevent PostgREST filter injection since we interpolate walletAddress into `.or(...)`.
    // Accept a broad, chain-agnostic wallet format: alphanumeric only.
    if (!/^[0-9a-zA-Z]+$/.test(walletAddress)) {
      return NextResponse.json({ error: 'Invalid wallet address format' }, { status: 400 })
    }

    if (walletAddress.length > 128) {
      return NextResponse.json({ error: 'Wallet address is too long' }, { status: 400 })
    }

    const url = new URL(request.url)
    const limitMatches = Math.max(1, Math.min(50, Number(url.searchParams.get('limitMatches') || 25)))
    const limitDeposits = Math.max(1, Math.min(100, Number(url.searchParams.get('limitDeposits') || 50)))
    const limitPayments = Math.max(1, Math.min(100, Number(url.searchParams.get('limitPayments') || 100)))

    const db = getWriteClient()
    if (!db) {
      return NextResponse.json({ error: 'Database client unavailable' }, { status: 500 })
    }

    const { data: profile } = await db
      .from('profiles')
      .select('*')
      .ilike('wallet_address', walletAddress)
      .maybeSingle()

    const baseMatchSelect =
      'id,lobby_id,escrow_wallet_id,match_started_at,match_ended_at,winner_wallet,total_prize_pool,participants,game_data,status,payout_processed,payout_tx_signature,payout_bundle_tx_signature,outcome,settlement_state,match_session_id,updated_at,created_at'

    const winnerQuery = await db
      .from('match_results')
      .select(baseMatchSelect)
      .or(`winner_wallet.eq.${walletAddress},winner_wallet.eq.${walletLower}`)
      .order('match_started_at', { ascending: false })
      .limit(limitMatches)

    const participantMatches: MatchResultRow[] = []
    try {
      const q1 = await db
        .from('match_results')
        .select(baseMatchSelect)
        .contains('participants', [{ wallet: walletAddress }])
        .order('match_started_at', { ascending: false })
        .limit(limitMatches)
      if (Array.isArray(q1.data)) participantMatches.push(...(q1.data as any[]))
    } catch {}
    if (walletLower !== walletAddress) {
      try {
        const q2 = await db
          .from('match_results')
          .select(baseMatchSelect)
          .contains('participants', [{ wallet: walletLower }])
          .order('match_started_at', { ascending: false })
          .limit(limitMatches)
        if (Array.isArray(q2.data)) participantMatches.push(...(q2.data as any[]))
      } catch {}
    }

    const combinedMatches = uniqById([
      ...((winnerQuery.data as any[]) || []),
      ...participantMatches,
    ] as any)
      .sort((a: any, b: any) => {
        const at = new Date(a?.match_started_at || a?.created_at || 0).getTime()
        const bt = new Date(b?.match_started_at || b?.created_at || 0).getTime()
        return bt - at
      })
      .slice(0, limitMatches)

    const depositsQuery = await db
      .from('wager_deposits')
      .select('id,intent_id,match_result_id,match_session_id,lobby_id,player_wallet,escrow_wallet_id,expected_lamports,deposit_signature,slot,commitment,status,created_at,updated_at')
      .or(`player_wallet.eq.${walletAddress},player_wallet.eq.${walletLower}`)
      .order('created_at', { ascending: false })
      .limit(limitDeposits)

    const deposits = Array.isArray(depositsQuery.data) ? (depositsQuery.data as any as WagerDepositRow[]) : []

    const matchIds = Array.from(
      new Set(
        combinedMatches
          .map((m: any) => String(m?.id || ''))
          .filter(Boolean)
          .concat(deposits.map((d) => String(d.match_result_id || '')).filter(Boolean))
      )
    )

    const payments: PaymentRow[] = []
    if (matchIds.length > 0) {
      const pay = await db
        .from('payments')
        .select(
          'op_id,type,from_address,to_address,token,amount_wei,tx_hash,state,chain,match_result_id,match_session_id,metadata,created_at,updated_at'
        )
        .in('match_result_id', matchIds)
        .order('created_at', { ascending: false })
        .limit(limitPayments)
      if (Array.isArray(pay.data)) payments.push(...(pay.data as any[]))
    }

    const paymentsForWallet: PaymentRowForWallet[] = payments
      .map((p) => ({
        ...(p as any),
        wallet_lamports: parseTransfersLamports(p, walletAddress),
      }))
      .filter((p) => (p.wallet_lamports || 0) > 0)

    const depositedLamports = deposits
      .filter((d) => String(d.status || '') !== 'intent')
      .reduce((s, d) => s + parseLamports(d.expected_lamports), 0)

    const creditedLamports = paymentsForWallet.reduce((s, p) => s + (p.wallet_lamports || 0), 0)

    const refundsLamports = paymentsForWallet
      .filter((p) => String(p.type || '') === 'refund')
      .reduce((s, p) => s + (p.wallet_lamports || 0), 0)

    const payoutsLamports = paymentsForWallet
      .filter((p) => String(p.type || '') === 'payout')
      .reduce((s, p) => s + (p.wallet_lamports || 0), 0)

    return NextResponse.json({
      walletAddress,
      profile: profile || null,
      ledger: {
        matches: combinedMatches,
        deposits,
        payments: paymentsForWallet,
      },
      stats: {
        matches: combinedMatches.length,
        depositedLamports,
        creditedLamports,
        payoutsLamports,
        refundsLamports,
        netLamports: creditedLamports - depositedLamports,
      },
    })
  } catch (error: any) {
    console.error('Error in GET /api/public/profile/[walletAddress]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
