import { NextResponse, NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { lobbies, lobbyTimers, type Lobby } from '@/lib/lobbies';
import { authService } from '@/lib/auth-service';
import { auditLogger } from '@/lib/audit-logger';
import { withRateLimit, RATE_LIMITS } from '@/lib/rate-limiter';
import { z } from 'zod';
import { PublicKey } from '@solana/web3.js';

// Import the socket.io instance
let io: any = null;

// Function to get the io instance from the running server
async function getSocketInstance() {
  if (!io) {
    try {
      // Access the global socket instance stored by server.js
      io = (global as any).socketIo;
    } catch (error) {
      console.log('Socket.IO not available during build time, this is normal');
    }
  }
  return io;
}

// Username cache to reduce database queries
const usernameCache = new Map<string, { username: string; timestamp: number }>();
 const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

 function paidLobbiesUnlocked(): { unlocked: boolean; unlockAtMs: number | null } {
   try {
     const raw = String(process.env.PAID_LOBBIES_UNLOCK_AT || process.env.NEXT_PUBLIC_PAID_LOBBIES_UNLOCK_AT || '').trim()
     if (!raw) return { unlocked: true, unlockAtMs: null }
     const ms = Number(raw)
     if (!isFinite(ms) || ms <= 0) return { unlocked: true, unlockAtMs: null }
     return { unlocked: Date.now() >= ms, unlockAtMs: ms }
   } catch {
     return { unlocked: true, unlockAtMs: null }
   }
 }

 function paidMatchesDiagnostics(): { enabled: boolean; checks: Record<string, boolean> } {
   try {
     const enableFlag = String(process.env.ENABLE_PAID_MATCHES || '').toLowerCase() === 'true'
     const hasSupabaseUrl = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL)
     const hasServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
     const hasSupabase = Boolean(hasSupabaseUrl && hasServiceRole)
     const hasSettlement = Boolean(process.env.PAYOUT_SERVER_SECRET)
     const hasRefund = Boolean(process.env.REFUND_SERVER_TOKEN)
     const hasHouse = Boolean(process.env.NEXT_PUBLIC_ADMIN_WALLET)
     const unlock = paidLobbiesUnlocked()
     const enabled = Boolean(enableFlag && hasSupabase && hasSettlement && hasRefund && hasHouse && unlock.unlocked)
     return { enabled, checks: { enableFlag, hasSupabaseUrl, hasServiceRole, hasSettlement, hasRefund, hasHouse, paidUnlocked: unlock.unlocked } }
   } catch {
     return { enabled: false, checks: { enableFlag: false, hasSupabaseUrl: false, hasServiceRole: false, hasSettlement: false, hasRefund: false, hasHouse: false, paidUnlocked: false } }
   }
 }

 function paidMatchesEnabled(): boolean {
   return paidMatchesDiagnostics().enabled
 }

// Helper function to get profile username with caching
async function getPlayerUsername(playerId: string): Promise<string> {
  try {
    // Check cache first
    const cached = usernameCache.get(playerId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.username;
    }

    // Cache miss or expired - fetch from database
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // The `setAll` method was called from a Server Component.
              // This can be ignored if you have middleware refreshing
              // user sessions.
            }
          },
        },
      }
    );

    const lower = String(playerId || '').toLowerCase()
    const { data: profile } = await supabase
      .from('profiles')
      .select('username')
      .or(`wallet_address.eq.${playerId},wallet_address.eq.${lower}`)
      .single();

    const username = profile?.username || playerId.slice(0, 8) + '...';
    
    // Cache the result for 5 minutes
    usernameCache.set(playerId, {
      username,
      timestamp: Date.now()
    });

    return username;
  } catch (error) {
    console.error('Error fetching username:', error);
    return playerId.slice(0, 8) + '...';
  }
}

// Tutorial AI helpers removed

function removeOneAiPlayer(lobby: any) {
  const idx = lobby.players.findIndex((p: any) => p.isAi)
  if (idx >= 0) lobby.players.splice(idx, 1)
}

// Tutorial AI helpers removed

// API handler to get the current state of all lobbies
export async function GET(req: NextRequest) {
  return withRateLimit(req, RATE_LIMITS.READ, async () => {
    try {
      // Prune ghost humans from FREE lobbies based on live presence before returning
      for (const lob of lobbies) {
        try {
          const isFree = (lob && lob.matchType !== 'tutorial') && ((lob.amount || 0) === 0);
          if (!isFree || !Array.isArray(lob.players)) continue;
          const presence: Set<string> = ((global as any).lobbyPresence && (global as any).lobbyPresence.get && (global as any).lobbyPresence.get(lob.id)) || new Set();
          const allowed = new Set<string>();
          try { for (const a of presence.values()) { allowed.add(String(a || '').toLowerCase()); } } catch {}
          lob.players = lob.players.filter((p: any) => allowed.has(String(p?.playerId || '').toLowerCase()));
        } catch {}
      }
    } catch {}
    return NextResponse.json(lobbies);
  });
}

// API handler for a player to join a lobby
export async function POST(req: NextRequest) {
  return withRateLimit(req, RATE_LIMITS.LOBBY, async () => {
    const BodySchema = z.object({
      lobbyId: z.string().min(3),
      playerId: z.string().min(3),
      chickenId: z.string().min(1).optional(),
      sessionId: z.string().uuid().optional(),
    });
    
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body', details: parsed.error.flatten() }, { status: 400 });
    }
    const { lobbyId, chickenId, sessionId } = parsed.data;
    const playerId = String(parsed.data.playerId);
    const playerIdLower = playerId.toLowerCase();

    const lobby = lobbies.find(l => l && l.id === lobbyId);

    if (!lobby) {
      return NextResponse.json({ error: 'Lobby not found' }, { status: 404 });
    }

    // Block joins when lobby is LIVE/in-progress; allow during starting/ACTIVE only for presence refresh
    if (lobby.status === 'in-progress') {
      return NextResponse.json({ error: 'Lobby is not open for joining' }, { status: 409 });
    }

    // Block wagered matches for now
    try {
      const amt = Number(lobby.amount || 0);
      const isPaid = amt > 0;
      const lamports = Math.round(amt * 1_000_000_000);
      const isAllowedPaidTier = lamports === 10_000_000 || lamports === 50_000_000;
      if (isPaid && !paidMatchesEnabled()) {
        const diag = paidMatchesDiagnostics()
        return NextResponse.json({ error: 'Wagered matches are disabled', checks: diag.checks }, { status: 403 });
      }
      if (isPaid && !isAllowedPaidTier) {
        return NextResponse.json({ error: 'Wagered matches are not available yet' }, { status: 403 });
      }
    } catch {}

    // Prevent joins if lobby is starting (countdown), queued, or currently in an active match window
    try {
      const isCountdownActive = Boolean((global as any).countdownActive && (global as any).countdownActive[lobbyId]);
      const hasQueueSession = Boolean((global as any).activeQueueForLobby && (global as any).activeQueueForLobby.get(lobbyId));
      const inActiveMatchWindow = (() => {
        try {
          const map = (global as any).recentMatchMetaBySession;
          if (!map || typeof map.values !== 'function') return false;
          const lockMs = Math.max(5_000, parseInt(String(process.env.LOBBY_LOCK_MS || ''), 10) || 45_000); // default 45s, min 5s
          for (const meta of map.values()) {
            if (meta && meta.lobbyId === lobbyId) {
              // Only treat as active if a round actually started, and not after round end
              const startedAt = Number((meta as any).roundStartedAt || 0);
              const endedAt = Number((meta as any).roundEndedAt || 0);
              if (endedAt && endedAt > startedAt) return false;
              if (startedAt && Date.now() < (startedAt + lockMs)) return true;
            }
          }
        } catch {}
        return false;
      })();
      if (isCountdownActive || hasQueueSession || inActiveMatchWindow) {
        return NextResponse.json({ error: 'Lobby is in an active match. Please try again shortly.' }, { status: 409 });
      }
    } catch {}

    // Enforce: guests (playerId starting with 'guest_') can only join free lobbies
    try {
      const isGuest = String(playerId || '').startsWith('guest_');
      const isFree = Number(lobby.amount || 0) === 0;
      if (isGuest && !isFree) {
        return NextResponse.json({ error: 'Guests can only join free lobbies' }, { status: 403 });
      }
    } catch {}

    // Paid lobbies require a wallet address (Solana public key)
    try {
      const amt = Number(lobby.amount || 0);
      if (amt > 0) {
        new PublicKey(playerId);
      }
    } catch {
      return NextResponse.json({ error: 'Wallet required' }, { status: 403 });
    }

    if (lobby.players.length >= lobby.capacity) {
      return NextResponse.json({ error: 'Lobby is full' }, { status: 400 });
    }

    // Allow ranked lobby joins without full auth; enforce wager/auth at ready-up/confirmation time
    // (Previously required session validation here.)

    // Enforce single-lobby membership: remove this player from any other lobby before proceeding
    try {
      const socketIo = await getSocketInstance();
      const playerLower = playerIdLower;
      for (const other of lobbies) {
        if (!other || other.id === lobbyId) continue;
        const idxOther = other.players.findIndex(p => String(p.playerId || '').toLowerCase() === playerLower);
        if (idxOther !== -1) {
          const removed = other.players.splice(idxOther, 1)[0];
          // Clear presence for the old lobby
          try {
            const presenceSet = (global as any).lobbyPresence?.get(other.id);
            presenceSet?.delete(playerLower);
          } catch {}
          // Broadcast removal + updated roster for the old lobby
          if (socketIo) {
            try {
              socketIo.to(other.id).emit('player_left_lobby', {
                playerId: playerLower,
                timestamp: Date.now()
              });
              const lobbyPlayers = other.players.map(p => ({
                playerId: p.playerId,
                username: p.username || p.playerId.slice(0, 8) + '...',
                chickenName: p.chickenId || 'Default',
                isReady: p.isAi ? true : Boolean((p as any).isReady),
                isAi: p.isAi || false
              }));
              const nextVersion = (() => { try { const cur = ((global as any).lobbyVersions?.get(other.id) || 0) + 1; (global as any).lobbyVersions?.set(other.id, cur); return cur } catch { return 1 } })();
              socketIo.to(other.id).emit('lobby_updated', {
                id: other.id,
                players: lobbyPlayers,
                capacity: other.capacity,
                amount: other.amount,
                currency: other.currency,
                matchType: other.matchType,
                version: nextVersion
              });
              // Emit live counts snapshot immediately after removal
              try {
                const ac = (global as any).activeConnections;
                let humans = 0, total = 0;
                for (const [, conn] of (ac && ac.entries && ac.entries()) || []) {
                  if (conn && conn.currentLobby === other.id && conn.walletAddress) {
                    total += 1; const addr = String(conn.walletAddress || ''); if (!addr.startsWith('ai-')) humans += 1;
                  }
                }
                socketIo.emit('lobby_counts', { id: other.id, liveHumans: humans, liveTotal: total });
              } catch {}
            } catch {}
          }
        }
      }
    } catch (e) {
      console.warn('Single-lobby enforcement failed (non-fatal):', (e as any)?.message || e);
    }

    // Check if player is already in the lobby
    const existingPlayer = lobby.players.find(p => String(p.playerId).toLowerCase() === playerIdLower);
    if (existingPlayer) {
    // Get socket instance and broadcast current lobby state (and presence add)
    try {
      const socketIo = await getSocketInstance();
      if (socketIo) {
        // Helper: compute authoritative player map with readiness and versioning
        const computeLobbyPlayers = (lob: any) => {
          return lob.players.map((p: any) => {
            const pid = String(p.playerId || '');
            let isReady = false;
            try {
              if ((lob.amount || 0) > 0 && !p.isAi) {
                // Ranked: authoritative readiness comes from hasWagered
                isReady = Boolean(p.hasWagered);
              } else {
                // Free: prefer connection ready state when present
                const presence = (global as any).lobbyPresence?.get(lobbyId) as Set<string> | undefined;
                if (presence && presence.has(pid)) {
                  for (const [, conn] of (global as any).activeConnections?.entries?.() || []) {
                    if (conn.currentLobby === lobbyId && String(conn.walletAddress || '').toLowerCase() === pid.toLowerCase()) { isReady = !!conn.isReady; break }
                  }
                }
              }
            } catch {}
            return {
              playerId: pid,
              username: p.username || pid.slice(0, 8) + '...',
              chickenName: p.chickenId || 'Default',
              isReady,
              isAi: p.isAi || false
            }
          })
        };
        const nextVersion = (() => { try { const cur = ((global as any).lobbyVersions?.get(lobbyId) || 0) + 1; (global as any).lobbyVersions?.set(lobbyId, cur); return cur } catch { return 1 } })();
        try {
          if ((global as any).lobbyPresence) {
            const set = (global as any).lobbyPresence.get(lobbyId) || new Set();
            set.add(playerId);
            (global as any).lobbyPresence.set(lobbyId, set);
          }
        } catch {}
        const lobbyPlayers = computeLobbyPlayers(lobby);
        
        // Broadcast current state to the lobby room
        socketIo.to(lobbyId).emit('lobby_updated', {
          id: lobbyId,
          players: lobbyPlayers,
          capacity: lobby.capacity,
          amount: lobby.amount,
          currency: lobby.currency,
          matchType: lobby.matchType,
          version: nextVersion
        });
      }
    } catch (error) {
      console.log('Could not broadcast lobby state:', error);
    }
    
      return NextResponse.json({ error: 'Player already in lobby' }, { status: 400 });
    }
    
    const actualChickenId = chickenId || 'default-chicken';
    
    // Get the player's username
    const username = await getPlayerUsername(playerId);
    
    // De-duplicate any prior entry for this player in this lobby
    try {
      lobby.players = lobby.players.filter(p => String(p.playerId).toLowerCase() !== playerIdLower);
    } catch {}
    
    const player = { 
      playerId: playerId, 
      chickenId: actualChickenId, 
      username: username,
      // Do not auto-ready players on join (even in free lobbies). Readiness is driven by socket events.
      hasWagered: false,
      isReady: false,
    };
    // Insert player (AI removed entirely)
    lobby.players.push(player);

    // Race-safe capacity guard: if we eclipsed capacity (due to concurrency), roll back and reject
    if (lobby.players.length > lobby.capacity) {
      // Remove the player we just added
      try {
        lobby.players = lobby.players.filter(p => String(p.playerId).toLowerCase() !== playerIdLower);
      } catch {}
      return NextResponse.json({ error: 'Lobby is full' }, { status: 400 });
    }

    // Track presence immediately
    try {
      if ((global as any).lobbyPresence) {
        const set = (global as any).lobbyPresence.get(lobbyId) || new Set();
        set.add(playerId);
        (global as any).lobbyPresence.set(lobbyId, set);
      }
    } catch {}

    // AI backfill removed (tutorial mode deleted)

    // Solana-only build: escrow assignment is handled via Solana escrow service/config elsewhere

    console.log(`Player ${player.playerId} (${username}) joined lobby ${lobbyId}. Current players: ${lobby.players.length}${lobby.escrowWalletId ? ` [Escrow: ${lobby.escrowWalletId}]` : ''}`);

    // Audit log the join (non-blocking)
    try {
      await auditLogger.log({
        eventType: 'lobby_join',
        actorWallet: playerId,
        endpoint: '/api/lobbies',
        severity: 'info',
        metadata: {
          lobbyId,
          lobbyAmount: lobby.amount,
          playerCount: lobby.players.length,
          escrowWallet: lobby.escrowWalletId,
        },
      });
    } catch (error) {
      // Non-fatal, continue
      console.warn('Audit log failed (non-fatal):', error);
    }

  // Broadcast the player join event via Socket.IO
  try {
    const socketIo = await getSocketInstance();
    if (socketIo) {
      // Broadcast to all players in the lobby room that a new player joined
      socketIo.to(lobbyId).emit('player_joined_lobby', {
        playerId: playerId,
        username: username,
        chickenName: actualChickenId,
        isReady: false,
        isAi: false,
        timestamp: Date.now()
      });

      // Also broadcast the full lobby update (ensure current ready states are preserved; authoritative in ranked)
      const lobbyPlayers = (() => {
        try {
          return lobby.players.map((p: any) => {
            const pid = String(p.playerId || '');
            let isReady = false;
            try {
              const presence = (global as any).lobbyPresence?.get(lobbyId) as Set<string> | undefined
              if (presence && presence.has(pid)) {
                for (const [, conn] of (global as any).activeConnections?.entries?.() || []) {
                  if (conn.currentLobby === lobbyId && String(conn.walletAddress || '').toLowerCase() === pid.toLowerCase()) { isReady = !!conn.isReady; break }
                }
              }
            } catch {}
            return {
              playerId: pid,
              username: p.username || pid.slice(0, 8) + '...',
              chickenName: p.chickenId || 'Default',
              isReady,
              isAi: !!p.isAi
            }
          })
        } catch { return lobby.players.map((p: any) => ({ playerId: String(p.playerId||''), username: p.username || String(p.playerId||'').slice(0,8)+'...', chickenName: p.chickenId || 'Default', isReady: false, isAi: !!p.isAi })) as any[] }
      })();
      const nextVersion = (() => { try { const cur = ((global as any).lobbyVersions?.get(lobbyId) || 0) + 1; (global as any).lobbyVersions?.set(lobbyId, cur); return cur } catch { return 1 } })();
      
      socketIo.to(lobbyId).emit('lobby_updated', {
        id: lobbyId,
        players: lobbyPlayers,
        capacity: lobby.capacity,
        amount: lobby.amount,
        currency: lobby.currency,
        matchType: lobby.matchType,
        version: nextVersion
      });
      // Emit live counts snapshot immediately after join
      try {
        const ac = (global as any).activeConnections;
        let humans = 0, total = 0;
        for (const [, conn] of (ac && ac.entries && ac.entries()) || []) {
          if (conn && conn.currentLobby === lobbyId && conn.walletAddress) {
            total += 1; const addr = String(conn.walletAddress || ''); if (!addr.startsWith('ai-')) humans += 1;
          }
        }
        socketIo.emit('lobby_counts', { id: lobbyId, liveHumans: humans, liveTotal: total });
      } catch {}

      // Emit live counts for cards based on presence
      try {
        const ac = (global as any).activeConnections;
        let humans = 0, total = 0;
        if (ac && typeof ac.entries === 'function') {
          for (const [, conn] of ac.entries()) {
            if (conn && conn.currentLobby === lobbyId && conn.walletAddress) {
              total += 1;
              const addr = String(conn.walletAddress || '');
              if (!addr.startsWith('ai-')) humans += 1;
            }
          }
        }
        socketIo.emit('lobby_counts', { id: lobbyId, liveHumans: humans, liveTotal: total });
      } catch {}

      console.log(`🔄 Broadcasted player join to lobby room ${lobbyId}`);
    } else {
      console.log('⚠️ Socket.IO not available - player join not broadcasted');
    }
  } catch (error) {
    console.error('❌ Failed to broadcast player join:', error);
  }

  // Status transitions are server-authoritative; do not set 'starting' here

    return NextResponse.json(lobby);
  });
} 

// API handler for a player to leave a lobby
export async function DELETE(req: NextRequest) {
  return withRateLimit(req, RATE_LIMITS.LOBBY, async () => {
    const BodySchema = z.object({
      lobbyId: z.string().min(3),
      playerId: z.string().min(3),
    });

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body', details: parsed.error.flatten() }, { status: 400 });
    }
    const { lobbyId, playerId } = parsed.data;

    const lobby = lobbies.find(l => l.id === lobbyId);
    if (!lobby) {
      return NextResponse.json({ error: 'Lobby not found' }, { status: 404 });
    }

    // Find player case-insensitively (wallet checksum vs lowercase)
    const idx = lobby.players.findIndex(p => String(p.playerId || '').toLowerCase() === String(playerId || '').toLowerCase());
    if (idx === -1) {
      // Idempotent: treat as success even if player isn't present
      return NextResponse.json(lobby);
    }

    const leavingPlayer = lobby.players[idx];

    // Best-effort refund if leaving before countdown/queue begins (ranked only) via idempotent server routine
    const refund: { attempted: boolean; ok?: boolean; txHash?: string; message?: string; error?: string } = { attempted: false };
    try {
      const isPaidRanked = lobby.matchType !== 'tutorial' && lobby.amount > 0;
      // Recover roster record for more accurate flags if available
      let rosterRec: any = null;
      try {
        const map = ((global as any).lobbyRoster && (global as any).lobbyRoster.get?.(lobbyId)) || null;
        if (map && map.get) {
          const key = String(playerId || '').toLowerCase();
          rosterRec = map.get(key) || null;
        }
      } catch {}
      const hasWageredFlag = Boolean((leavingPlayer as any)?.hasWagered || (rosterRec && rosterRec.hasWagered));
      // Ready is informative but not required for refund if wager is present and countdown/queue hasn't begun
      const alreadyRefunded = Boolean((leavingPlayer as any)?.__refunded);
      const isCountdownActive = (() => { try { return Boolean((global as any).countdownActive && (global as any).countdownActive[lobbyId]); } catch { return false; } })();
      const hasQueueSession = (() => { try { return Boolean((global as any).activeQueueForLobby && (global as any).activeQueueForLobby.get(lobbyId)); } catch { return false; } })();
      const eligibleForRefund = isPaidRanked && hasWageredFlag && !alreadyRefunded && !isCountdownActive && !hasQueueSession;

      if (eligibleForRefund) {
        refund.attempted = true;
        try {
          const { processRefundServerOnly } = await import('@/app/api/wager/refund/route');
          const res: any = await processRefundServerOnly({ lobbyId, playerPublicKey: String((leavingPlayer?.playerId || playerId)), reason: 'left_before_countdown' });
          if (res && res.ok) {
            refund.ok = true;
            refund.txHash = String(res.txHash || '');
            refund.message = 'Refund sent';
          } else if (res && res.error) {
            refund.ok = false;
            refund.error = String(res.error || 'Refund failed');
          } else {
            refund.ok = true;
            refund.message = String(res?.message || 'Refund processed');
          }
        } catch (err) {
          refund.ok = false;
          refund.error = String((err as any)?.message || err || 'Refund failed');
          console.warn('Refund routine failed (non-fatal):', (err as any)?.message || err);
        }
      } else {
        refund.attempted = false;
        if (alreadyRefunded) refund.message = 'Already refunded';
        else if (!hasWageredFlag) refund.message = 'No recorded wager';
        else if (isCountdownActive || hasQueueSession) refund.message = 'Refund window closed';
      }
    } catch (e) {
      console.warn('Refund check failed (non-fatal):', (e as any)?.message || e);
    }

    lobby.players.splice(idx, 1);

    // Remove presence for this lobby on leave
    try {
      const playerLower = String(playerId || '').toLowerCase();
      const set = (global as any).lobbyPresence?.get(lobbyId);
      set?.delete(playerLower);
      // Also attempt raw key removal in case older entries used original case
      set?.delete(String(playerId || ''));
    } catch {}

    // Tutorial AI purge removed

    // Broadcast via Socket.IO if available
    try {
      const socketIo = await getSocketInstance();
      if (socketIo) {
        socketIo.to(lobbyId).emit('player_left_lobby', {
          playerId,
          timestamp: Date.now()
        });

        const lobbyPlayers = lobby.players.map(p => ({
          playerId: p.playerId,
          username: p.username || p.playerId.slice(0, 8) + '...',
          chickenName: p.chickenId || 'Default',
          isReady: p.isAi ? true : false,
          isAi: p.isAi || false
        }));

        const nextVersion = (() => { try { const cur = ((global as any).lobbyVersions?.get(lobbyId) || 0) + 1; (global as any).lobbyVersions?.set(lobbyId, cur); return cur } catch { return 1 } })();
        socketIo.to(lobbyId).emit('lobby_updated', {
          id: lobbyId,
          players: lobbyPlayers,
          capacity: lobby.capacity,
          amount: lobby.amount,
          currency: lobby.currency,
          matchType: lobby.matchType,
          version: nextVersion
        });

        // Emit live counts for cards based on presence
        try {
          const ac = (global as any).activeConnections;
          let humans = 0, total = 0;
          if (ac && typeof ac.entries === 'function') {
            for (const [, conn] of ac.entries()) {
              if (conn && conn.currentLobby === lobbyId && conn.walletAddress) {
                total += 1;
                const addr = String(conn.walletAddress || '');
                if (!addr.startsWith('ai-')) humans += 1;
              }
            }
          }
          socketIo.emit('lobby_counts', { id: lobbyId, liveHumans: humans, liveTotal: total });
        } catch {}
      }
    } catch (e) {
      console.log('Could not broadcast lobby leave:', e);
    }

    return NextResponse.json({ ...(lobby as any), refund });
  });
}

// API handler to set player ready status (HTTP fallback when sockets unavailable)
export async function PUT(req: NextRequest) {
  return withRateLimit(req, RATE_LIMITS.LOBBY, async () => {
    const BodySchema = z.object({
      lobbyId: z.string().min(3),
      playerId: z.string().min(3),
      isReady: z.boolean(),
    });

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body', details: parsed.error.flatten() }, { status: 400 });
    }
    const { lobbyId, playerId, isReady } = parsed.data;

    const lobby = lobbies.find(l => l.id === lobbyId);
    if (!lobby) {
      return NextResponse.json({ error: 'Lobby not found' }, { status: 404 });
    }

    const player = lobby.players.find(p => String(p.playerId||'').toLowerCase() === String(playerId||'').toLowerCase());
    if (!player) {
      return NextResponse.json({ error: 'Player not found in this lobby' }, { status: 404 });
    }

    player.isReady = isReady;

    // Broadcast via Socket.IO if available and hard-prune any players not present in live presence
    try {
      const socketIo = await getSocketInstance();
      if (socketIo) {
        try {
          const presence = (global as any).lobbyPresence?.get(lobbyId) as Set<string> | undefined;
          if (presence && Array.isArray(lobby.players)) {
            const before = lobby.players.length
            lobby.players = lobby.players.filter(p => presence.has(String(p.playerId||'').toLowerCase()))
            const after = lobby.players.length
            if (after !== before) console.log(`[PUT][prune] removed ${before-after} absent player(s) from ${lobbyId}`)
          }
        } catch {}
        socketIo.to(lobbyId).emit('player_ready_status', { playerId, isReady });

        const lobbyPlayers = lobby.players.map(p => ({
          playerId: p.playerId,
          username: p.username || p.playerId.slice(0, 8) + '...',
          chickenName: p.chickenId || 'Default',
          isReady: p.isAi ? true : Boolean(p.isReady),
          isAi: p.isAi || false
        }));
        const nextVersion = (() => { try { const cur = ((global as any).lobbyVersions?.get(lobbyId) || 0) + 1; (global as any).lobbyVersions?.set(lobbyId, cur); return cur } catch { return 1 } })();
        socketIo.to(lobbyId).emit('lobby_updated', {
          id: lobbyId,
          players: lobbyPlayers,
          capacity: lobby.capacity,
          amount: lobby.amount,
          currency: lobby.currency,
          matchType: lobby.matchType,
          version: nextVersion
        });
      }
    } catch {}

    // Ready-time policy is server-authoritative; avoid setting lobby.status here

    return NextResponse.json(lobby);
  });
}