import { NextResponse, NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { lobbies, lobbyTimers, type Lobby } from '@/lib/lobbies';
import { authService } from '@/lib/auth-service';
import { auditLogger } from '@/lib/audit-logger';
import { withRateLimit, RATE_LIMITS } from '@/lib/rate-limiter';
import { z } from 'zod';

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

function addAiPlayer(lobbyId: string) {
  const lobby = lobbies.find(l => l.id === lobbyId);
  // Strict guard: AI only allowed in Tutorial practice lobby (aiBackfill flag)
  if (!lobby || lobby.matchType !== 'tutorial' || !lobby.aiBackfill) return;
  if (lobby.players.length < lobby.capacity) {
    const aiNames = ['ChickenBot', 'RoboRooster', 'CyberCluck', 'TechnoTender', 'ByteBird', 'PixelPecker', 'DataDrummer', 'CodeCock'];
    const randomName = aiNames[Math.floor(Math.random() * aiNames.length)];
    
    const aiPlayer = {
      playerId: `ai-${Math.random().toString(36).substring(2, 9)}`,
      chickenId: 'default-ai-chicken',
      isAi: true,
      username: randomName,
    };
    lobby.players.push(aiPlayer);
    console.log(`AI player added to lobby ${lobbyId}. Total players: ${lobby.players.length}`);
    
    // Broadcast AI player join via Socket.IO
    getSocketInstance().then(socketIo => {
      if (socketIo) {
        // Broadcast AI player joined
        socketIo.to(lobbyId).emit('player_joined_lobby', {
          playerId: aiPlayer.playerId,
          username: aiPlayer.username,
          chickenName: aiPlayer.chickenId,
          isReady: true, // AI players are always ready
          isAi: true,
          timestamp: Date.now()
        });

        // Broadcast full lobby update
        const lobbyPlayers = lobby.players.map(p => ({
          playerId: p.playerId,
          username: p.username || p.playerId.slice(0, 8) + '...',
          chickenName: p.chickenId || 'Default',
          isReady: p.isAi ? true : false, // AI players are always ready
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

        console.log(`🤖 Broadcasted AI player join to lobby room ${lobbyId}`);
      }
    }).catch(error => {
      console.error('❌ Failed to broadcast AI player join:', error);
    });
    
    // Do not mark tutorial lobbies as starting automatically; readiness logic handles it
    if (lobby.matchType !== 'tutorial' && lobby.players.length === lobby.capacity) {
      lobby.status = 'starting';
      console.log(`Lobby ${lobbyId} is full and starting.`);
      if (lobbyTimers.has(lobbyId)) {
        clearTimeout(lobbyTimers.get(lobbyId)!);
        lobbyTimers.delete(lobbyId);
      }
    }
  }
}

function removeOneAiPlayer(lobby: any) {
  const idx = lobby.players.findIndex((p: any) => p.isAi)
  if (idx >= 0) lobby.players.splice(idx, 1)
}

function ensureTutorialAIFilledToCapacity(lobby: any) {
  if (lobby.matchType !== 'tutorial' || !lobby.aiBackfill) return
  while (lobby.players.length < lobby.capacity) {
    addAiPlayer(lobby.id)
  }
}

// API handler to get the current state of all lobbies
export async function GET(req: NextRequest) {
  return withRateLimit(req, RATE_LIMITS.READ, async () => {
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
      sessionId: z.string().uuid().optional(), // Optional auth for now, will be required for non-tutorial
    });
    
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body', details: parsed.error.flatten() }, { status: 400 });
    }
    // Normalize wallet/playerId to lowercase to avoid checksum case mismatch across client/server
    const { lobbyId, chickenId, sessionId } = parsed.data;
    const playerId = String(parsed.data.playerId).toLowerCase();

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
      const isPaid = (lobby.amount || 0) > 0 && lobby.matchType !== 'tutorial';
      if (isPaid) {
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

    // Enforce: guests (playerId starting with 'guest_') can only join tutorial/free lobbies
    try {
      const isGuest = String(playerId || '').startsWith('guest_');
      const isTutorial = lobby.matchType === 'tutorial' || Number(lobby.amount || 0) === 0;
      if (isGuest && !isTutorial) {
        return NextResponse.json({ error: 'Guests can only join tutorial lobbies' }, { status: 403 });
      }
    } catch {}

    if (lobby.players.length >= lobby.capacity) {
      if (lobby.matchType === 'tutorial') {
        // Free a slot by removing one AI to prioritize real player (repeat until space)
        while (lobby.players.length >= lobby.capacity) {
          removeOneAiPlayer(lobby)
          if (!lobby.players.some(p => p.isAi)) break
        }
      } else {
        return NextResponse.json({ error: 'Lobby is full' }, { status: 400 });
      }
    }

    // Allow ranked lobby joins without full auth; enforce wager/auth at ready-up/confirmation time
    // (Previously required session validation here.)

    // Enforce single-lobby membership: remove this player from any other lobby before proceeding
    try {
      const socketIo = await getSocketInstance();
      const playerLower = String(playerId).toLowerCase();
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
    const existingPlayer = lobby.players.find(p => String(p.playerId).toLowerCase() === playerId);
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
              if (lob.matchType !== 'tutorial' && (lob.amount || 0) > 0 && !p.isAi) {
                // Ranked: authoritative readiness comes from hasWagered
                isReady = Boolean(p.hasWagered);
              } else {
                // Tutorial/free: prefer connection ready state when present
                const presence = (global as any).lobbyPresence?.get(lobbyId) as Set<string> | undefined;
                if (presence && presence.has(pid)) {
                  for (const [, conn] of (global as any).activeConnections?.entries?.() || []) {
                    if (conn.currentLobby === lobbyId && String(conn.walletAddress || '').toLowerCase() === pid.toLowerCase()) { isReady = !!conn.isReady; break }
                  }
                }
              }
            } catch {}
            if (lob.matchType === 'tutorial' && p.isAi) isReady = true;
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
      lobby.players = lobby.players.filter(p => String(p.playerId).toLowerCase() !== playerId);
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
        lobby.players = lobby.players.filter(p => String(p.playerId).toLowerCase() !== playerId);
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

    // For Tutorial practice lobby: backfill AIs to capacity on join
    try {
      if (lobby.matchType === 'tutorial' && (lobby as any).aiBackfill) {
        ensureTutorialAIFilledToCapacity(lobby)
      }
    } catch {}

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

  // Tutorial lobbies: backfill when first human is ready (waiting-queue will show AI). Do not purge humans.

  if (lobby.players.length === lobby.capacity && lobby.matchType !== 'tutorial') {
    lobby.status = 'starting';
  }

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
        try {
          const { processRefundServerOnly } = await import('@/app/api/wager/refund/route');
          await processRefundServerOnly({ lobbyId, playerPublicKey: String((leavingPlayer?.playerId || playerId)), reason: 'left_before_countdown' });
        } catch (err) {
          console.warn('Refund routine failed (non-fatal):', (err as any)?.message || err);
        }
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

    // If tutorial practice lobby has no humans left, purge all AI and reset state
    if (lobby.matchType === 'tutorial' && (lobby as any).aiBackfill) {
      const hasHuman = lobby.players.some(p => !p.isAi);
      if (!hasHuman) {
        lobby.players = [];
        lobby.status = 'open';
        if (lobbyTimers.has(lobbyId)) {
          clearTimeout(lobbyTimers.get(lobbyId)!);
          lobbyTimers.delete(lobbyId);
        }
      }
    }

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

    return NextResponse.json(lobby);
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

    const player = lobby.players.find(p => p.playerId === playerId);
    if (!player) {
      return NextResponse.json({ error: 'Player not found in this lobby' }, { status: 404 });
    }

    // Do not override ranked readiness with false when wagered; UI still needs to reflect intent immediately
    if (lobby.matchType !== 'tutorial' && lobby.amount > 0 && (player as any).hasWagered) {
      player.isReady = true;
    } else {
      player.isReady = isReady;
    }

    // Broadcast via Socket.IO if available
    try {
      const socketIo = await getSocketInstance();
      if (socketIo) {
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

    // Ready-time policy
    if (lobby.matchType === 'tutorial') {
      // If at least one human is ready, backfill AI to capacity so start logic can proceed
      try {
        const hasHumanReady = lobby.players.some(p => !p.isAi && p.isReady)
        if (hasHumanReady && (lobby as any).aiBackfill) {
          ensureTutorialAIFilledToCapacity(lobby)
        }
      } catch {}
    } else {
      // Start only when everyone ready and min players met by mode
      const isRanked = lobby.amount > 0;
      const minPlayers = isRanked ? 4 : 2;
      const allReady = lobby.players.length >= minPlayers && lobby.players.every(p => (p.isAi ? true : Boolean(p.isReady)));
      if (allReady) {
        lobby.status = 'starting';
      }
    }

    return NextResponse.json(lobby);
  });
}