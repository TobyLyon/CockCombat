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
  if (lobby && lobby.players.length < lobby.capacity) {
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
        // Free a slot by removing one AI to prioritize real player
        removeOneAiPlayer(lobby)
      } else {
        return NextResponse.json({ error: 'Lobby is full' }, { status: 400 });
      }
    }

    // Require authentication for non-tutorial lobbies
    if (lobby.matchType !== 'tutorial' && lobby.amount > 0) {
      if (!sessionId) {
        return NextResponse.json({ 
          error: 'Authentication required',
          message: 'Please sign in to join this lobby'
        }, { status: 401 });
      }

      const isValidSession = await authService.validateSession(sessionId, playerId);
      if (!isValidSession) {
        return NextResponse.json({ 
          error: 'Invalid or expired session',
          message: 'Please sign in again'
        }, { status: 401 });
      }
    }

    // Check if player is already in the lobby
    const existingPlayer = lobby.players.find(p => p.playerId === playerId);
    if (existingPlayer) {
    // Get socket instance and broadcast current lobby state
    try {
      const socketIo = await getSocketInstance();
      if (socketIo) {
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
    
    const player = { 
      playerId: playerId, 
      chickenId: actualChickenId, 
      username: username 
    };
    lobby.players.push(player);

    // Assign escrow wallet when first player joins (for non-tutorial matches)
    if (!lobby.escrowWalletId && lobby.matchType !== 'tutorial' && lobby.amount > 0) {
      const { escrowService } = await import('@/lib/escrow-service');
      try {
        const wallet = await escrowService.getNextWallet();
        lobby.escrowWalletId = wallet.id;
        console.log(`🔐 Assigned Escrow Wallet ${wallet.id} to lobby ${lobbyId}`);
      } catch (error) {
        console.error('Failed to assign escrow wallet:', error);
        // Continue without assigning - will fail at wager time
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

      // Also broadcast the full lobby update
      const lobbyPlayers = lobby.players.map(p => ({
        playerId: p.playerId,
        username: p.username || p.playerId.slice(0, 8) + '...',
        chickenName: p.chickenId || 'Default',
        isReady: false,
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

      console.log(`🔄 Broadcasted player join to lobby room ${lobbyId}`);
    } else {
      console.log('⚠️ Socket.IO not available - player join not broadcasted');
    }
  } catch (error) {
    console.error('❌ Failed to broadcast player join:', error);
  }

    // Tutorial lobbies: fill remaining slots with AI (real players take priority and can replace AI)
  if (lobby.matchType === 'tutorial') {
    if (!lobbyTimers.has(lobbyId)) {
      console.log(`⏳ Scheduling AI backfill to capacity for tutorial lobby ${lobbyId}`);
      const timer = setTimeout(() => {
        try {
          ensureTutorialAIFilledToCapacity(lobby)
        } finally {
          lobbyTimers.delete(lobbyId);
        }
      }, 500);
      lobbyTimers.set(lobbyId, timer);
    } else {
      console.log(`AI backfill already scheduled for ${lobbyId}`);
    }
  }

  if (lobby.players.length === lobby.capacity && lobby.matchType !== 'tutorial') {
    lobby.status = 'starting';
  }

    return NextResponse.json(lobby);
  });
} 