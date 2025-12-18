import { NextResponse, NextRequest } from 'next/server';
import { lobbies } from '@/lib/lobbies';
import { authService } from '@/lib/auth-service';
import { auditLogger } from '@/lib/audit-logger';
import { withRateLimit, RATE_LIMITS } from '@/lib/rate-limiter';
import { z } from 'zod';
import { isBsc } from '@/lib/chain';
import { getEvmProvider } from '@/lib/evm-config';
import { ethers } from 'ethers';
import { Connection, LAMPORTS_PER_SOL, clusterApiUrl, PublicKey } from '@solana/web3.js';
import { createClient } from '@supabase/supabase-js';

function paidMatchesEnabled(): boolean {
  try {
    const enabled = String(process.env.ENABLE_PAID_MATCHES || '').toLowerCase() === 'true'
    if (!enabled) return false
    const hasSupabase = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
    const hasSettlement = Boolean(process.env.PAYOUT_SERVER_SECRET)
    const hasRefund = Boolean(process.env.REFUND_SERVER_TOKEN)
    const hasHouse = Boolean(process.env.NEXT_PUBLIC_ADMIN_WALLET)
    return hasSupabase && hasSettlement && hasRefund && hasHouse
  } catch {
    return false
  }
}

function paidMatchesDiagnostics(): Record<string, boolean> {
  try {
    const enableFlag = String(process.env.ENABLE_PAID_MATCHES || '').toLowerCase() === 'true'
    const hasSupabaseUrl = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL)
    const hasServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
    const hasSettlement = Boolean(process.env.PAYOUT_SERVER_SECRET)
    const hasRefund = Boolean(process.env.REFUND_SERVER_TOKEN)
    const hasHouse = Boolean(process.env.NEXT_PUBLIC_ADMIN_WALLET)
    return { enableFlag, hasSupabaseUrl, hasServiceRole, hasSettlement, hasRefund, hasHouse }
  } catch {
    return { enableFlag: false, hasSupabaseUrl: false, hasServiceRole: false, hasSettlement: false, hasRefund: false, hasHouse: false }
  }
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
      intentId: z.string().uuid().optional(),
    });

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body', details: parsed.error.flatten() }, { status: 400 });
    }

    const { lobbyId, signature, playerPublicKey, intentId } = parsed.data;

    if (!lobbyId || !signature || !playerPublicKey) {
      return NextResponse.json({ error: 'Lobby ID, signature, and player public key are required' }, { status: 400 });
    }

    // EVM-only build: validate EVM address format lightly if needed (skipped here)

    const lobby = lobbies.find(l => l.id === lobbyId);

    if (!lobby) {
      return NextResponse.json({ error: 'Lobby not found' }, { status: 404 });
    }

    if (Number(lobby.amount || 0) > 0 && !paidMatchesEnabled()) {
      return NextResponse.json({ error: 'Wagered matches are disabled', checks: paidMatchesDiagnostics() }, { status: 403 })
    }

    const normalizeForMatch = (id: unknown) => {
      try {
        const s = String(id || '').trim()
        if (!s) return { raw: '', lower: '' }
        if (s.toLowerCase().startsWith('guest_')) return { raw: s.toLowerCase(), lower: s.toLowerCase() }
        if (/^0x[0-9a-fA-F]{40}$/.test(s)) return { raw: s.toLowerCase(), lower: s.toLowerCase() }
        return { raw: s, lower: s.toLowerCase() }
      } catch {
        return { raw: '', lower: '' }
      }
    }

    const who = normalizeForMatch(playerPublicKey)

    let player = lobby.players.find(p => {
      const cur = normalizeForMatch(p.playerId)
      return (cur.raw && who.raw && cur.raw === who.raw) || (cur.lower && who.lower && cur.lower === who.lower)
    });

    // NOTE: On Render/Vercel deployments, API requests can be routed across instances.
    // For paid lobbies, we still want to fail closed, but we can recover safely if:
    // - a wager intent exists for this wallet+lobby, OR
    // - socket presence already indicates the player is in the lobby.
    if (!player) {
      const isPaid = Number(lobby.amount || 0) > 0
      let canInsert = !isPaid

      if (isPaid) {
        // Prefer intent-based membership (DB-backed) when available
        try {
          if (intentId) {
            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
            const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
            if (supabaseUrl && supabaseServiceKey) {
              const supabase = createClient(supabaseUrl, supabaseServiceKey);
              const { data } = await supabase
                .from('wager_deposits')
                .select('intent_id,lobby_id,player_wallet,status')
                .eq('intent_id', intentId)
                .maybeSingle();

              const ok = Boolean(
                data &&
                String((data as any).lobby_id || '') === String(lobbyId) &&
                (
                  String((data as any).player_wallet || '') === who.raw ||
                  String((data as any).player_wallet || '').toLowerCase() === who.lower
                )
              )
              if (ok) canInsert = true
            }
          }
        } catch {}

        // Fallback: allow insert if socket presence indicates membership
        try {
          const presence: Set<string> | undefined = (global as any).lobbyPresence?.get?.(lobbyId)
          if (presence && (presence.has(who.raw) || presence.has(who.lower))) {
            canInsert = true
          }
        } catch {}
      }

      if (!canInsert) {
        return NextResponse.json({ error: 'Player not found in this lobby' }, { status: 404 });
      }

      // Best-effort roster insert to keep UX working.
      try {
        const username = (who.raw || playerPublicKey || '').slice(0, 8) + '...';
        const newP: any = { playerId: who.raw || playerPublicKey, chickenId: 'default-chicken', username, hasWagered: false, isReady: false };
        lobby.players.push(newP);
        player = newP;
      } catch {}

      if (!player) {
        return NextResponse.json({ error: 'Player not found in this lobby' }, { status: 404 });
      }
    }

    // Verify the transaction moved the exact wager to the escrow wallet
    // Replay protection (database-backed)

    let isUsed = false;
    try {
      isUsed = await authService.isSignatureUsed(signature);
    } catch (e: any) {
      console.error('Replay protection unavailable:', e?.message || String(e));
      return NextResponse.json({ error: 'Replay protection unavailable' }, { status: 503 });
    }
    if (isUsed) {
      await auditLogger.logSuspiciousActivity(
        'Wager signature replay attempt',
        playerPublicKey,
        req.headers.get('x-forwarded-for') || undefined,
        { signature, lobbyId }
      );
      return NextResponse.json({ error: 'Signature already confirmed' }, { status: 409 });
    }

    const shouldRequireIntent = (() => {
      try {
        return Number(lobby.amount || 0) > 0 && Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
      } catch {
        return false
      }
    })();
    if (shouldRequireIntent && !intentId) {
      return NextResponse.json({ error: 'Missing wager intent' }, { status: 400 });
    }

    if (isBsc()) {
      // EVM: signature = txHash
      const provider = getEvmProvider();
      // Poll for receipt to avoid race when immediately confirming after send
      // Poll for a confirmed receipt with a longer timeout to handle network latency
      let receipt = await provider.getTransactionReceipt(signature);
      const maxWaitMs = parseInt(process.env.WAGER_CONFIRM_TIMEOUT_MS || '90000', 10); // default 90s
      const pollIntervalMs = 1500; // 1.5s between polls
      const startWaitAt = Date.now();
      while ((!receipt || receipt.status !== 1) && (Date.now() - startWaitAt) < maxWaitMs) {
        await new Promise(r => setTimeout(r, pollIntervalMs));
        try { receipt = await provider.getTransactionReceipt(signature); } catch {}
      }
      if (!receipt || receipt.status !== 1) {
        return NextResponse.json({ error: 'Transaction not found or failed (timeout waiting for confirmation)' }, { status: 400 });
      }
      const tx = await provider.getTransaction(signature);
      if (!tx) {
        return NextResponse.json({ error: 'Transaction not found' }, { status: 400 });
      }
      // Basic checks
      if (tx.from?.toLowerCase() !== playerPublicKey.toLowerCase()) {
        return NextResponse.json({ error: 'Sender mismatch' }, { status: 400 });
      }
      // Ensure lobby escrow is assigned; if missing, infer from tx.to
      const txTo = String(tx.to || '').toLowerCase();
      if (!lobby.escrowWalletId) {
        try {
          const a = (process.env.EVM_ESCROW_A_ADDRESS || '').toLowerCase();
          const b = (process.env.EVM_ESCROW_B_ADDRESS || '').toLowerCase();
          const c = (process.env.EVM_ESCROW_C_ADDRESS || '').toLowerCase();
          const matchId = txTo === a ? 'A' : txTo === b ? 'B' : txTo === c ? 'C' : null;
          if (matchId) {
            lobby.escrowWalletId = matchId as any;
            console.log(`🔐 Inferred escrow ${matchId} for lobby ${lobbyId} from tx recipient`);
          } else {
            await auditLogger.logSuspiciousActivity('EVM wager to unknown escrow', playerPublicKey, undefined, { lobbyId, signature, txTo });
            return NextResponse.json({ error: 'Lobby escrow wallet not assigned' }, { status: 500 });
          }
        } catch {
          return NextResponse.json({ error: 'Lobby escrow wallet not assigned' }, { status: 500 });
        }
      }
      const expectedValue = ethers.parseUnits(lobby.amount.toString(), 18);
      const envKey = `EVM_ESCROW_${lobby.escrowWalletId}_ADDRESS`;
      const expectedEscrow = process.env[envKey];
      if (!expectedEscrow) {
        return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
      }
      if (txTo !== expectedEscrow.toLowerCase()) {
        await auditLogger.logSuspiciousActivity('EVM wager to wrong escrow', playerPublicKey, undefined, { lobbyId, expectedEscrow, actual: tx.to });
        return NextResponse.json({ error: 'Recipient mismatch' }, { status: 400 });
      }
      if (tx.value !== expectedValue) {
        return NextResponse.json({ error: 'Amount mismatch' }, { status: 400 });
      }
      // Record exact funding wallet for deterministic refunds
      try { (player as any).__fundingWallet = tx.from; } catch {}

      try {
        if (intentId) {
          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
          const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
          if (supabaseUrl && supabaseServiceKey) {
            const supabase = createClient(supabaseUrl, supabaseServiceKey);
            await supabase
              .from('wager_deposits')
              .update({
                player_wallet: String(playerPublicKey || '').toLowerCase(),
                deposit_signature: signature,
                status: 'confirmed',
                commitment: 'confirmed',
              })
              .eq('intent_id', intentId);
          }
        }
      } catch {}
    } else {
      // Solana: signature refers to a confirmed transfer to lobby escrow for exact lamports
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
      const connection = new Connection(rpcUrl, { commitment: 'confirmed' } as any)
      const maxWaitMs = parseInt(process.env.WAGER_CONFIRM_TIMEOUT_MS || '90000', 10)
      const pollMs = 1500
      let tx: any = null

      // Poll status first, then fetch transaction (race-safe).
      try {
        const startedAt = Date.now()
        while ((Date.now() - startedAt) < maxWaitMs) {
          try {
            const st: any = await connection.getSignatureStatuses([signature], { searchTransactionHistory: true } as any)
            const s0: any = st?.value?.[0]
            if (s0?.err) break
            const cs = String(s0?.confirmationStatus || '')
            if (cs === 'confirmed' || cs === 'finalized') {
              try {
                tx = await connection.getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 } as any)
              } catch {}
              if (tx) break
            }
          } catch {}
          await new Promise(r => setTimeout(r, pollMs))
        }
      } catch {}

      if (!tx) {
        try {
          tx = await connection.getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 } as any)
        } catch {}
      }

      if (!tx) return NextResponse.json({ error: 'Transaction not found' }, { status: 400 })

      const amountLamports = Math.round(lobby.amount * LAMPORTS_PER_SOL)
      const toExpected = (() => {
        const id = lobby.escrowWalletId
        const key = id ? `ESCROW_WALLET_${id}_PUBLIC_KEY` : ''
        return (key && process.env[key]) ? process.env[key] : null
      })()
      if (!toExpected) {
        return NextResponse.json({ error: 'Lobby escrow wallet not assigned' }, { status: 500 })
      }

      const sender = new PublicKey(playerPublicKey).toBase58()
      let found = false
      try {
        const meta = tx.meta
        const message = tx.transaction.message
        if (meta && message) {
          const pre = meta.preBalances
          const post = meta.postBalances
          const acctKeys = message.getAccountKeys().staticAccountKeys
          for (let i = 0; i < acctKeys.length; i++) {
            const before = pre[i]
            const after = post[i]
            const delta = (after - before)
            if (delta !== amountLamports) continue
            const recipient = acctKeys[i].toBase58()
            if (recipient !== toExpected) continue
            for (let j = 0; j < acctKeys.length; j++) {
              if ((pre[j] - post[j]) >= amountLamports) {
                const from = acctKeys[j].toBase58()
                if (from === sender) {
                  found = true
                  break
                }
              }
            }
            if (found) break
          }
        }
      } catch {}

      if (!found) {
        return NextResponse.json({ error: 'Wager transfer not found or mismatched' }, { status: 400 })
      }

      try {
        if (intentId) {
          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
          const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
          if (supabaseUrl && supabaseServiceKey) {
            const supabase = createClient(supabaseUrl, supabaseServiceKey);
            await supabase
              .from('wager_deposits')
              .update({
                player_wallet: String(playerPublicKey || ''),
                deposit_signature: signature,
                status: 'confirmed',
                commitment: 'confirmed',
                slot: (tx as any).slot ?? null,
              })
              .eq('intent_id', intentId);
          }
        }
      } catch {}
    }

    // Mark signature as used (database-backed)
    try {
      await authService.markSignatureUsed(
        signature,
        playerPublicKey,
        '/api/wager/confirm',
        { lobbyId, amount: lobby.amount, intentId: intentId || null }
      );

    } catch (e: any) {
      console.error('Failed to persist replay protection record:', e?.message || String(e));
      return NextResponse.json({ error: 'Failed to finalize wager confirmation' }, { status: 503 });
    }

    player.hasWagered = true;
    try { (player as any).__lastWagerSig = signature; } catch {}
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
        // Flip any active socket connection to ready for this lobby
        try {
          const active = (global as any).activeConnections;
          for (const [, conn] of (active && active.entries && active.entries()) || []) {
            if (conn && String(conn.walletAddress || '').toLowerCase() === String(playerPublicKey).toLowerCase()) {
              if (!conn.currentLobby) conn.currentLobby = lobbyId;
              conn.isReady = true;
            }
          }
        } catch {}
        socketIo.to(lobbyId).emit('roster_diff', { lobbyId, action: 'upsert', player: { playerId: playerPublicKey, hasWagered: true, isReady: true } });
        socketIo.to(lobbyId).emit('player_ready_status', { lobbyId, playerId: playerPublicKey, isReady: true });
        // Emit a full lobby_synced snapshot for instant UI update
        try {
          const build = (global as any).__buildLobbySnapshot;
          const snap = build ? await build(lobbyId) : null;
          if (snap) socketIo.to(lobbyId).emit('lobby_synced', snap);
        } catch {}
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
            const next = { ...cur, hasWagered: true, isReady: true, lastWagerSig: signature };
                map.set(key, next);
                return next;
              }
            } catch {}
        return { playerId: playerPublicKey, hasWagered: true, isReady: true, lastWagerSig: signature } as any;
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