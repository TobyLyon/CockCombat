import { NextRequest, NextResponse } from 'next/server'
import { getWriteClient } from '@/lib/supabase'

// Simple in-memory cache on the server to reduce DB hits for hot usernames
// Keyed by wallet_address (lowercased)
const serverUsernameCache = new Map<string, { username: string; ts: number }>()
const SERVER_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as { wallets?: string[] }
    const wallets = Array.isArray(body.wallets) ? body.wallets.filter(Boolean) : []

    if (wallets.length === 0) {
      return NextResponse.json({ usernames: {} })
    }

    const now = Date.now()
    const db = getWriteClient()
    const result: Record<string, string> = {}
    const toQuery: string[] = []

    // Serve from cache when fresh
    for (const addr of wallets) {
      const key = String(addr).trim().toLowerCase()
      const cached = serverUsernameCache.get(key)
      if (cached && now - cached.ts < SERVER_CACHE_TTL_MS) {
        result[addr] = cached.username
      } else {
        toQuery.push(addr)
      }
    }

    if (toQuery.length > 0) {
      // Query in batches to avoid URL length limits and large IN clauses
      const batchSize = 100
      for (let i = 0; i < toQuery.length; i += batchSize) {
        const batch = toQuery.slice(i, i + batchSize)
        const lowered = batch.map(a => a.toLowerCase())

        const { data, error } = await db
          .from('profiles')
          .select('wallet_address,username')
          .in('wallet_address', [...batch, ...lowered])

        if (!error && Array.isArray(data)) {
          for (const row of data as any[]) {
            const wa: string = row.wallet_address
            const un: string = row.username
            if (wa) {
              result[wa] = un
              serverUsernameCache.set(wa.toLowerCase(), { username: un, ts: now })
            }
          }
        }

        // For addresses not returned, fall back to truncated address
        for (const addr of batch) {
          if (!result[addr]) {
            result[addr] = `${addr.slice(0, 8)}...`
            serverUsernameCache.set(addr.toLowerCase(), { username: result[addr], ts: now })
          }
        }
      }
    }

    return NextResponse.json({ usernames: result })
  } catch (error) {
    console.error('Error in POST /api/profile/usernames:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}


