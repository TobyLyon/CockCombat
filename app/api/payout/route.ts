import { NextResponse } from 'next/server';
import { Connection, PublicKey, SystemProgram, Transaction, clusterApiUrl, LAMPORTS_PER_SOL, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

// This function creates and executes a payout transaction
export async function POST(request: Request) {
  try {
    const { winnerAddress, prizePoolLamports } = await request.json();

    if (!winnerAddress || !prizePoolLamports) {
      return NextResponse.json({ error: "Winner address and prize pool are required" }, { status: 400 });
    }

    // --- SECURITY CHECKS ---
    // Ensure environment variables are set
    const prizePoolPrivateKey = process.env.PRIZE_POOL_PRIVATE_KEY;
    const houseWalletAddress = process.env.NEXT_PUBLIC_ADMIN_WALLET; // Using ADMIN_WALLET as the house wallet

    if (!prizePoolPrivateKey || !houseWalletAddress) {
      console.error("Server environment variables for payout are not set.");
      return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
    }

    // --- TRANSACTION LOGIC ---
    // Establish connection to the Solana devnet
    const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');

    // Load the prize pool wallet from the private key
    const prizePoolKeypair = Keypair.fromSecretKey(bs58.decode(prizePoolPrivateKey));
    
    // Define public keys
    const winnerPublicKey = new PublicKey(winnerAddress);
    const housePublicKey = new PublicKey(houseWalletAddress);

    // Calculate payouts
    const houseCutPercentage = 0.04; // 4%
    const houseCutLamports = Math.floor(prizePoolLamports * houseCutPercentage);
    const winnerCutLamports = prizePoolLamports - houseCutLamports;

    // Create a new transaction
    const transaction = new Transaction();

    // Add instruction to pay the winner
    if (winnerCutLamports > 0) {
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: prizePoolKeypair.publicKey,
          toPubkey: winnerPublicKey,
          lamports: winnerCutLamports,
        })
      );
    }
    
    // Add instruction to pay the house
    if (houseCutLamports > 0) {
        transaction.add(
            SystemProgram.transfer({
                fromPubkey: prizePoolKeypair.publicKey,
                toPubkey: housePublicKey,
                lamports: houseCutLamports,
            })
        );
    }

    // Sign and send the transaction
    const signature = await connection.sendTransaction(transaction, [prizePoolKeypair]);

    // Confirm the transaction
    await connection.confirmTransaction(signature, 'confirmed');

    console.log(`Payout successful! Transaction signature: ${signature}`);

    return NextResponse.json({
      message: "Payout successful!",
      transactionSignature: signature,
    });

  } catch (error) {
    console.error("Error processing payout:", error);
    return NextResponse.json({ error: "Failed to process payout" }, { status: 500 });
  }
} 