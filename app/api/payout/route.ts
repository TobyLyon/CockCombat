import { NextResponse } from 'next/server';
import { Connection, LAMPORTS_PER_SOL, clusterApiUrl } from '@solana/web3.js';
import escrowService from '@/lib/escrow-service';
import { auditLogger } from '@/lib/audit-logger';
import { monitoringService } from '@/lib/monitoring';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { isBsc } from '@/lib/chain';
import { evmEscrowService } from '@/lib/evm-escrow-service';
import { sendIdempotentPayment } from '@/lib/evm-payments';
import { getEvmExplorerUrl } from '@/lib/evm-config';
import { ethers } from 'ethers';
import { sendIdempotentSolPayment } from '@/lib/solana-payments';

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
      prizePool: z.number().positive(), // in SOL
      matchId: z.string().optional(),
      matchSessionId: z.string().optional(),
      escrowWalletId: z.string().optional(),
    });

    const parsed = BodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body', details: parsed.error.flatten() }, { status: 400 });
    }

    const { winnerAddress, prizePool, matchId, matchSessionId, escrowWalletId } = parsed.data;

    if (!winnerAddress || !prizePool) {
      return NextResponse.json({ error: "Winner address and prize pool are required" }, { status: 400 });
    }

    // Validate winner address format depending on chain
    // EVM-only build: no Solana address validation

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
    console.log(`   Prize Pool: ${prizePool} SOL`);

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
          const expectedPrizePool = matchResultRow.total_prize_pool;
          if (Math.abs(expectedPrizePool - prizePool) > 0.0001) {
            await auditLogger.logSuspiciousActivity(
              'Payout amount mismatch',
              winnerAddress,
              undefined,
              { matchId, expected: expectedPrizePool, provided: prizePool }
            );
            return NextResponse.json({ 
              error: 'Prize pool amount mismatch',
              expected: expectedPrizePool,
              provided: prizePool
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
      if (!matchWinnerFromDb && prizePool > 0) {
        await auditLogger.logSuspiciousActivity(
          'Payout without match record',
          winnerAddress,
          undefined,
          { matchId, amount: prizePool }
        );
        return NextResponse.json({ error: 'Match winner not recorded in database' }, { status: 400 });
      }
    } else if (prizePool > 0) {
      // Allow server-authorized payouts without matchId (fallback path) when internal auth provided
      const providedAuth = request.headers.get('x-server-auth') || request.headers.get('authorization');
      const serverSecret = process.env.PAYOUT_SERVER_SECRET;
      const authorized = !!(serverSecret && providedAuth && providedAuth.replace(/^Bearer\s+/i, '').trim() === serverSecret);
      if (!authorized) {
        await auditLogger.logSuspiciousActivity(
          'Payout without match ID',
          winnerAddress,
          undefined,
          { amount: prizePool }
        );
        return NextResponse.json({ error: 'Match ID required for payouts' }, { status: 400 });
      }
      // Proceed with payout; matchResult stays null and processPayoutServerOnly will select wallet round-robin
    }

    // Perform the payout via server-only helper
    const { winnerSignature, houseSignature } = await processPayoutServerOnly({ winnerAddress, prizePool, matchId, matchSessionId, houseWalletAddress, houseCutPercentage, matchResult, escrowWalletId });

    // Audit log and monitor the payout
    await monitoringService.monitorPayout(
      winnerAddress,
      prizePool * (1 - houseCutPercentage),
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
          amount: prizePool * (1 - houseCutPercentage),
          related_entity_id: matchId || null,
          description: `Match winnings`,
        });

        // Record house transaction
        await supabase.from('transactions').insert({
          wallet_address: houseWalletAddress,
          transaction_type: 'house_cut',
          amount: prizePool * houseCutPercentage,
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
                payout_amount: prizePool * (1 - houseCutPercentage),
                house_cut_amount: prizePool * houseCutPercentage,
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

    // Broadcast payout to the winner via Socket.IO so clients can notify and refresh balances
    try {
      const io: any = (global as any).socketIo;
      const active: any = (global as any).activeConnections;
      const winnerLower = String(winnerAddress || '').toLowerCase();
      const payload = {
        winner: winnerAddress,
        amount: prizePool * (1 - houseCutPercentage),
        currency: 'SOL',
        matchId: matchId || null,
        txHash: winnerSignature,
        explorer: null,
        ts: Date.now(),
      };
      if (io && active && typeof active.entries === 'function') {
        for (const [, conn] of active.entries()) {
          try {
            const w = String(conn.walletAddress || '').toLowerCase();
            if (w && w === winnerLower) {
              conn.socket?.emit?.('payout_success', payload);
            }
          } catch {}
        }
      }
    } catch {}

    return NextResponse.json({
      success: true,
      message: "Payout successful!",
      winnerTransaction: winnerSignature,
      houseTransaction: houseSignature,
      winnerAmount: prizePool * (1 - houseCutPercentage),
      houseAmount: prizePool * houseCutPercentage,
      explorerUrls: { winner: null as any, house: null as any },
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

// Server-only entrypoint to execute payout logic without HTTP
export async function processPayoutServerOnly(args: { winnerAddress: string; prizePool: number; matchId?: string | null; matchSessionId?: string | null; houseWalletAddress?: string; houseCutPercentage?: number; matchResult?: any; escrowWalletId?: string }) {
  const { winnerAddress, prizePool, matchId, matchSessionId, houseWalletAddress, houseCutPercentage = parseFloat(process.env.HOUSE_CUT_PERCENTAGE || '0.04'), matchResult, escrowWalletId } = args;
  if (isBsc()) throw new Error('Unsupported chain');
  if (!houseWalletAddress && !process.env.NEXT_PUBLIC_ADMIN_WALLET) throw new Error('House wallet not configured');
  const house = houseWalletAddress || process.env.NEXT_PUBLIC_ADMIN_WALLET!;

  const network = (process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet') as 'devnet' | 'testnet' | 'mainnet-beta'
  const base = process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl(network)
  const rpcUrl = (() => {
    try {
      const rebate = process.env.NEXT_PUBLIC_HELIUS_REBATE_ADDRESS || ''
      const isHelius = /helius/i.test(String(base || ''))
      if (network === 'mainnet-beta' && rebate && isHelius) {
        const sep = base.includes('?') ? '&' : '?'
        return `${base}${sep}rebate-address=${encodeURIComponent(rebate)}`
      }
    } catch {}
    return base
  })()

  const connection = new Connection(rpcUrl)
  escrowService.setConnection(connection)

  const lamportsPool = Math.round(prizePool * LAMPORTS_PER_SOL)
  const houseLamports = Math.floor(lamportsPool * houseCutPercentage)
  const winnerLamports = lamportsPool - houseLamports

  // Bind payouts to the same escrow wallet that received deposits.
  // If escrowWalletId is missing, refuse in production to avoid cross-match fund mixing.
  const escrowId = (escrowWalletId || (matchResult && (matchResult as any).escrow_wallet_id) || null) as any
  if (!escrowId) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Missing escrowWalletId for payout; refusing to pay from an arbitrary escrow wallet')
    }
  }

  console.log('[PAYOUT][REQUEST][SOL]', { matchId: matchId || null, matchSessionId: matchSessionId || null, winner: winnerAddress, winnerLamports, houseLamports, escrowId: escrowId || null })

  const winnerOpId = `sol:payout:winner:${matchId || matchSessionId || 'unknown'}:${winnerAddress.toLowerCase()}`
  const houseOpId = `sol:payout:house:${matchId || matchSessionId || 'unknown'}:${house.toLowerCase()}`

  const winnerRes = await sendIdempotentSolPayment({ opId: winnerOpId, type: 'payout', fromEscrowId: (escrowId || 'A'), to: winnerAddress, lamports: winnerLamports })
  const houseRes = await sendIdempotentSolPayment({ opId: houseOpId, type: 'house', fromEscrowId: (escrowId || 'A'), to: house, lamports: houseLamports })
  return { winnerSignature: winnerRes.txSig, houseSignature: houseRes.txSig }
}