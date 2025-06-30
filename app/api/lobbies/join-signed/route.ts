import { NextRequest, NextResponse } from 'next/server';
import { Connection, Transaction, clusterApiUrl } from '@solana/web3.js';
import { lobbies } from '../route'; // Assuming 'lobbies' is exported from there
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

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
    const { lobbyId, chickenId, signedTransaction } = await req.json();

    if (!lobbyId || !chickenId || !signedTransaction) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const lobby = lobbies.find(l => l.id === lobbyId);
    if (!lobby) {
      return NextResponse.json({ error: 'Lobby not found' }, { status: 404 });
    }
    if (lobby.players.length >= lobby.capacity) {
      return NextResponse.json({ error: 'Lobby is full' }, { status: 400 });
    }

    const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
    
    // Deserialize the transaction
    const transaction = Transaction.from(Buffer.from(signedTransaction, 'base64'));

    // Here, you'd typically do more robust verification of the transaction
    // - Check if the signature is valid
    // - Check if the transaction has a recent blockhash
    // - Check that the transaction transfers the correct amount to the correct prize pool address
    // This is a simplified check for demonstration.
    
    // Send the pre-signed transaction to the network
    const signature = await connection.sendRawTransaction(transaction.serialize());

    // Confirm the transaction
    await connection.confirmTransaction(signature, 'confirmed');
    
    console.log(`Wager transaction confirmed: ${signature}`);

    // Now, add the player to the lobby since the wager is confirmed
    const player = { playerId: session.user.id, chickenId };
    lobby.players.push(player);

    console.log(`Player ${player.playerId} joined lobby ${lobbyId}. Current players: ${lobby.players.length}`);

    if (lobby.players.length === lobby.capacity) {
      lobby.status = 'starting';
    }

    return NextResponse.json(lobby);

  } catch (error) {
    console.error("Error processing signed wager:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred."
    return NextResponse.json({ error: "Failed to process signed wager.", details: errorMessage }, { status: 500 });
  }
} 