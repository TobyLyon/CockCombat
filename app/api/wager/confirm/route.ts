import { NextResponse, NextRequest } from 'next/server';
import { lobbies } from '@/lib/lobbies';
import { getConnection } from '@/lib/solana-config';
import { SystemProgram, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { authService } from '@/lib/auth-service';
import { auditLogger } from '@/lib/audit-logger';
import { withRateLimit, RATE_LIMITS } from '@/lib/rate-limiter';
import { z } from 'zod';
import { isBsc, toNativeUnits } from '@/lib/chain';
import { getEvmProvider } from '@/lib/evm-config';

export async function POST(req: NextRequest) {
  return withRateLimit(req, RATE_LIMITS.WAGER, async () => {
    return handleWagerConfirmation(req);
  });
}

async function handleWagerConfirmation(req: NextRequest) {
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
    // Replay protection (database-backed)
    const isUsed = await authService.isSignatureUsed(signature);
    if (isUsed) {
      await auditLogger.logSuspiciousActivity(
        'Wager signature replay attempt',
        playerPublicKey,
        req.headers.get('x-forwarded-for') || undefined,
        { signature, lobbyId }
      );
      return NextResponse.json({ error: 'Signature already confirmed' }, { status: 409 });
    }

    if (isBsc()) {
      // EVM: signature = txHash
      const provider = getEvmProvider();
      const receipt = await provider.getTransactionReceipt(signature);
      if (!receipt || receipt.status !== 1) {
        return NextResponse.json({ error: 'Transaction not found or failed' }, { status: 400 });
      }
      const tx = await provider.getTransaction(signature);
      if (!tx) {
        return NextResponse.json({ error: 'Transaction not found' }, { status: 400 });
      }
      // Basic checks
      if (tx.from?.toLowerCase() !== playerPublicKey.toLowerCase()) {
        return NextResponse.json({ error: 'Sender mismatch' }, { status: 400 });
      }
      if (!lobby.escrowWalletId) {
        await auditLogger.logSuspiciousActivity('EVM wager without assigned escrow', playerPublicKey, undefined, { lobbyId, signature });
        return NextResponse.json({ error: 'Lobby escrow wallet not assigned' }, { status: 500 });
      }
      const expectedValue = BigInt(toNativeUnits(lobby.amount));
      const envKey = `EVM_ESCROW_${lobby.escrowWalletId}_ADDRESS`;
      const expectedEscrow = process.env[envKey];
      if (!expectedEscrow) {
        return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
      }
      if (tx.to?.toLowerCase() !== expectedEscrow.toLowerCase()) {
        await auditLogger.logSuspiciousActivity('EVM wager to wrong escrow', playerPublicKey, undefined, { lobbyId, expectedEscrow, actual: tx.to });
        return NextResponse.json({ error: 'Recipient mismatch' }, { status: 400 });
      }
      if (tx.value !== expectedValue) {
        return NextResponse.json({ error: 'Amount mismatch' }, { status: 400 });
      }
    } else {
      const connection = getConnection();
      const tx = await connection.getTransaction(signature, { maxSupportedTransactionVersion: 0 });
      if (!tx || !tx.transaction) {
        return NextResponse.json({ error: 'Transaction not found' }, { status: 400 });
      }
      const expectedLamports = Math.round(lobby.amount * LAMPORTS_PER_SOL);
      if (!lobby.escrowWalletId) {
        await auditLogger.logSuspiciousActivity('Wager confirmation attempted for lobby without assigned escrow wallet', playerPublicKey, req.headers.get('x-forwarded-for') || undefined, { lobbyId, signature });
        return NextResponse.json({ error: 'Lobby escrow wallet not assigned' }, { status: 500 });
      }
      const expectedEscrowAddress = process.env[`ESCROW_WALLET_${lobby.escrowWalletId}_PUBLIC_KEY`];
      if (!expectedEscrowAddress) {
        return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
      }
      const expectedEscrowKey = new PublicKey(expectedEscrowAddress);
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
        const recipientIdx = tx.meta.postBalances.findIndex((b, i) => i !== playerIdx && (b - tx.meta!.preBalances[i]) >= expectedLamports);
        if (recipientIdx >= 0) {
          const recipientKey = accKeys[recipientIdx];
          if (recipientKey.equals(expectedEscrowKey)) { valid = true; break; }
        }
      }
      if (!valid) {
        return NextResponse.json({ error: 'Wager transaction not verified' }, { status: 400 });
      }
    }

    // Mark signature as used (database-backed)
    await authService.markSignatureUsed(
      signature,
      playerPublicKey,
      '/api/wager/confirm',
      { lobbyId, amount: lobby.amount }
    );

    player.hasWagered = true;
    player.isReady = true;
    
    console.log(`Player ${player.playerId} is now ready in lobby ${lobbyId}`);

    // Audit log the wager confirmation
    await auditLogger.log({
      eventType: 'wager_confirmed',
      actorWallet: playerPublicKey,
      endpoint: '/api/wager/confirm',
      severity: 'info',
      metadata: {
        lobbyId,
        amount: lobby.amount,
        signature,
      },
    });

    return NextResponse.json({ message: "Player status updated to ready", lobby });

  } catch (error) {
    console.error("Error confirming wager:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred."
    return NextResponse.json({ error: "Failed to confirm wager.", details: errorMessage }, { status: 500 });
  }
} 