import { NextResponse } from 'next/server';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getConnection, getExplorerUrl } from '@/lib/solana-config';
import { escrowService } from '@/lib/escrow-service';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// This function creates and executes a payout transaction using the escrow service
export async function POST(request: Request) {
  try {
    const { winnerAddress, prizePoolLamports, matchId } = await request.json();

    if (!winnerAddress || !prizePoolLamports) {
      return NextResponse.json({ error: "Winner address and prize pool are required" }, { status: 400 });
    }

    // Validate winner address
    if (typeof winnerAddress !== 'string' || winnerAddress.length < 32) {
      return NextResponse.json({ error: "Invalid winner address" }, { status: 400 });
    }

    // --- SECURITY CHECKS ---
    const houseWalletAddress = process.env.NEXT_PUBLIC_ADMIN_WALLET;
    if (!houseWalletAddress) {
      console.error("House wallet address is not configured.");
      return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
    }

    // Get house cut percentage from env or use default
    const houseCutPercentage = parseFloat(process.env.HOUSE_CUT_PERCENTAGE || '0.04');

    console.log(`💰 Processing payout for match ${matchId || 'unknown'}`);
    console.log(`   Winner: ${winnerAddress}`);
    console.log(`   Prize Pool: ${prizePoolLamports / LAMPORTS_PER_SOL} SOL`);

    // --- TRANSACTION LOGIC USING ESCROW SERVICE ---
    // Initialize escrow service with connection
    const connection = getConnection();
    escrowService.setConnection(connection);

    // Process payout using escrow service (handles winner + house cut)
    const { winnerSignature, houseSignature } = await escrowService.processPayout(
      winnerAddress,
      prizePoolLamports,
      houseCutPercentage
    );

    // Calculate amounts for logging
    const houseCutLamports = Math.floor(prizePoolLamports * houseCutPercentage);
    const winnerCutLamports = prizePoolLamports - houseCutLamports;

    console.log(`✅ Payout successful!`);
    console.log(`   Winner TX: ${winnerSignature}`);
    console.log(`   House TX: ${houseSignature}`);

    // --- RECORD TRANSACTION IN DATABASE ---
    if (supabaseUrl && supabaseServiceKey) {
      try {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Record winner transaction
        await supabase.from('transactions').insert({
          wallet_address: winnerAddress,
          transaction_type: 'win',
          amount: winnerCutLamports / LAMPORTS_PER_SOL,
          related_entity_id: matchId || null,
          description: `Match winnings`,
        });

        // Record house transaction
        await supabase.from('transactions').insert({
          wallet_address: houseWalletAddress,
          transaction_type: 'house_cut',
          amount: houseCutLamports / LAMPORTS_PER_SOL,
          related_entity_id: matchId || null,
          description: `House cut (${(houseCutPercentage * 100).toFixed(1)}%)`,
        });

        // Update match record if matchId provided
        if (matchId) {
          await supabase
            .from('matches')
            .update({
              winner_wallet: winnerAddress,
              metadata: {
                payout_tx: winnerSignature,
                house_cut_tx: houseSignature,
                payout_amount: winnerCutLamports / LAMPORTS_PER_SOL,
                house_cut_amount: houseCutLamports / LAMPORTS_PER_SOL,
              },
            })
            .eq('id', matchId);
        }

        console.log(`📝 Transaction recorded in database`);
      } catch (dbError) {
        console.error('⚠️ Failed to record transaction in database:', dbError);
        // Don't fail the request if DB write fails - transaction already succeeded
      }
    }

    return NextResponse.json({
      success: true,
      message: "Payout successful!",
      winnerTransaction: winnerSignature,
      houseTransaction: houseSignature,
      winnerAmount: winnerCutLamports / LAMPORTS_PER_SOL,
      houseAmount: houseCutLamports / LAMPORTS_PER_SOL,
      explorerUrls: {
        winner: getExplorerUrl(winnerSignature),
        house: getExplorerUrl(houseSignature),
      },
    });

  } catch (error) {
    console.error("❌ Error processing payout:", error);
    
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    return NextResponse.json({ 
      success: false,
      error: "Failed to process payout",
      details: errorMessage,
    }, { status: 500 });
  }
} 