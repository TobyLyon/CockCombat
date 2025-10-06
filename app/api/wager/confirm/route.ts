import { NextResponse, NextRequest } from 'next/server';
import { lobbies } from '@/lib/lobbies';
import { getConnection } from '@/lib/solana-config';
import { SystemProgram, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { z } from 'zod';

// In-memory replay guard (best-effort); consider persisting in DB for production
const confirmedSignatures = new Set<string>();

export async function POST(req: NextRequest) {
  try {
    const BodySchema = z.object({
      lobbyId: z.string().min(3),
      signature: z.string().min(32),
      playerPublicKey: z.string().min(32),
    });

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body', details: parsed.error.flatten() }, { status: 400 });
    }

    const { lobbyId, signature, playerPublicKey } = parsed.data;

    if (!lobbyId || !signature || !playerPublicKey) {
      return NextResponse.json({ error: 'Lobby ID, signature, and player public key are required' }, { status: 400 });
    }

    // Validate player public key format
    let playerKey: PublicKey;
    try {
      playerKey = new PublicKey(playerPublicKey);
    } catch (error) {
      return NextResponse.json({ error: 'Invalid player public key' }, { status: 400 });
    }

    const lobby = lobbies.find(l => l.id === lobbyId);
    if (!lobby) {
      return NextResponse.json({ error: 'Lobby not found' }, { status: 404 });
    }

    const player = lobby.players.find(p => p.playerId === playerPublicKey);
    if (!player) {
      return NextResponse.json({ error: 'Player not found in this lobby' }, { status: 404 });
    }

    // Verify the transaction moved the exact wager to the escrow wallet
    // Replay protection
    if (confirmedSignatures.has(signature)) {
      return NextResponse.json({ error: 'Signature already confirmed' }, { status: 409 });
    }

    const connection = getConnection();
    const tx = await connection.getTransaction(signature, { maxSupportedTransactionVersion: 0 });
    if (!tx || !tx.transaction) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 400 });
    }

    const expectedLamports = Math.round(lobby.amount * LAMPORTS_PER_SOL);

    // Get configured escrow wallets for verification
    const escrowWalletAddresses = [
      process.env.ESCROW_WALLET_A_PUBLIC_KEY,
      process.env.ESCROW_WALLET_B_PUBLIC_KEY,
      process.env.ESCROW_WALLET_C_PUBLIC_KEY,
    ].filter(Boolean);

    if (escrowWalletAddresses.length === 0) {
      console.error('No escrow wallets configured for verification');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const escrowWalletKeys = escrowWalletAddresses.map(addr => new PublicKey(addr!));

    // Find transfer instruction matching (player -> escrow) for exact lamports
    const ixs = tx.transaction.message.compiledInstructions || [];
    let valid = false;
    for (const ix of ixs) {
      const prog = tx.transaction.message.staticAccountKeys[ix.programIdIndex]?.toBase58?.();
      if (prog !== SystemProgram.programId.toBase58()) continue;
      
      if (!tx.meta) continue;
      const accKeys = tx.transaction.message.staticAccountKeys;
      const playerIdx = accKeys.findIndex(k => k.equals(playerKey));
      if (playerIdx < 0) continue;
      
      const pre = tx.meta.preBalances[playerIdx];
      const post = tx.meta.postBalances[playerIdx];
      if (pre - post < expectedLamports) continue;
      
      // SECURITY: Verify the recipient is one of our escrow wallets
      const recipientIdx = tx.meta.postBalances.findIndex((b, i) => 
        i !== playerIdx && (b - tx.meta!.preBalances[i]) >= expectedLamports
      );
      
      if (recipientIdx >= 0) {
        const recipientKey = accKeys[recipientIdx];
        const isEscrowWallet = escrowWalletKeys.some(escrowKey => escrowKey.equals(recipientKey));
        
        if (isEscrowWallet) {
          valid = true;
          console.log(`✅ Wager verified: ${playerPublicKey} -> ${recipientKey.toBase58()} (${expectedLamports / LAMPORTS_PER_SOL} SOL)`);
          break;
        } else {
          console.warn(`⚠️ Transfer recipient ${recipientKey.toBase58()} is not a configured escrow wallet`);
        }
      }
    }

    if (!valid) {
      return NextResponse.json({ error: 'Wager transaction not verified' }, { status: 400 });
    }

    // Mark signature as used (best-effort)
    confirmedSignatures.add(signature);

    player.hasWagered = true;
    player.isReady = true;
    
    console.log(`Player ${player.playerId} is now ready in lobby ${lobbyId}`);

    return NextResponse.json({ message: "Player status updated to ready", lobby });

  } catch (error) {
    console.error("Error confirming wager:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred."
    return NextResponse.json({ error: "Failed to confirm wager.", details: errorMessage }, { status: 500 });
  }
} 