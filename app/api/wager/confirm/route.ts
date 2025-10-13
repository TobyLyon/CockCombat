import { NextResponse, NextRequest } from 'next/server';
// Use server-held state not API/lib
// Solana imports removed in EVM-only build
import { authService } from '@/lib/auth-service';
import { auditLogger } from '@/lib/audit-logger';
import { withRateLimit, RATE_LIMITS } from '@/lib/rate-limiter';
import { z } from 'zod';
import { isBsc, toNativeUnits } from '@/lib/chain';
import { getEvmProvider } from '@/lib/evm-config';
import { ethers } from 'ethers';

// Local fallback catalog to avoid any HTTP dependency if global server catalog isn't available
function getLobbyMetaLocal(lobbyId: string) {
  const CATALOG = [
    { id: 'tutorial-1', amount: 0, currency: 'FREE', capacity: 8, matchType: 'tutorial', escrowWalletId: null as any },
    { id: 'lobby-0p005', amount: 0.005, currency: 'BNB', capacity: 8, matchType: 'ranked', escrowWalletId: null as any },
    { id: 'lobby-0p005-2', amount: 0.005, currency: 'BNB', capacity: 8, matchType: 'ranked', escrowWalletId: null as any },
    { id: 'lobby-0.01', amount: 0.01, currency: 'BNB', capacity: 8, matchType: 'ranked', escrowWalletId: null as any },
  ];
  return CATALOG.find(l => l.id === lobbyId) || null;
}

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

  // EVM-only build: validate EVM address format lightly if needed (skipped here)

    const lobbyMeta = (global as any).getLobbyMeta ? (global as any).getLobbyMeta(lobbyId) : getLobbyMetaLocal(lobbyId);
    if (!lobbyMeta) {
      return NextResponse.json({ error: 'Lobby not found' }, { status: 404 });
    }
    // Read/initialize roster entry from server memory
    const rosterMap = (global as any).lobbyRoster?.get(lobbyId) || new Map();
    try { if (!(global as any).lobbyRoster?.has?.(lobbyId)) { (global as any).lobbyRoster.set(lobbyId, rosterMap) } } catch {}

    const pidNorm = String(playerPublicKey || '').toLowerCase();
    let player = rosterMap.get(pidNorm) || null;
    if (!player) {
      const username = (playerPublicKey || '').slice(0, 8) + '...';
      player = { playerId: playerPublicKey, chickenName: 'Default', username, hasWagered: false, isReady: false } as any;
      try { rosterMap.set(pidNorm, player); } catch {}
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
      // Poll for receipt to avoid race when immediately confirming after send
      let receipt = await provider.getTransactionReceipt(signature);
      let attempts = 0;
      while ((!receipt || receipt.status !== 1) && attempts < 8) {
        await new Promise(r => setTimeout(r, 750));
        receipt = await provider.getTransactionReceipt(signature);
        attempts++;
      }
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
      if (!lobbyMeta.escrowWalletId) {
        await auditLogger.logSuspiciousActivity('EVM wager without assigned escrow', playerPublicKey, undefined, { lobbyId, signature });
        return NextResponse.json({ error: 'Lobby escrow wallet not assigned' }, { status: 500 });
      }
      const expectedValue = ethers.parseUnits(String(lobbyMeta.amount), 18);
      const envKey = `EVM_ESCROW_${lobbyMeta.escrowWalletId}_ADDRESS`;
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
      // Record exact funding wallet for deterministic refunds
      try { (player as any).__fundingWallet = tx.from; } catch {}
    } else {
      return NextResponse.json({ error: 'Unsupported chain' }, { status: 500 });
    }

    // Mark signature as used (database-backed)
    await authService.markSignatureUsed(
      signature,
      playerPublicKey,
      '/api/wager/confirm',
      { lobbyId, amount: lobbyMeta.amount }
    );

    player.hasWagered = true;
    player.isReady = true;
    try {
      // Normalize stored playerId to input case to avoid mismatched case downstream
      player.playerId = String(playerPublicKey);
    } catch {}
    // De-duplicate any existing entries for this wallet (prefer the one with hasWagered=true)
    try {
      try { rosterMap.set(pidNorm, player); } catch {}
    } catch {}
    
    console.log(`Player ${player.playerId} is now ready in lobby ${lobbyId}`);

    // Broadcast updated readiness immediately so Match Room reflects it
    try {
      const io = (global as any).socketIo;
      if (io) {
        // Also mark any active socket connection for this wallet as ready so server-side checks pick it up
        try {
          const active = (global as any).activeConnections;
          if (active && typeof active.entries === 'function') {
            for (const [, conn] of active.entries()) {
              if (conn && conn.walletAddress && conn.walletAddress.toLowerCase?.() === playerPublicKey.toLowerCase()) {
                conn.isReady = true;
                if (!conn.currentLobby) conn.currentLobby = lobbyId;
              }
            }
          }
        } catch {}
        io.to(lobbyId).emit('player_ready_status', { playerId: playerPublicKey, isReady: true });
        // Socket-only roster diff: mark hasWagered and readiness
        try {
          const entry = await (async () => {
            try {
              const map = (global as any).lobbyRoster && (global as any).lobbyRoster.get(lobbyId);
              if (map) {
                const key = String(playerPublicKey).toLowerCase();
                const cur = map.get(key) || { playerId: playerPublicKey };
                const next = { ...cur, hasWagered: true, isReady: true };
                map.set(key, next);
                return next;
              }
            } catch {}
            return { playerId: playerPublicKey, hasWagered: true, isReady: true } as any;
          })();
          try { io.to(lobbyId).emit('roster_diff', { lobbyId, action: 'upsert', player: entry }); } catch {}
        } catch {}
      }
    } catch {}

    // Audit log the wager confirmation
    await auditLogger.log({
      eventType: 'wager_confirmed',
      actorWallet: playerPublicKey,
      endpoint: '/api/wager/confirm',
      severity: 'info',
      metadata: {
        lobbyId,
        amount: lobbyMeta.amount,
        signature,
      },
    });
    return NextResponse.json({ message: "Player status updated to ready" });

  } catch (error) {
    console.error("Error confirming wager:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred."
    return NextResponse.json({ error: "Failed to confirm wager.", details: errorMessage }, { status: 500 });
  }
} 