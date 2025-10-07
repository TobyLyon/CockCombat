import { NextResponse, NextRequest } from 'next/server'

export async function POST(req: NextRequest) {
  try {
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


