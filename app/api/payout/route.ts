import { NextResponse } from 'next/server';
import { LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { getConnection, getExplorerUrl } from '@/lib/solana-config';
import { escrowService } from '@/lib/escrow-service';
import { auditLogger } from '@/lib/audit-logger';
import { monitoringService } from '@/lib/monitoring';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// This function creates and executes a payout transaction using the escrow service
export async function POST(request: Request) {
  try {
    // --- AUTHORIZATION: Require server secret to call payouts ---
    const providedAuth = request.headers.get('x-server-auth') || request.headers.get('authorization');
    const serverSecret = process.env.PAYOUT_SERVER_SECRET;
    if (!serverSecret || !providedAuth || !providedAuth.replace(/^Bearer\s+/i, '').trim() || providedAuth.replace(/^Bearer\s+/i, '').trim() !== serverSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // --- VALIDATION ---
    const BodySchema = z.object({
      winnerAddress: z.string().min(32),
      prizePoolLamports: z.number().int().positive(),
      matchId: z.string().optional(),
    });

    const parsed = BodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body', details: parsed.error.flatten() }, { status: 400 });
    }

    const { winnerAddress, prizePoolLamports, matchId } = parsed.data;

    if (!winnerAddress || !prizePoolLamports) {
      return NextResponse.json({ error: "Winner address and prize pool are required" }, { status: 400 });
    }

    // Validate winner address (base58 pubkey)
    try {
      // Throws if invalid
      // eslint-disable-next-line no-new
      new PublicKey(winnerAddress);
    } catch {
      return NextResponse.json({ error: 'Invalid winner address' }, { status: 400 });
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

    // --- IDEMPOTENCY + MATCH VALIDATION ---
    let matchAlreadyPaid = false;
    let matchWinnerFromDb: string | null = null;
    let matchResult: any = null;
    
    if (matchId && supabaseUrl && supabaseServiceKey) {
      try {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        
        // Check match_results table first (new security feature)
        const { data: matchResultRow } = await supabase
          .from('match_results')
          .select('*')
          .eq('id', matchId)
          .single();

        if (matchResultRow) {
          matchResult = matchResultRow;
          matchWinnerFromDb = matchResultRow.winner_wallet;
          matchAlreadyPaid = matchResultRow.payout_processed || false;
          
          // Verify status
          if (matchResultRow.status !== 'completed') {
            await auditLogger.logSuspiciousActivity(
              'Payout attempted on incomplete match',
              winnerAddress,
              undefined,
              { matchId, status: matchResultRow.status }
            );
            return NextResponse.json({ 
              error: 'Match not completed',
              status: matchResultRow.status 
            }, { status: 400 });
          }

          // Verify prize pool matches
          const expectedPrizePool = Math.round(matchResultRow.total_prize_pool * LAMPORTS_PER_SOL);
          if (Math.abs(expectedPrizePool - prizePoolLamports) > 100) { // Allow 100 lamport tolerance for rounding
            await auditLogger.logSuspiciousActivity(
              'Payout amount mismatch',
              winnerAddress,
              undefined,
              { matchId, expected: expectedPrizePool, provided: prizePoolLamports }
            );
            return NextResponse.json({ 
              error: 'Prize pool amount mismatch',
              expected: expectedPrizePool / LAMPORTS_PER_SOL,
              provided: prizePoolLamports / LAMPORTS_PER_SOL
            }, { status: 400 });
          }
        } else {
          // Fallback to old matches table
          const { data: matchRow } = await supabase
            .from('matches')
            .select('id, winner_wallet, metadata')
            .eq('id', matchId)
            .single();

          if (matchRow) {
            matchWinnerFromDb = matchRow.winner_wallet || null;
            matchAlreadyPaid = Boolean(matchRow.metadata && (matchRow.metadata as any).payout_tx);
          }
        }
      } catch (e) {
        console.error('Error validating match:', e);
        // Don't fail silently on validation errors
        await auditLogger.log({
          eventType: 'payout_failed',
          targetWallet: winnerAddress,
          severity: 'error',
          metadata: { matchId, error: String(e) }
        });
        return NextResponse.json({ error: 'Failed to validate match data' }, { status: 500 });
      }

      if (matchAlreadyPaid) {
        await auditLogger.logSuspiciousActivity(
          'Duplicate payout attempt',
          winnerAddress,
          undefined,
          { matchId }
        );
        return NextResponse.json({ error: 'Payout already processed for this match' }, { status: 409 });
      }

      if (matchWinnerFromDb && matchWinnerFromDb !== winnerAddress) {
        await auditLogger.logSuspiciousActivity(
          'Payout winner mismatch',
          winnerAddress,
          undefined,
          { matchId, expectedWinner: matchWinnerFromDb, providedWinner: winnerAddress }
        );
        return NextResponse.json({ 
          error: 'Winner address does not match recorded match winner',
          expected: matchWinnerFromDb
        }, { status: 400 });
      }

      // Require match validation for non-zero payouts
      if (!matchWinnerFromDb && prizePoolLamports > 0) {
        await auditLogger.logSuspiciousActivity(
          'Payout without match record',
          winnerAddress,
          undefined,
          { matchId, amount: prizePoolLamports }
        );
        return NextResponse.json({ error: 'Match winner not recorded in database' }, { status: 400 });
      }
    } else if (prizePoolLamports > 0) {
      // Require matchId for all non-zero payouts
      await auditLogger.logSuspiciousActivity(
        'Payout without match ID',
        winnerAddress,
        undefined,
        { amount: prizePoolLamports }
      );
      return NextResponse.json({ error: 'Match ID required for payouts' }, { status: 400 });
    }

    // --- TRANSACTION LOGIC USING ESCROW SERVICE ---
    // Initialize escrow service with connection
    const connection = getConnection();
    escrowService.setConnection(connection);

    // Get the SPECIFIC escrow wallet that holds funds for this match
    let escrowWallet;
    if (matchResult && matchResult.escrow_wallet_id) {
      // Use the wallet that collected the wagers
      escrowWallet = escrowService.getWallet(matchResult.escrow_wallet_id);
      if (!escrowWallet) {
        return NextResponse.json({ 
          error: 'Escrow wallet not available',
          details: `Wallet ${matchResult.escrow_wallet_id} is not configured`
        }, { status: 500 });
      }
      console.log(`💰 Using Escrow Wallet ${escrowWallet.id} (same wallet that collected wagers)`);
    } else {
      // Fallback: get a wallet with sufficient balance (legacy behavior)
      console.warn('⚠️  Match result missing escrow_wallet_id, using wallet with balance');
      try {
        escrowWallet = await escrowService.getWalletWithBalance(prizePoolLamports);
      } catch (e) {
        console.error('Payout attempted but no escrow wallet has sufficient balance.');
        return NextResponse.json({ 
          error: 'Insufficient escrow balance',
          details: 'No escrow wallet has enough SOL for this payout'
        }, { status: 500 });
      }
    }

    // Calculate amounts
    const houseCutLamports = Math.floor(prizePoolLamports * houseCutPercentage);
    const winnerCutLamports = prizePoolLamports - houseCutLamports;

    console.log(`💰 Processing payout from Wallet ${escrowWallet.id}: Winner: ${winnerCutLamports / LAMPORTS_PER_SOL} SOL, House: ${houseCutLamports / LAMPORTS_PER_SOL} SOL`);

    // Transfer to winner
    const winnerSignature = await escrowService.transferSOL(winnerAddress, winnerCutLamports, escrowWallet);

    // Transfer to house
    const houseSignature = await escrowService.transferSOL(houseWalletAddress, houseCutLamports, escrowWallet);

    console.log(`✅ Payout successful!`);
    console.log(`   Winner TX: ${winnerSignature}`);
    console.log(`   House TX: ${houseSignature}`);

    // Audit log and monitor the payout
    await monitoringService.monitorPayout(
      winnerAddress,
      winnerCutLamports / LAMPORTS_PER_SOL,
      matchId,
      winnerSignature
    );

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

        // Update match_results if it exists (new security table)
        if (matchId && matchResult) {
          await supabase
            .from('match_results')
            .update({
              payout_processed: true,
              payout_tx_signature: winnerSignature,
              status: 'completed',
            })
            .eq('id', matchId);
        }

        // Also update old matches table for compatibility
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