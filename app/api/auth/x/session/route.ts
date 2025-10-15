import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  try {
    const cookies = req.cookies
    const connected = cookies.get('x_connected')?.value === '1'
    const uid = cookies.get('x_uid')?.value || null
    const username = cookies.get('x_un')?.value || null
    const name = cookies.get('x_name')?.value || null
    const avatar = cookies.get('x_avatar')?.value || null
    return NextResponse.json({ connected, uid, username, name, avatar })
  } catch (e: any) {
    return NextResponse.json({ connected: false }, { status: 200 })
  }
}


