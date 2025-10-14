import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const code = searchParams.get('code')
    if (!code) return NextResponse.redirect(new URL('/', req.url))

    const clientId = process.env.X_CLIENT_ID!
    const clientSecret = process.env.X_CLIENT_SECRET!
    const redirectUri = process.env.X_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL || ''}/api/auth/x/callback`
    const tokenUrl = 'https://api.twitter.com/2/oauth2/token'

    // Exchange code for tokens
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: 'placeholder'
    })
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
    const resp = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${basic}`
      },
      body: body.toString()
    })
    const tokenJson = await resp.json().catch(()=>({}))
    if (!resp.ok) {
      return NextResponse.redirect(new URL('/arena?x=error', req.url))
    }

    const accessToken = tokenJson.access_token as string
    // Fetch profile
    const meResp = await fetch('https://api.twitter.com/2/users/me?user.fields=profile_image_url,name,username', {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    const me = await meResp.json().catch(()=>({}))
    const profile = me && me.data ? me.data : null

    // Stash minimal session via cookie for now (stateless)
    const res = NextResponse.redirect(new URL('/arena?x=ok', req.url))
    if (profile) {
      res.cookies.set('x_connected', '1', { httpOnly: false, sameSite: 'lax', path: '/' })
      res.cookies.set('x_uid', String(profile.id || ''), { httpOnly: false, sameSite: 'lax', path: '/' })
      res.cookies.set('x_un', String(profile.username || ''), { httpOnly: false, sameSite: 'lax', path: '/' })
      res.cookies.set('x_name', String(profile.name || ''), { httpOnly: false, sameSite: 'lax', path: '/' })
      res.cookies.set('x_avatar', String(profile.profile_image_url || ''), { httpOnly: false, sameSite: 'lax', path: '/' })
    }
    return res
  } catch (e: any) {
    return NextResponse.redirect(new URL('/arena?x=error', req.url))
  }
}


