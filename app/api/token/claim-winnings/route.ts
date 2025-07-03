import { NextRequest, NextResponse } from 'next/server';

// Custom error class for signature verification
class SignatureVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SignatureVerificationError';
  }
}

// This would be a database or cache that stores valid claims
const pendingWinnings = new Map<string, { amount: number, claimed: boolean, matchId: string }>();

// Add some test data (in production, this would be stored in a database)
// Format: wallet address => { amount, claimed, matchId }
pendingWinnings.set('test-wallet-address', { 
  amount: 10, 
  claimed: false, 
  matchId: 'test-match-1' 
});

/**
 * Handler for POST /api/token/claim-winnings
 * Validates and processes a winning claim
 */
export async function POST(request: NextRequest) {
  try {
    // Parse the request body
    const body = await request.json();
    const { walletAddress, amount, signature, matchId } = body;

    // Basic validation
    if (!walletAddress || !amount || !matchId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // In a real implementation:
    // 1. Verify the signature from the user's wallet to prove ownership
    // 2. Check database records to confirm the user won the match
    // 3. Verify the claimed amount matches what they should receive
    // 4. Mark the claim as processed to prevent double-claiming

    // For this demo, we'll do a simple check against our mock data
    const winningsInfo = pendingWinnings.get(walletAddress);
    
    // Check if the player has any pending winnings
    if (!winningsInfo) {
      return NextResponse.json({ 
        success: false,
        error: 'No pending winnings found for this wallet' 
      }, { status: 404 });
    }
    
    // Check if the winnings have already been claimed
    if (winningsInfo.claimed) {
      return NextResponse.json({ 
        success: false,
        error: 'Winnings already claimed' 
      }, { status: 409 });
    }
    
    // Check if the match ID matches
    if (winningsInfo.matchId !== matchId) {
      return NextResponse.json({ 
        success: false,
        error: 'Match ID mismatch' 
      }, { status: 400 });
    }
    
    // Check if the amount matches (within a small tolerance for rounding errors)
    const tolerance = 0.001;
    if (Math.abs(winningsInfo.amount - amount) > tolerance) {
      return NextResponse.json({ 
        success: false,
        error: 'Claimed amount does not match winnings' 
      }, { status: 400 });
    }
    
    // Update the claim status
    pendingWinnings.set(walletAddress, {
      ...winningsInfo,
      claimed: true
    });
    
    // In a production environment, you would now trigger the token transfer
    // from the escrow wallet to the player's wallet through a secure backend process
    
    // Return success response with a server-side claim token
    // that the client would use to finalize the transaction
    return NextResponse.json({
      success: true,
      claimToken: `${matchId}-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`,
      amount: winningsInfo.amount
    });
    
  } catch (error) {
    console.error('Error processing winning claim:', error);
    
    if (error instanceof SignatureVerificationError) {
      return NextResponse.json({ 
        success: false,
        error: 'Invalid signature' 
      }, { status: 401 });
    }
    
    return NextResponse.json({ 
      success: false,
      error: 'Internal server error' 
    }, { status: 500 });
  }
}

/**
 * Handler for GET /api/token/claim-winnings?walletAddress=xyz
 * Gets pending winnings for a wallet
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const walletAddress = searchParams.get('walletAddress');
    
    if (!walletAddress) {
      return NextResponse.json({ error: 'Missing wallet address' }, { status: 400 });
    }
    
    const winningsInfo = pendingWinnings.get(walletAddress);
    
    if (!winningsInfo || winningsInfo.claimed) {
      return NextResponse.json({ 
        hasPendingWinnings: false,
        amount: 0
      });
    }
    
    return NextResponse.json({
      hasPendingWinnings: true,
      amount: winningsInfo.amount,
      matchId: winningsInfo.matchId
    });
    
  } catch (error) {
    console.error('Error fetching pending winnings:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 