import { NextResponse, NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { Connection, Transaction, clusterApiUrl } from '@solana/web3.js';

// Let's define a standard structure for our lobbies
export interface Lobby {
  id: string;
  amount: number;
  currency: string;
  players: { playerId: string; chickenId: string; isAi?: boolean }[];
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
  { id: 'lobby-0.1', amount: 0.1, currency: "SOL", players: [], capacity: 8, highRoller: false, status: 'open', matchType: 'ranked' },
  { id: 'lobby-0.25', amount: 0.25, currency: "SOL", players: [], capacity: 8, highRoller: false, status: 'open', matchType: 'ranked' },
  { id: 'lobby-0.5', amount: 0.5, currency: "SOL", players: [], capacity: 8, highRoller: false, status: 'open', matchType: 'ranked' },
  { id: 'lobby-1.0', amount: 1.0, currency: "SOL", players: [], capacity: 8, highRoller: false, status: 'open', matchType: 'ranked', isComingSoon: true },
  { id: 'lobby-2.5', amount: 2.5, currency: "SOL", players: [], capacity: 4, highRoller: true, status: 'open', matchType: 'ranked', isComingSoon: true },
  { id: 'lobby-5.0', amount: 5.0, currency: "SOL", players: [], capacity: 4, highRoller: true, status: 'open', matchType: 'ranked', isComingSoon: true },
  { id: 'lobby-10.0', amount: 10.0, currency: "SOL", players: [], capacity: 2, highRoller: true, status: 'open', matchType: 'ranked', isComingSoon: true },
];

const lobbyTimers = new Map<string, NodeJS.Timeout>();

function addAiPlayer(lobbyId: string) {
  const lobby = lobbies.find(l => l.id === lobbyId);
  if (lobby && lobby.players.length < lobby.capacity) {
    const aiPlayer = {
      playerId: `ai-${Math.random().toString(36).substring(2, 9)}`,
      chickenId: 'default-ai-chicken', // Or generate a random one
      isAi: true,
    };
    lobby.players.push(aiPlayer);
    console.log(`AI player added to lobby ${lobbyId}. Total players: ${lobby.players.length}`);
    
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
export async function GET() {
  return NextResponse.json(lobbies);
}

// API handler for a player to join a lobby (handles both wagered and tutorial)
export async function POST(req: NextRequest) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
      },
    }
  );

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const body = await req.json();
  const { lobbyId, chickenId, signedTransaction } = body;

  const lobby = lobbies.find(l => l.id === lobbyId);

  if (!lobby) {
    return NextResponse.json({ error: 'Lobby not found' }, { status: 404 });
  }

  if (lobby.players.length >= lobby.capacity) {
    return NextResponse.json({ error: 'Lobby is full' }, { status: 400 });
  }

  try {
    // If all checks pass, add the player to the lobby.
    const player = { playerId: session.user.id, chickenId };
    lobby.players.push(player);

    console.log(`Player ${player.playerId} joined lobby ${lobbyId}. Current players: ${lobby.players.length}`);

    // Handle AI backfill for tutorial lobbies
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

    // Handle match start when lobby is full
    if (lobby.players.length === lobby.capacity) {
      lobby.status = 'starting';
      if (lobby.matchType === 'tutorial' && lobbyTimers.has(lobbyId)) {
        clearTimeout(lobbyTimers.get(lobbyId)!);
        lobbyTimers.delete(lobbyId);
      }
    }

    return NextResponse.json(lobby);

  } catch (error) {
    console.error("Error processing lobby join:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred."
    return NextResponse.json({ error: "Failed to join lobby.", details: errorMessage }, { status: 500 });
  }
} 