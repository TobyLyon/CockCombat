import { NextRequest, NextResponse } from 'next/server';
import { ProfileService } from '@/lib/profile-service';
import { Match } from '@/lib/supabase-client';

/**
 * Record a new match for a wallet
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { walletAddress: string } }
) {
  try {
    const { walletAddress } = params;
    
    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Wallet address is required' },
        { status: 400 }
      );
    }
    
    const matchData: Partial<Match> = await request.json();
    
    // Set player1 wallet to the current user
    matchData.player1_wallet = walletAddress;
    
    const match = await ProfileService.recordMatch(matchData);
    
    if (!match) {
      return NextResponse.json(
        { error: 'Failed to record match' },
        { status: 500 }
      );
    }
    
    return NextResponse.json(match);
  } catch (error) {
    console.error('Error in POST /api/profile/[walletAddress]/match:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Get match history for a wallet
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { walletAddress: string } }
) {
  try {
    const { walletAddress } = params;
    
    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Wallet address is required' },
        { status: 400 }
      );
    }
    
    const matches = await ProfileService.getMatchHistory(walletAddress);
    
    return NextResponse.json(matches);
  } catch (error) {
    console.error('Error in GET /api/profile/[walletAddress]/match:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 