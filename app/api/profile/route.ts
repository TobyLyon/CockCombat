import { NextRequest, NextResponse } from 'next/server';
import { ProfileService } from '@/lib/profile-service';
import { Profile } from '@/lib/supabase';

/**
 * Create or update a profile
 */
export async function POST(request: NextRequest) {
  try {
    return NextResponse.json(
      {
        error: 'This endpoint has been disabled',
        message: 'Use POST /api/profile/create to create profiles and PATCH /api/profile/[walletAddress] to update profiles.',
      },
      { status: 410 }
    );
  } catch (error) {
    console.error('Error in POST /api/profile:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 