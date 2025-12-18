import { NextRequest, NextResponse } from 'next/server'
import { withRateLimit, RATE_LIMITS } from '@/lib/rate-limiter'
import { z } from 'zod'

const AllowedMethodSet = new Set<string>([
  'getVersion',
  'getGenesisHash',
  'getHealth',
  'getLatestBlockhash',
  'getRecentBlockhash',
  'getBlockHeight',
  'getEpochInfo',
  'getSlot',
  'getBalance',
  'getAccountInfo',
  'getMultipleAccounts',
  'getMinimumBalanceForRentExemption',
  'getFeeForMessage',
  'getSignatureStatuses',
  'getTransaction',
  'getTransactionCount',
  'getRecentPerformanceSamples',
  'sendTransaction',
  'simulateTransaction',
])

function getRpcUrl(): string | null {
  const base = process.env.SOLANA_RPC_URL || null
  if (!base) return null
  // Only append rebate-address for Helius endpoints
  const network = (process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet') as 'devnet' | 'testnet' | 'mainnet-beta'
  try {
    const rebate = process.env.NEXT_PUBLIC_HELIUS_REBATE_ADDRESS || ''
    const isHelius = /helius/i.test(String(base || ''))
    if (network === 'mainnet-beta' && rebate && isHelius) {
      const sep = base.includes('?') ? '&' : '?'
      return `${base}${sep}rebate-address=${encodeURIComponent(rebate)}`
    }
  } catch {}
  return base
}

function isAllowedPayload(payload: any): boolean {
  try {
    if (!payload) return false
    if (Array.isArray(payload)) return payload.every(isAllowedPayload)
    const method = String(payload.method || '')
    if (!AllowedMethodSet.has(method)) return false
    return true
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  // Rate-limit hard; this endpoint protects your SOLANA_RPC_URL (Helius API key)
  const config = { ...RATE_LIMITS.READ, maxRequests: 300, windowMs: 60 * 1000 }

  return withRateLimit(req, config, async () => {
    const rpcUrl = getRpcUrl()
    if (!rpcUrl) {
      return NextResponse.json({ error: 'Solana RPC not configured' }, { status: 500 })
    }

    try {
      const payload = await req.json().catch(() => null)
      if (!payload) {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
      }

      // Validate JSON-RPC envelope lightly and enforce allowlist
      const SingleSchema = z.object({
        jsonrpc: z.string().optional(),
        id: z.any().optional(),
        method: z.string(),
        params: z.any().optional(),
      })

      const ok = Array.isArray(payload)
        ? payload.every((p: any) => SingleSchema.safeParse(p).success)
        : SingleSchema.safeParse(payload).success

      if (!ok || !isAllowedPayload(payload)) {
        return NextResponse.json({ error: 'RPC method not allowed' }, { status: 403 })
      }

      const upstream = await fetch(rpcUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
        cache: 'no-store',
      })

      const text = await upstream.text().catch(() => '')
      return new NextResponse(text, {
        status: upstream.status,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      })
    } catch (e: any) {
      return NextResponse.json({ error: 'RPC proxy failed', details: e?.message || String(e) }, { status: 500 })
    }
  })
}
