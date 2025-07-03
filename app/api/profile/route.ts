import { NextRequest, NextResponse } from 'next/server';
import { ProfileService } from '@/lib/profile-service';
import { Profile } from '@/lib/supabase';

/**
 * Create or update a profile
 */
export async function POST(request: NextRequest) {
  try {
    const profileData: Partial<Profile> = await request.json();
    
    // Validate required fields
    if (!profileData.wallet_address) {
      return NextResponse.json(
        { error: 'Wallet address is required' },
        { status: 400 }
      );
    }
    
    // Check if profile exists
    const existingProfile = await ProfileService.getProfile(profileData.wallet_address);
    let response;
    
    if (existingProfile) {
      // Update existing profile
      response = await ProfileService.updateProfile(
        profileData.wallet_address,
        profileData
      );
    } else {
      // Create new profile
      response = await ProfileService.createProfile(profileData);
    }
    
    if (!response) {
      return NextResponse.json(
        { error: 'Failed to save profile' },
        { status: 500 }
      );
    }
    
    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in POST /api/profile:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 