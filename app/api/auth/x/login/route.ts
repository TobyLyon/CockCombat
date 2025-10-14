import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  try {
    const clientId = process.env.X_CLIENT_ID
    const redirectUri = process.env.X_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL || ''}/api/auth/x/callback`
    const base = 'https://twitter.com/i/oauth2/authorize'
    if (!clientId || !redirectUri) {
      return NextResponse.json({ error: 'X auth not configured' }, { status: 500 })
    }
    // Minimal scopes: users.read + offline.access
    const scope = encodeURIComponent('users.read offline.access')
    const state = Math.random().toString(36).slice(2)
    const url = `${base}?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&state=${state}&code_challenge=plain&code_challenge=placeholder`
    // Note: We can wire proper PKCE later; for now just redirect to start the flow
    return NextResponse.redirect(url)
  } catch (e: any) {
    return NextResponse.json({ error: 'Failed to start X login', details: e?.message || String(e) }, { status: 500 })
  }
}


