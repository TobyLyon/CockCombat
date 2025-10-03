import { NextResponse, NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { lobbies } from '@/lib/lobbies';
import { getConnection } from '@/lib/solana-config';
import { SystemProgram, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';

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
    const { lobbyId, signature } = await req.json();

    if (!lobbyId || !signature) {
      return NextResponse.json({ error: 'Lobby ID and signature are required' }, { status: 400 });
    }

    const lobby = lobbies.find(l => l.id === lobbyId);
    if (!lobby) {
      return NextResponse.json({ error: 'Lobby not found' }, { status: 404 });
    }

    const player = lobby.players.find(p => p.playerId === session.user.id);
    if (!player) {
      return NextResponse.json({ error: 'Player not found in this lobby' }, { status: 404 });
    }

    // Verify the transaction moved the exact wager to the escrow wallet
    const connection = getConnection();
    const tx = await connection.getTransaction(signature, { maxSupportedTransactionVersion: 0 });
    if (!tx || !tx.transaction) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 400 });
    }

    const expectedLamports = Math.round(lobby.amount * LAMPORTS_PER_SOL);
    const playerKey = new PublicKey(session.user.id);

    // Find transfer instruction matching (player -> any escrow) for exact lamports
    const ixs = tx.transaction.message.compiledInstructions || [];
    let valid = false;
    for (const ix of ixs) {
      const prog = tx.transaction.message.staticAccountKeys[ix.programIdIndex]?.toBase58?.();
      if (prog !== SystemProgram.programId.toBase58()) continue;
      // decoded legacy: we can check postBalances/preBalances delta as a fallback
      // Ensure player's balance decreased by >= expected and some other account increased.
      // Simplified check using meta: find account index of player and any counterparty with +expected.
      if (!tx.meta) continue;
      const accKeys = tx.transaction.message.staticAccountKeys;
      const playerIdx = accKeys.findIndex(k => k.equals(playerKey));
      if (playerIdx < 0) continue;
      const pre = tx.meta.preBalances[playerIdx];
      const post = tx.meta.postBalances[playerIdx];
      if (pre - post < expectedLamports) continue;
      const increased = tx.meta.postBalances.some((b, i) => (b - tx.meta!.preBalances[i]) >= expectedLamports && i !== playerIdx);
      if (increased) { valid = true; break; }
    }

    if (!valid) {
      return NextResponse.json({ error: 'Wager transaction not verified' }, { status: 400 });
    }

    player.hasWagered = true;
    player.isReady = true;
    
    console.log(`Player ${player.playerId} is now ready in lobby ${lobbyId}`);

    return NextResponse.json({ message: "Player status updated to ready", lobby });

  } catch (error) {
    console.error("Error confirming wager:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred."
    return NextResponse.json({ error: "Failed to confirm wager.", details: errorMessage }, { status: 500 });
  }
} 