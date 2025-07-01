import { NextResponse, NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { Connection, PublicKey, SystemProgram, Transaction, clusterApiUrl, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { lobbies, Lobby } from '../../lobbies/route';

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
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
    const { lobbyId } = await req.json();

    if (!lobbyId) {
      return NextResponse.json({ error: 'Lobby ID is required' }, { status: 400 });
    }
    
    const lobby = lobbies.find((l: Lobby) => l.id === lobbyId);
    if (!lobby) {
      return NextResponse.json({ error: "Lobby not found" }, { status: 404 });
    }

    const prizePoolWallet = process.env.PRIZE_POOL_WALLET;
    if (!prizePoolWallet) {
      console.error("PRIZE_POOL_WALLET is not set in .env.local");
      return NextResponse.json({ error: "Server configuration error: Prize pool wallet is not set." }, { status: 500 });
    }

    const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
    const playerPubkey = new PublicKey(session.user.id);
    const prizePoolPubkey = new PublicKey(prizePoolWallet);

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: playerPubkey,
        toPubkey: prizePoolPubkey,
        lamports: lobby.amount * LAMPORTS_PER_SOL,
      })
    );

    transaction.feePayer = playerPubkey;

    const { blockhash } = await connection.getLatestBlockhash('finalized');
    transaction.recentBlockhash = blockhash;

    const serializedTransaction = transaction.serialize({
      requireAllSignatures: false,
    });

    return NextResponse.json({
      transaction: serializedTransaction.toString('base64'),
    });

  } catch (error) {
    console.error("Error preparing wager:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred."
    return NextResponse.json({ error: "Failed to prepare wager.", details: errorMessage }, { status: 500 });
  }
} 