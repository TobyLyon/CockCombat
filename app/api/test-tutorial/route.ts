import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { lobbies } from '../lobbies/route';

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

  try {
    // Find the tutorial lobby
    const tutorialLobby = lobbies.find(l => l.id === 'tutorial-match');
    
    if (!tutorialLobby) {
      return NextResponse.json({ error: 'Tutorial lobby not found' }, { status: 404 });
    }

    console.log('Tutorial lobby before join:', tutorialLobby);

    // Add the player to the tutorial lobby
    const player = { 
      playerId: session.user.id, 
      chickenId: 'test-chicken-123' 
    };
    
    tutorialLobby.players.push(player);
    
    console.log('Tutorial lobby after join:', tutorialLobby);
    console.log(`Player ${player.playerId} joined tutorial lobby. Current players: ${tutorialLobby.players.length}`);

    return NextResponse.json({
      success: true,
      lobby: tutorialLobby,
      message: 'Successfully joined tutorial lobby!'
    });

  } catch (error) {
    console.error("Error in test tutorial:", error);
    return NextResponse.json({ error: "Test failed" }, { status: 500 });
  }
} 