import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { authService } from '@/lib/auth-service'
import { withRateLimit, RATE_LIMITS } from '@/lib/rate-limiter'

export const runtime = 'nodejs'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  return withRateLimit(req, RATE_LIMITS.PROFILE, async () => {
    try {
      const form = await req.formData()
      const walletAddress = String(form.get('walletAddress') || '').trim()
      const sessionId = String(form.get('sessionId') || '').trim()
      const file = form.get('file')

      const BodySchema = z.object({
        walletAddress: z.string().min(32),
        sessionId: z.string().uuid(),
      })

      const parsed = BodySchema.safeParse({ walletAddress, sessionId })
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid request', details: parsed.error.flatten() },
          { status: 400 }
        )
      }

      if (!(file instanceof File)) {
        return NextResponse.json({ error: 'File is required' }, { status: 400 })
      }

      const isValidSession = await authService.validateSession(sessionId, walletAddress)
      if (!isValidSession) {
        return NextResponse.json(
          { error: 'Invalid or expired session', message: 'Please sign in again' },
          { status: 401 }
        )
      }

      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('wallet_address')
        .eq('wallet_address', walletAddress)
        .maybeSingle()

      if (!profile) {
        return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
      }

      if (!String(file.type || '').toLowerCase().startsWith('image/')) {
        return NextResponse.json({ error: 'Only image uploads are allowed' }, { status: 400 })
      }

      const maxBytes = 2 * 1024 * 1024
      if (typeof file.size === 'number' && file.size > maxBytes) {
        return NextResponse.json({ error: 'Image must be 2MB or smaller' }, { status: 413 })
      }

      const bucket = process.env.NEXT_PUBLIC_AVATAR_BUCKET || 'avatars'
      const ext = (String(file.name || '').split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png'
      const path = `${walletAddress}/${Date.now()}.${ext}`

      const buffer = Buffer.from(await file.arrayBuffer())

      const { error: uploadError } = await supabaseAdmin.storage.from(bucket).upload(path, buffer, {
        contentType: file.type || 'image/png',
        upsert: false,
      })

      if (uploadError) {
        return NextResponse.json(
          { error: 'Upload failed', details: uploadError.message },
          { status: 500 }
        )
      }

      const { data } = supabaseAdmin.storage.from(bucket).getPublicUrl(path)
      const publicUrl = String(data?.publicUrl || '').trim()
      if (!publicUrl) {
        return NextResponse.json({ error: 'Failed to generate public URL' }, { status: 500 })
      }

      return NextResponse.json({ publicUrl, path })
    } catch (error) {
      console.error('Error in POST /api/profile/avatar/upload:', error)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  })
}
