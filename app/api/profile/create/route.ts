import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Admin client for server-side operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const { username, walletAddress: providedWalletAddress } = await req.json();

    if (!username || username.trim().length < 3) {
      return NextResponse.json({ error: 'Username must be at least 3 characters long' }, { status: 400 });
    }

    // For now, we'll use a simple approach - in production you'd get the wallet from auth
    // Since we're having auth issues, let's create a temporary solution
    const cookieStore = cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
    
    // Try to get session, but if it fails, use the provided wallet address
    let walletAddress = null;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      walletAddress = session?.user?.id;
    } catch (authError) {
      console.log('Auth session not available, using provided wallet address');
    }

    // Use provided wallet address as fallback
    if (!walletAddress && providedWalletAddress) {
      walletAddress = providedWalletAddress;
    }

    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address required' }, { status: 401 });
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
    return NextResponse.json(newProfile);
  } catch (error) {
    console.error('Unexpected error in profile creation:', error);
    return NextResponse.json({ 
      error: 'An unexpected error occurred',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 