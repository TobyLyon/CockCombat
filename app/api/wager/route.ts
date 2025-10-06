import { NextResponse } from 'next/server';
import { PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { lobbies, type Lobby } from '@/lib/lobbies';
import { getConnection } from '@/lib/solana-config';
import { escrowService } from '@/lib/escrow-service';
import { z } from 'zod';

// This function creates and returns a transaction for a wager
export async function POST(request: Request) {
  try {
    const BodySchema = z.object({
      lobbyId: z.string().min(3),
      playerPublicKey: z.string().min(32),
    });
    const parsed = BodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body', details: parsed.error.flatten() }, { status: 400 });
    }
    const { lobbyId, playerPublicKey } = parsed.data;

    if (!lobbyId || !playerPublicKey) {
      return NextResponse.json({ error: "Lobby ID and Player Public Key are required" }, { status: 400 });
    }

    // Validate player public key
    let playerPubkey: PublicKey;
    try {
      playerPubkey = new PublicKey(playerPublicKey);
    } catch (error) {
      return NextResponse.json({ error: "Invalid player public key" }, { status: 400 });
    }

    // Find the specific lobby to determine the wager amount
    const lobby = lobbies.find((l: Lobby) => l.id === lobbyId);
    if (!lobby) {
      return NextResponse.json({ error: "Lobby not found" }, { status: 404 });
    }

    // Tutorial matches are free
    if (lobby.matchType === 'tutorial' || lobby.amount === 0) {
      return NextResponse.json({ 
        message: "No wager required for tutorial matches",
        isFree: true,
      });
    }

    // Get connection using centralized config
    const connection = getConnection();
    
    // Initialize escrow service
    escrowService.setConnection(connection);
    
    // Get the escrow wallet assigned to this lobby
    // All players in the same lobby MUST use the same escrow wallet
    let escrowWallet;
    if (!lobby.escrowWalletId) {
      // Assign one now if not already assigned
      escrowWallet = await escrowService.getNextWallet();
      lobby.escrowWalletId = escrowWallet.id;
      console.log(`🔐 Assigned Escrow Wallet ${escrowWallet.id} to lobby ${lobbyId}`);
    } else {
      // Use the lobby's assigned wallet
      escrowWallet = escrowService.getWallet(lobby.escrowWalletId);
      if (!escrowWallet) {
        return NextResponse.json({ 
          error: "Escrow wallet not available",
          details: `Wallet ${lobby.escrowWalletId} is not configured`
        }, { status: 500 });
      }
    }
    
    console.log(`💰 Creating wager transaction for ${playerPublicKey}`);
    console.log(`   Lobby: ${lobbyId}`);
    console.log(`   Amount: ${lobby.amount} SOL`);
    console.log(`   Escrow: Wallet ${escrowWallet.id} (ALL players in this match use this wallet)`);

    // Create a new transaction for the wager
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: playerPubkey,
        toPubkey: escrowWallet.publicKey,
        lamports: Math.round(lobby.amount * LAMPORTS_PER_SOL),
      })
    );

    // Set the fee payer for the transaction
    transaction.feePayer = playerPubkey;

    // Get a recent blockhash to include in the transaction
    const { blockhash } = await connection.getLatestBlockhash('finalized');
    transaction.recentBlockhash = blockhash;

    // Serialize the transaction without signing it
    const serializedTransaction = transaction.serialize({
      requireAllSignatures: false, // We only need the player's signature
    });

    // Return the serialized transaction to the frontend
    return NextResponse.json({
      transaction: serializedTransaction.toString('base64'),
      wagerAmount: lobby.amount,
      escrowWallet: escrowWallet.publicKey.toBase58(),
      lobbyId: lobbyId,
    });

  } catch (error) {
    console.error("❌ Error creating wager transaction:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ 
      error: "Failed to create wager transaction",
      details: errorMessage,
    }, { status: 500 });
  }
} 