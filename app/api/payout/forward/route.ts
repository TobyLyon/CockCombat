import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get('authorization') || ''
    const expected = process.env.PAYOUT_FORWARD_SECRET || ''
    if (!expected || expected.length < 16) {
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }
    if (auth !== `Bearer ${expected}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Require server secret to exist
    const serverSecret = process.env.PAYOUT_SERVER_SECRET
    if (!serverSecret || serverSecret.length < 8) {
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }

    // Forward body to internal payout endpoint with Authorization header
    const body = await req.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || ''
    const url = baseUrl
      ? `${baseUrl}/api/payout`
      : `${new URL(req.url).origin}/api/payout`

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serverSecret}`,
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    })

    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: 'Failed to forward payout', details: message }, { status: 500 })
  }
}


