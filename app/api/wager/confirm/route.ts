import { NextResponse, NextRequest } from 'next/server';
import { lobbies } from '@/lib/lobbies';
// Solana imports removed in EVM-only build
import { authService } from '@/lib/auth-service';
import { auditLogger } from '@/lib/audit-logger';
import { withRateLimit, RATE_LIMITS } from '@/lib/rate-limiter';
import { z } from 'zod';
import { isBsc, toNativeUnits } from '@/lib/chain';
import { getEvmProvider } from '@/lib/evm-config';
import { ethers } from 'ethers';

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

    const lobby = lobbies.find(l => l.id === lobbyId);
    if (!lobby) {
      return NextResponse.json({ error: 'Lobby not found' }, { status: 404 });
    }

    let player = lobby.players.find(p => {
      const a = String(p.playerId || '').toLowerCase();
      const b = String(playerPublicKey || '').toLowerCase();
      return a === b;
    });
    if (!player) {
      // Fallback: add the wallet into this lobby roster to ensure confirm can proceed (server will enforce payouts)
      try {
        const username = (playerPublicKey || '').slice(0, 8) + '...';
        const newP: any = { playerId: playerPublicKey, chickenId: 'default-chicken', username, hasWagered: false, isReady: false };
        lobby.players.push(newP);
        player = newP;
      } catch {}
      if (!player) {
        return NextResponse.json({ error: 'Player not found in this lobby' }, { status: 404 });
      }
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
      if (!lobby.escrowWalletId) {
        await auditLogger.logSuspiciousActivity('EVM wager without assigned escrow', playerPublicKey, undefined, { lobbyId, signature });
        return NextResponse.json({ error: 'Lobby escrow wallet not assigned' }, { status: 500 });
      }
      const expectedValue = ethers.parseUnits(lobby.amount.toString(), 18);
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
      { lobbyId, amount: lobby.amount }
    );

    player.hasWagered = true;
    player.isReady = true;
    try {
      // Normalize stored playerId to input case to avoid mismatched case downstream
      player.playerId = String(playerPublicKey);
    } catch {}
    // De-duplicate any existing entries for this wallet (prefer the one with hasWagered=true)
    try {
      const pidNorm = String(playerPublicKey || '').toLowerCase();
      const keep = lobby.players.reduce((best: any | null, p: any) => {
        const id = String(p.playerId || '').toLowerCase();
        if (id !== pidNorm) return best;
        if (!best) return p;
        // Prefer entry that is wagered/ready; otherwise keep the latest
        if (!!p.hasWagered && !best.hasWagered) return p;
        return p; // last-writer-wins
      }, null);
      const next: any[] = [];
      const seen = new Set<string>();
      for (const p of lobby.players) {
        const id = String(p.playerId || '').toLowerCase();
        if (id === pidNorm) {
          if (!seen.has(id)) { next.push(keep || p); seen.add(id); }
        } else {
          next.push(p);
        }
      }
      lobby.players = next;
    } catch {}
    
    console.log(`[WAGER][CONFIRMED]`, { lobbyId, player: player.playerId, signature });
    try {
      const socketIo: any = (global as any).socketIo;
      if (socketIo) {
        // Upsert into in-memory roster so readiness checks pick it up immediately
        try {
          const map = ((global as any).lobbyRoster && (global as any).lobbyRoster.get?.(lobbyId)) || null;
          if (map && map.set) {
            const key = String(playerPublicKey).toLowerCase();
            const cur = map.get(key) || { playerId: playerPublicKey };
            map.set(key, { ...cur, hasWagered: true, isReady: true });
          }
        } catch {}
        socketIo.to(lobbyId).emit('roster_diff', { lobbyId, action: 'upsert', player: { playerId: playerPublicKey, hasWagered: true, isReady: true } });
        socketIo.to(lobbyId).emit('player_ready_status', { lobbyId, playerId: playerPublicKey, isReady: true });
      }
    } catch {}

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