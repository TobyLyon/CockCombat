import { NextResponse, NextRequest } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';

// Define the structure for a lobby player
export interface LobbyPlayer {
  playerId: string;
  chickenId: string;
  isAi?: boolean;
  isReady?: boolean;
}

// Define the structure for a lobby
export interface Lobby {
  id: string;
  amount: number;
  currency: string;
  players: LobbyPlayer[];
  capacity: number;
  high_roller: boolean;
  status: 'open' | 'starting' | 'in-progress';
  match_type: 'ranked' | 'tutorial';
  is_coming_soon?: boolean;
}

// Admin client for server-side operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SERVICE_ROLE_KEY!
);

// API handler to get the current state of all lobbies
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('lobbies')
    .select('*')
    .order('amount', { ascending: true });

  if (error) {
    console.error("Error fetching lobbies:", error);
    return NextResponse.json({ error: "Failed to fetch lobbies" }, { status: 500 });
  }
  return NextResponse.json(data);
}

// API handler for a player to join a lobby
export async function POST(req: NextRequest) {
  const cookieStore = cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const { lobbyId, chickenId } = await req.json();

  if (!lobbyId || !chickenId) {
    return NextResponse.json({ error: 'Lobby ID and Chicken ID are required' }, { status: 400 });
  }

  try {
    // Fetch the current lobby state from the database
    const { data: lobby, error: fetchError } = await supabaseAdmin
      .from('lobbies')
      .select('*')
      .eq('id', lobbyId)
      .single();

    if (fetchError || !lobby) {
      return NextResponse.json({ error: 'Lobby not found' }, { status: 404 });
    }

    if (lobby.players.length >= lobby.capacity) {
      return NextResponse.json({ error: 'Lobby is full' }, { status: 400 });
    }
    
    if (lobby.players.some((p: LobbyPlayer) => p.playerId === session.user.id)) {
      return NextResponse.json({ error: 'You are already in this lobby' }, { status: 400 });
    }

    // Add the new player to the players array
    const newPlayer: LobbyPlayer = {
      playerId: session.user.id,
      chickenId: chickenId,
      isReady: false,
      isAi: false
    };

    const updatedPlayers = [...lobby.players, newPlayer];

    // Update the lobby in the database
    const { data: updatedLobby, error: updateError } = await supabaseAdmin
      .from('lobbies')
      .update({ players: updatedPlayers })
      .eq('id', lobbyId)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating lobby:", updateError);
      return NextResponse.json({ error: 'Failed to join lobby' }, { status: 500 });
    }

    return NextResponse.json(updatedLobby);

  } catch (error) {
    console.error("Error processing lobby join:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred."
    return NextResponse.json({ error: "Failed to process join request.", details: errorMessage }, { status: 500 });
  }
} 