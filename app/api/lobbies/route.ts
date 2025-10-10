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

    const { data: profile } = await supabase
      .from('profiles')
      .select('username')
      .eq('wallet_address', playerId)
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
  // Strict guard: AI only allowed in tutorial lobbies
  if (!lobby || lobby.matchType !== 'tutorial') return;
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
        
        socketIo.to(lobbyId).emit('lobby_updated', {
          id: lobbyId,
          players: lobbyPlayers,
          capacity: lobby.capacity,
          amount: lobby.amount,
          currency: lobby.currency,
          matchType: lobby.matchType
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
  if (lobby.matchType !== 'tutorial') return
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
    const { lobbyId, playerId, chickenId, sessionId } = parsed.data;

    const lobby = lobbies.find(l => l.id === lobbyId);

    if (!lobby) {
      return NextResponse.json({ error: 'Lobby not found' }, { status: 404 });
    }

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

    // Check if player is already in the lobby
    const existingPlayer = lobby.players.find(p => p.playerId === playerId);
    if (existingPlayer) {
    // Get socket instance and broadcast current lobby state (and presence add)
    try {
      const socketIo = await getSocketInstance();
      if (socketIo) {
        try {
          if ((global as any).lobbyPresence) {
            const set = (global as any).lobbyPresence.get(lobbyId) || new Set();
            set.add(playerId);
            (global as any).lobbyPresence.set(lobbyId, set);
          }
        } catch {}
        // Convert lobby players to socket format with usernames
        const lobbyPlayers = lobby.players.map(p => ({
          playerId: p.playerId,
          username: p.username || p.playerId.slice(0, 8) + '...',
          chickenName: p.chickenId || 'Default',
          isReady: false,
          isAi: p.isAi || false
        }));
        
        // Broadcast current state to the lobby room
        socketIo.to(lobbyId).emit('lobby_updated', {
          id: lobbyId,
          players: lobbyPlayers,
          capacity: lobby.capacity,
          amount: lobby.amount,
          currency: lobby.currency,
          matchType: lobby.matchType
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
      lobby.players = lobby.players.filter(p => p.playerId !== playerId);
    } catch {}
    
    const player = { 
      playerId: playerId, 
      chickenId: actualChickenId, 
      username: username,
      hasWagered: lobby.amount === 0 ? true : false,
      isReady: lobby.amount === 0 ? true : false,
    };
    // Ensure humans are prioritized: insert the human, then trim excess AI if over capacity (tutorial only)
    lobby.players.push(player);
    if (lobby.matchType === 'tutorial' && lobby.players.length > lobby.capacity) {
      while (lobby.players.length > lobby.capacity) {
        removeOneAiPlayer(lobby)
        if (!lobby.players.some(p => p.isAi)) break
      }
    }

    // Track presence immediately
    try {
      if ((global as any).lobbyPresence) {
        const set = (global as any).lobbyPresence.get(lobbyId) || new Set();
        set.add(playerId);
        (global as any).lobbyPresence.set(lobbyId, set);
      }
    } catch {}

    // Assign escrow wallet when first player joins (for non-tutorial matches)
    if (!lobby.escrowWalletId && lobby.matchType !== 'tutorial' && lobby.amount > 0) {
      const { evmEscrowService } = await import('@/lib/evm-escrow-service');
      try {
        const wallet = evmEscrowService.getNextWallet();
        lobby.escrowWalletId = wallet.id;
        console.log(`🔐 Assigned EVM Escrow Wallet ${wallet.id} to lobby ${lobbyId}`);
      } catch (error) {
        console.error('Failed to assign EVM escrow wallet:', error);
      }
    }

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

      // Also broadcast the full lobby update (ensure current ready states are preserved for humans and AIs always ready in tutorial)
      const lobbyPlayers = lobby.players.map(p => {
        // Preserve socket-known readiness if available; fall back to stored flag; AI auto-ready in tutorial
        let isReady = Boolean(p.isReady)
        try {
          const presence = (global as any).lobbyPresence?.get(lobbyId) as Set<string> | undefined
          if (presence && presence.has(p.playerId)) {
            // Probe activeConnections to read current isReady
            for (const [, conn] of (global as any).activeConnections?.entries?.() || []) {
              if (conn.currentLobby === lobbyId && conn.walletAddress === p.playerId) { isReady = !!conn.isReady; break }
            }
          }
        } catch {}
        if (lobby.matchType === 'tutorial' && p.isAi) isReady = true
        return {
          playerId: p.playerId,
          username: p.username || p.playerId.slice(0, 8) + '...',
          chickenName: p.chickenId || 'Default',
          isReady,
          isAi: p.isAi || false
        }
      });
      
      socketIo.to(lobbyId).emit('lobby_updated', {
        id: lobbyId,
        players: lobbyPlayers,
        capacity: lobby.capacity,
        amount: lobby.amount,
        currency: lobby.currency,
        matchType: lobby.matchType
      });

      // Emit live counts for cards based on presence
      try {
        const presence = ((global as any).lobbyPresence && (global as any).lobbyPresence.get(lobbyId)) || new Set();
        const humans = Array.from(presence.values()).filter((w: any) => !(String(w).startsWith('ai-')));
        socketIo.emit('lobby_counts', { id: lobbyId, liveHumans: humans.length, liveTotal: presence.size });
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

    const idx = lobby.players.findIndex(p => p.playerId === playerId);
    if (idx === -1) {
      // Idempotent: treat as success even if player isn't present
      return NextResponse.json(lobby);
    }

    const leavingPlayer = lobby.players[idx];

    // Best-effort refund if leaving before countdown/queue begins (ranked only)
    try {
      const isPaidRanked = lobby.matchType !== 'tutorial' && lobby.amount > 0;
      const hasWagered = Boolean((leavingPlayer as any)?.hasWagered);
      const isCountdownActive = (() => { try { return Boolean((global as any).countdownActive && (global as any).countdownActive[lobbyId]); } catch { return false; } })();
      const hasQueueSession = (() => { try { return Boolean((global as any).activeQueueForLobby && (global as any).activeQueueForLobby.get(lobbyId)); } catch { return false; } })();
      const eligibleForRefund = isPaidRanked && hasWagered && !isCountdownActive && !hasQueueSession;

      if (eligibleForRefund && lobby.escrowWalletId) {
        const [{ evmEscrowService }, { ethers }] = await Promise.all([
          import('@/lib/evm-escrow-service'),
          import('ethers'),
        ]);

        const fromWallet = evmEscrowService.getWallet(lobby.escrowWalletId as any);
        if (fromWallet) {
          const wei = ethers.parseUnits(String(lobby.amount), 18);
          try {
            const txHash = await evmEscrowService.transferNative(String(leavingPlayer.playerId), wei, fromWallet);
            try {
              await auditLogger.log({
                eventType: 'wager_refund',
                actorWallet: String(leavingPlayer.playerId),
                endpoint: '/api/lobbies (leave)',
                severity: 'info',
                metadata: { lobbyId, amount: lobby.amount, escrowId: lobby.escrowWalletId, txHash, reason: 'left_before_countdown' },
              });
            } catch {}
            // Reflect refund in memory for this player
            try { (leavingPlayer as any).hasWagered = false; (leavingPlayer as any).isReady = false; } catch {}
            console.log(`↩️ Refunded ${lobby.amount} to ${leavingPlayer.playerId} from escrow ${lobby.escrowWalletId} (tx ${txHash})`);
          } catch (e) {
            console.warn('Refund transfer failed (non-fatal):', (e as any)?.message || e);
          }
        }
      }
    } catch (e) {
      console.warn('Refund check failed (non-fatal):', (e as any)?.message || e);
    }

    lobby.players.splice(idx, 1);

    // If tutorial lobby has no humans left, purge all AI and reset state
    if (lobby.matchType === 'tutorial') {
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

        socketIo.to(lobbyId).emit('lobby_updated', {
          id: lobbyId,
          players: lobbyPlayers,
          capacity: lobby.capacity,
          amount: lobby.amount,
          currency: lobby.currency,
          matchType: lobby.matchType
        });

        // Emit live counts for cards based on presence
        try {
          const presence = ((global as any).lobbyPresence && (global as any).lobbyPresence.get(lobbyId)) || new Set();
          const humans = Array.from(presence.values()).filter((w: any) => !(String(w).startsWith('ai-')));
          socketIo.emit('lobby_counts', { id: lobbyId, liveHumans: humans.length, liveTotal: presence.size });
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

    player.isReady = isReady;

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
        socketIo.to(lobbyId).emit('lobby_updated', {
          id: lobbyId,
          players: lobbyPlayers,
          capacity: lobby.capacity,
          amount: lobby.amount,
          currency: lobby.currency,
          matchType: lobby.matchType
        });
      }
    } catch {}

    // Ready-time AI policy
    if (lobby.matchType === 'tutorial') {
      // Temporarily disable AI backfill for tutorial; don't change status here
    } else {
      // Ranked: start only when everyone ready and min humans met
      const isLowPaidTestLobby = lobby.id === 'lobby-0.005';
      const minPlayers = isLowPaidTestLobby ? 2 : 4;
      const allReady = lobby.players.length >= minPlayers && lobby.players.every(p => (p.isAi ? true : Boolean(p.isReady)));
      if (allReady) {
        lobby.status = 'starting';
      }
    }

    return NextResponse.json(lobby);
  });
}