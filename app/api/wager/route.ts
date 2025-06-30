import { NextResponse } from 'next/server';
import { Connection, PublicKey, SystemProgram, Transaction, clusterApiUrl, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { lobbies, Lobby } from '../lobbies/route'; // Assuming lobbies can be imported

// This function creates and returns a transaction for a wager
export async function POST(request: Request) {
  try {
    const { lobbyId, playerPublicKey } = await request.json();

    if (!lobbyId || !playerPublicKey) {
      return NextResponse.json({ error: "Lobby ID and Player Public Key are required" }, { status: 400 });
    }

    // Find the specific lobby to determine the wager amount
    const lobby = lobbies.find((l: Lobby) => l.id === lobbyId);
    if (!lobby) {
      return NextResponse.json({ error: "Lobby not found" }, { status: 404 });
    }

    // Ensure the prize pool wallet is configured in environment variables
    const prizePoolWallet = process.env.PRIZE_POOL_WALLET;
    if (!prizePoolWallet) {
      console.error("PRIZE_POOL_WALLET is not set in .env.local");
      return NextResponse.json({ error: "Server configuration error: Prize pool wallet is not set." }, { status: 500 });
    }

    // Establish connection to the Solana devnet
    const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
    
    // Create public key objects
    const playerPubkey = new PublicKey(playerPublicKey);
    const prizePoolPubkey = new PublicKey(prizePoolWallet);

    // Create a new transaction for the wager
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: playerPubkey,
        toPubkey: prizePoolPubkey,
        lamports: lobby.amount * LAMPORTS_PER_SOL,
      })
    );

    // Set the fee payer for the transaction
    transaction.feePayer = playerPubkey;

    // Get a recent blockhash to include in the transaction (using modern API)
    const { blockhash } = await connection.getLatestBlockhash('finalized');
    transaction.recentBlockhash = blockhash;

    // Serialize the transaction without signing it
    const serializedTransaction = transaction.serialize({
      requireAllSignatures: false, // We only need the player's signature
    });

    // Return the serialized transaction to the frontend
    return NextResponse.json({
      transaction: serializedTransaction.toString('base64'),
    });

  } catch (error) {
    console.error("Error creating wager transaction:", error);
    return NextResponse.json({ error: "Failed to create wager transaction" }, { status: 500 });
  }
} 