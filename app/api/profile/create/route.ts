import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse, NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authService } from '@/lib/auth-service';
import { auditLogger } from '@/lib/audit-logger';
import { withRateLimit, RATE_LIMITS } from '@/lib/rate-limiter';
import { z } from 'zod';

// Admin client for server-side operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  return withRateLimit(req, RATE_LIMITS.PROFILE, async () => {
    return handleProfileCreation(req);
  });
}

async function handleProfileCreation(req: NextRequest) {
  try {
    const BodySchema = z.object({
      username: z.string().min(3).max(20),
      walletAddress: z.string().min(32),
      sessionId: z.string().uuid().optional(),
    });

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { username, walletAddress, sessionId } = parsed.data;

    // Require authentication (signature verification)
    if (sessionId) {
      const isValidSession = await authService.validateSession(sessionId, walletAddress);
      if (!isValidSession) {
        return NextResponse.json({
          error: 'Invalid or expired session',
          message: 'Please sign in again',
        }, { status: 401 });
      }
    } else {
      // Allow profile creation without session for backwards compatibility,
      // but this should eventually be required
      console.warn(`⚠️  Profile creation without session for ${walletAddress}`);
    }

    // Check if username is unique
    const { data: existingUser, error: existingUserError } = await supabaseAdmin
      .from('profiles')
      .select('username')
      .eq('username', username.trim())
      .single();

    if (existingUser) {
      return NextResponse.json({ error: 'Username is already taken' }, { status: 409 });
    }

    // Check if wallet already has a profile
    const { data: existingProfile, error: profileCheckError } = await supabaseAdmin
      .from('profiles')
      .select('wallet_address')
      .eq('wallet_address', walletAddress)
      .single();

    if (existingProfile) {
      return NextResponse.json({ error: 'Profile already exists for this wallet' }, { status: 409 });
    }

    // Create the profile - let database handle date_created and last_login defaults
    // Use ON CONFLICT to handle race conditions at database level
    const { data: newProfile, error } = await supabaseAdmin
      .from('profiles')
      .insert([
        {
          wallet_address: walletAddress,
          username: username.trim(),
        },
      ])
      .select()
      .single();

    if (error) {
      console.error('Error creating profile:', error);
      
      // Handle duplicate key constraint violation
      if (error.code === '23505' && error.message.includes('profiles_pkey')) {
        return NextResponse.json({ 
          error: 'Profile already exists for this wallet',
          code: 'PROFILE_EXISTS'
        }, { status: 409 });
      }
      
      if (error.code === '23505' && error.message.includes('profiles_username_key')) {
        return NextResponse.json({ 
          error: 'Username is already taken',
          code: 'USERNAME_TAKEN'
        }, { status: 409 });
      }
      
      return NextResponse.json({ 
        error: 'Failed to create profile', 
        details: error.message 
      }, { status: 500 });
    }

    console.log('Profile created successfully:', newProfile);

    // Audit log the profile creation
    await auditLogger.log({
      eventType: 'profile_created',
      actorWallet: walletAddress,
      endpoint: '/api/profile/create',
      severity: 'info',
      metadata: {
        username: username.trim(),
      },
    });

    return NextResponse.json(newProfile);
  } catch (error) {
    console.error('Unexpected error in profile creation:', error);
    return NextResponse.json({ 
      error: 'An unexpected error occurred',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 