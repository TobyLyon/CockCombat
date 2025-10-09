import { NextRequest, NextResponse } from 'next/server';
import { ProfileService } from '@/lib/profile-service';
import { z } from 'zod';
import { getWriteClient } from '@/lib/supabase';

/**
 * Get profile by wallet address
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ walletAddress: string }> }
) {
  try {
    const { walletAddress } = await context.params;
    
    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Wallet address is required' },
        { status: 400 }
      );
    }
    
    const profile = await ProfileService.getProfile(walletAddress);
    
    if (!profile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(profile);
  } catch (error) {
    console.error('Error in GET /api/profile/[walletAddress]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Update profile by wallet address
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ walletAddress: string }> }
) {
  try {
    const { walletAddress } = await context.params;
    
    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Wallet address is required' },
        { status: 400 }
      );
    }
    
    const updates = await request.json();
    
    // Validate updates - only allow certain fields to be updated
    const allowedFields = ['last_login', 'profile_picture', 'bio', 'username'];
    const validUpdates: any = {};
    
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        validUpdates[field] = updates[field];
      }
    }
    // If username is present, enforce constraints and uniqueness
    if (typeof validUpdates.username === 'string') {
      const UsernameSchema = z.string().trim().min(3).max(20);
      const parsed = UsernameSchema.safeParse(validUpdates.username);
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid username. Must be 3-20 characters.' },
          { status: 400 }
        );
      }
      const trimmed = parsed.data;
      // Check uniqueness (exclude this wallet)
      try {
        const db = getWriteClient();
        const { data: conflicts, error } = await db
          .from('profiles')
          .select('wallet_address')
          .eq('username', trimmed)
          .neq('wallet_address', walletAddress)
          .limit(1);
        if (!error && Array.isArray(conflicts) && conflicts.length > 0) {
          return NextResponse.json(
            { error: 'Username is already taken' },
            { status: 409 }
          );
        }
      } catch {}
      validUpdates.username = trimmed;
    }

    if (Object.keys(validUpdates).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }
    
    const updatedProfile = await ProfileService.updateProfile(walletAddress, validUpdates);
    
    if (!updatedProfile) {
      return NextResponse.json(
        { error: 'Profile not found or update failed' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(updatedProfile);
  } catch (error) {
    console.error('Error in PATCH /api/profile/[walletAddress]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 