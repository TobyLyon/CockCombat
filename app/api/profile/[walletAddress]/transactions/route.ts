import { NextRequest, NextResponse } from 'next/server'
import { getWriteClient } from '@/lib/supabase'

/**
 * Get transaction history for a wallet
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ walletAddress: string }> }
) {
  try {
    const { walletAddress } = await params

    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Wallet address is required' },
        { status: 400 }
      )
    }

    const sp = request.nextUrl.searchParams
    const limitParam = sp.get('limit')
    let limit = 50
    if (limitParam) {
      const n = Number(limitParam)
      if (Number.isFinite(n) && n > 0) limit = Math.min(100, Math.floor(n))
    }

    const db = getWriteClient()
    const { data, error } = await db
      .from('transactions')
      .select('*')
      .eq('wallet_address', walletAddress)
      .order('timestamp', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('Error fetching transactions:', error)
      return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 })
    }

    return NextResponse.json(data || [])
  } catch (error) {
    console.error('Error in GET /api/profile/[walletAddress]/transactions:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
