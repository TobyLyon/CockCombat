import { NextResponse } from 'next/server';
import { lobbies, type Lobby } from '@/lib/lobbies';
import { z } from 'zod';
import { isBsc } from '@/lib/chain';
import { evmEscrowService } from '@/lib/evm-escrow-service';
import { getEvmProvider } from '@/lib/evm-config';
import { ethers } from 'ethers';

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

    // EVM-only build: skip Solana key validation

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

    if (isBsc()) {
      // EVM path: return an unsigned tx (player -> escrow)
      let w = lobby.escrowWalletId ? evmEscrowService.getWallet(lobby.escrowWalletId as any) : undefined;
      if (!w) {
        w = evmEscrowService.getNextWallet();
        lobby.escrowWalletId = w.id;
      }
      const provider = getEvmProvider();
      const valueWei = ethers.parseUnits(lobby.amount.toString(), 18);
      // Client will sign and send this transaction; we just return target + value
      return NextResponse.json({
        chain: 'bsc',
        to: w.address,
        value: valueWei.toString(),
        lobbyId: lobbyId,
      });
    }

    // EVM-only: unreachable fallback
    return NextResponse.json({ error: 'Unsupported chain' }, { status: 500 });

  } catch (error) {
    console.error("❌ Error creating wager transaction:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ 
      error: "Failed to create wager transaction",
      details: errorMessage,
    }, { status: 500 });
  }
} 