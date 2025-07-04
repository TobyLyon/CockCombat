import { NextResponse, NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

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

// Let's define a standard structure for our lobbies
export interface Lobby {
  id: string;
  amount: number;
  currency: string;
  players: { playerId: string; chickenId: string; isAi?: boolean; username?: string }[];
  capacity: number;
  highRoller: boolean;
  status: 'open' | 'starting' | 'in-progress';
  matchType: 'ranked' | 'tutorial';
  isComingSoon?: boolean;
}

// For now, we'll use a simple in-memory store for our lobbies.
// In a production environment, this would be a database or a cache like Redis.
export const lobbies: Lobby[] = [
  { id: 'tutorial-match', amount: 0, currency: "FREE", players: [], capacity: 8, highRoller: false, status: 'open', matchType: 'tutorial' },
  { id: 'lobby-0.05', amount: 0.05, currency: "SOL", players: [], capacity: 8, highRoller: false, status: 'open', matchType: 'ranked' },
  { id: 'lobby-0.1', amount: 0.1, currency: "SOL", players: [], capacity: 8, highRoller: false, status: 'open', matchType: 'ranked' },
  { id: 'lobby-0.25', amount: 0.25, currency: "SOL", players: [], capacity: 8, highRoller: false, status: 'open', matchType: 'ranked' },
  { id: 'lobby-0.5', amount: 0.5, currency: "SOL", players: [], capacity: 8, highRoller: false, status: 'open', matchType: 'ranked' },
  { id: 'lobby-1.0', amount: 1.0, currency: "SOL", players: [], capacity: 8, highRoller: false, status: 'open', matchType: 'ranked', isComingSoon: true },
  { id: 'lobby-2.5', amount: 2.5, currency: "SOL", players: [], capacity: 4, highRoller: true, status: 'open', matchType: 'ranked', isComingSoon: true },
  { id: 'lobby-5.0', amount: 5.0, currency: "SOL", players: [], capacity: 4, highRoller: true, status: 'open', matchType: 'ranked', isComingSoon: true },
  { id: 'lobby-10.0', amount: 10.0, currency: "SOL", players: [], capacity: 2, highRoller: true, status: 'open', matchType: 'ranked', isComingSoon: true },
];

const lobbyTimers = new Map<string, NodeJS.Timeout>();

// Helper function to get profile username
async function getPlayerUsername(playerId: string): Promise<string> {
  try {
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

    return profile?.username || playerId.slice(0, 8) + '...';
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
    
    // If lobby is now full, start the match
    if (lobby.players.length === lobby.capacity) {
      lobby.status = 'starting';
      console.log(`Lobby ${lobbyId} is full and starting.`);
      if (lobbyTimers.has(lobbyId)) {
        clearTimeout(lobbyTimers.get(lobbyId)!);
        lobbyTimers.delete(lobbyId);
      }
    }
  }
}

// API handler to get the current state of all lobbies
export async function GET(req: NextRequest) {
  return NextResponse.json(lobbies);
}

// API handler for a player to join a lobby
export async function POST(req: NextRequest) {
  const { lobbyId, playerId, chickenId } = await req.json();

  const lobby = lobbies.find(l => l.id === lobbyId);

  if (!lobby) {
    return NextResponse.json({ error: 'Lobby not found' }, { status: 404 });
  }

  if (lobby.players.length >= lobby.capacity) {
    return NextResponse.json({ error: 'Lobby is full' }, { status: 400 });
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
  
  // Use the provided playerId or generate a placeholder
  const actualPlayerId = playerId || `player-${Math.random().toString(36).substring(2, 9)}`;
  const actualChickenId = chickenId || 'default-chicken';
  
  // Get the player's username
  const username = await getPlayerUsername(actualPlayerId);
  
  const player = { 
    playerId: actualPlayerId, 
    chickenId: actualChickenId, 
    username: username 
  };
  lobby.players.push(player);

  console.log(`Player ${player.playerId} (${username}) joined lobby ${lobbyId}. Current players: ${lobby.players.length}`);

  // Broadcast the player join event via Socket.IO
  try {
    const socketIo = await getSocketInstance();
    if (socketIo) {
      // Broadcast to all players in the lobby room that a new player joined
      socketIo.to(lobbyId).emit('player_joined_lobby', {
        playerId: actualPlayerId,
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

  if (lobby.matchType === 'tutorial' && lobby.players.length === 1) {
    console.log(`Starting AI backfill timer for lobby ${lobbyId}`);
    const timer = setTimeout(() => {
      console.log(`AI backfill timer triggered for lobby ${lobbyId}`);
      while(lobby.players.length < lobby.capacity) {
        addAiPlayer(lobbyId);
      }
      lobbyTimers.delete(lobbyId);
    }, 60000); // 60 seconds
    lobbyTimers.set(lobbyId, timer);
  }

  if (lobby.players.length === lobby.capacity) {
    lobby.status = 'starting';
    if (lobby.matchType === 'tutorial' && lobbyTimers.has(lobbyId)) {
      clearTimeout(lobbyTimers.get(lobbyId)!);
      lobbyTimers.delete(lobbyId);
    }
  }

  return NextResponse.json(lobby);
} 