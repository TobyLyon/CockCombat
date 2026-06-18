import { NextResponse, NextRequest } from 'next/server'
import { getChain } from '@/lib/chain'
import { withRateLimit, RATE_LIMITS } from '@/lib/rate-limiter'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * House-fee → $DINNER buyback runner.
 *
 *   GET  /api/buyback/run   → preview only (never executes; shows budget + quote)
 *   POST /api/buyback/run   → body { execute?: boolean }
 *
 * A real swap only happens when ALL of these hold:
 *   - BUYBACK_ENABLED=true
 *   - request is POST with { execute: true }
 *   - BUYBACK_WALLET_PRIVATE_KEY is configured
 * Otherwise the response is a dry-run preview and no funds move.
 *
 * Auth: bearer token in `authorization` or `x-server-auth` matching
 * BUYBACK_SERVER_SECRET (falls back to PAYOUT_SERVER_SECRET).
 */

function authorized(request: NextRequest): boolean {
  const secret = process.env.BUYBACK_SERVER_SECRET || process.env.PAYOUT_SERVER_SECRET
  if (!secret) return false
  const provided = request.headers.get('x-server-auth') || request.headers.get('authorization')
  if (!provided) return false
  return provided.replace(/^Bearer\s+/i, '').trim() === secret
}

async function handle(request: NextRequest, execute: boolean) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const chain = getChain()
  if (chain !== 'solana') {
    return NextResponse.json({ error: 'Buyback only implemented for solana' }, { status: 501 })
  }

  let runBuyback: (opts: { execute?: boolean }) => Promise<any>
  try {
    ;({ runBuyback } = await import('@/lib/buyback-service'))
  } catch (e: any) {
    return NextResponse.json({ error: 'Failed to load buyback-service', details: e?.message || String(e) }, { status: 500 })
  }

  try {
    const result = await runBuyback({ execute })
    const status = result?.error ? 207 : 200
    return NextResponse.json({ ok: !result?.error, ...result }, { status })
  } catch (e: any) {
    return NextResponse.json({ error: 'Buyback run failed', details: e?.message || String(e) }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  return withRateLimit(request, RATE_LIMITS.PAYOUT, async () => handle(request, false))
}

export async function POST(request: NextRequest) {
  return withRateLimit(request, RATE_LIMITS.PAYOUT, async () => {
    const body = await request.json().catch(() => ({} as any))
    const execute = Boolean((body as any)?.execute)
    return handle(request, execute)
  })
}
