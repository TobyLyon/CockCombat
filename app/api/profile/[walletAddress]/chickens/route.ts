import { NextRequest, NextResponse } from 'next/server';
import { ProfileService } from '@/lib/profile-service';
import { Chicken } from '@/lib/supabase-client';

/**
 * Get all chickens for a wallet
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
    
    const chickens = await ProfileService.getChickens(walletAddress);
    
    return NextResponse.json(chickens);
  } catch (error) {
    console.error('Error in GET /api/profile/[walletAddress]/chickens:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Create a new chicken
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
    
    const chickenData: Partial<Chicken> = await request.json();
    
    // Override owner to ensure security
    chickenData.owner_wallet = walletAddress;
    
    const chicken = await ProfileService.createChicken(chickenData);
    
    if (!chicken) {
      return NextResponse.json(
        { error: 'Failed to create chicken' },
        { status: 500 }
      );
    }
    
    return NextResponse.json(chicken);
  } catch (error) {
    console.error('Error in POST /api/profile/[walletAddress]/chickens:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 