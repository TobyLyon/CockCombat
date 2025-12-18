import { NextResponse } from 'next/server';
import { lobbies, type Lobby } from '@/lib/lobbies';
import { z } from 'zod';
import { isBsc } from '@/lib/chain';
import { evmEscrowService } from '@/lib/evm-escrow-service';
import { getEvmProvider } from '@/lib/evm-config';
import { ethers } from 'ethers';
import { Connection, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL, clusterApiUrl } from '@solana/web3.js';
import escrowService from '@/lib/escrow-service';
import { createClient } from '@supabase/supabase-js';

function paidMatchesEnabled(): boolean {
  try {
    const enabled = String(process.env.ENABLE_PAID_MATCHES || '').toLowerCase() === 'true'
    if (!enabled) return false
    const hasSupabase = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
    const hasSettlement = Boolean(process.env.PAYOUT_SERVER_SECRET)
    const hasRefund = Boolean(process.env.REFUND_SERVER_TOKEN)
    const hasHouse = Boolean(process.env.NEXT_PUBLIC_ADMIN_WALLET)
    return hasSupabase && hasSettlement && hasRefund && hasHouse
  } catch {
    return false
  }
}

function paidMatchesDiagnostics(): Record<string, boolean> {
  try {
    const enableFlag = String(process.env.ENABLE_PAID_MATCHES || '').toLowerCase() === 'true'
    const hasSupabaseUrl = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL)
    const hasServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
    const hasSettlement = Boolean(process.env.PAYOUT_SERVER_SECRET)
    const hasRefund = Boolean(process.env.REFUND_SERVER_TOKEN)
    const hasHouse = Boolean(process.env.NEXT_PUBLIC_ADMIN_WALLET)
    return { enableFlag, hasSupabaseUrl, hasServiceRole, hasSettlement, hasRefund, hasHouse }
  } catch {
    return { enableFlag: false, hasSupabaseUrl: false, hasServiceRole: false, hasSettlement: false, hasRefund: false, hasHouse: false }
  }
}

// This function creates and returns a transaction for a wager
export async function POST(request: Request) {
  try {

    const BodySchema = z.object({
      lobbyId: z.string().min(3),
      playerPublicKey: z.string().min(32),
    });
    const parsed = BodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body', details: parsed.error.flatten() }, { status: 400 });
    }
    const { lobbyId, playerPublicKey } = parsed.data;

    if (!lobbyId || !playerPublicKey) {
      return NextResponse.json({ error: "Lobby ID and Player Public Key are required" }, { status: 400 });
    }

    // Validate Solana key format when not on BSC
    if (!isBsc()) {
      try { new PublicKey(playerPublicKey) } catch { return NextResponse.json({ error: 'Invalid Solana public key' }, { status: 400 }) }
    }

    // Find the specific lobby to determine the wager amount
    const lobby = lobbies.find((l: Lobby) => l.id === lobbyId);

    if (!lobby) {
      return NextResponse.json({ error: "Lobby not found" }, { status: 404 });
    }

    // Free matches have no wager
    if (lobby.amount === 0) {
      return NextResponse.json({ 
        message: "No wager required for free matches",
        isFree: true,
      });
    }

    if (!paidMatchesEnabled()) {
      return NextResponse.json({ error: 'Wagered matches are disabled', checks: paidMatchesDiagnostics() }, { status: 403 })
    }

    if (isBsc()) {

      // EVM path: return an unsigned tx (player -> escrow)
      // Assign a single escrow wallet per lobby round and reuse it for all participants
      let w = lobby.escrowWalletId ? evmEscrowService.getWallet(lobby.escrowWalletId as any) : undefined;
      if (!w) {
        w = evmEscrowService.getNextWallet();
        lobby.escrowWalletId = w.id;
        console.log(`🔐 Assigned EVM Escrow Wallet ${w.id} to lobby ${lobbyId}`);
      }
      const provider = getEvmProvider();
      const valueWei = ethers.parseUnits(lobby.amount.toString(), 18);
      const valueHex = ethers.toBeHex(valueWei); // MetaMask expects hex-encoded wei
      // Provide suggested gas and gasPrice to avoid client-side estimation flakiness
      let gasHex: string | undefined = undefined;
      let gasPriceHex: string | undefined = undefined;
      try {
        const est = await provider.estimateGas({ from: playerPublicKey, to: w.address, value: valueWei });
        gasHex = ethers.toBeHex(est);
      } catch {}
      try {
        const fees = await provider.getFeeData();
        if (fees.gasPrice) gasPriceHex = ethers.toBeHex(fees.gasPrice);
      } catch {}
      let intentId: string | null = null;
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (supabaseUrl && supabaseServiceKey) {
          const supabase = createClient(supabaseUrl, supabaseServiceKey);
          const { data } = await supabase
            .from('wager_deposits')
            .insert({
              lobby_id: lobbyId,
              player_wallet: String(playerPublicKey || '').toLowerCase(),
              escrow_wallet_id: String(lobby.escrowWalletId || ''),
              expected_lamports: String(valueWei),
              status: 'intent',
            })
            .select('intent_id')
            .single();
          intentId = (data && (data as any).intent_id) ? String((data as any).intent_id) : null;
        } else if (process.env.NODE_ENV === 'production') {
          return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
        }
      } catch {}

      return NextResponse.json({
        chain: 'bsc',
        to: w.address,
        value: valueHex,
        gas: gasHex,
        gasPrice: gasPriceHex,
        lobbyId: lobbyId,
        intentId,
      });
    }

    // Solana path: return a serialized transfer transaction (player -> escrow)
    const network = (process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet') as 'devnet' | 'testnet' | 'mainnet-beta'
    const base = process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl(network)
    const rpcUrl = (() => {
      try {
        const rebate = process.env.NEXT_PUBLIC_HELIUS_REBATE_ADDRESS || ''
        const isHelius = /helius/i.test(String(base || ''))
        if (network === 'mainnet-beta' && rebate && isHelius) {
          const sep = base.includes('?') ? '&' : '?'
          return `${base}${sep}rebate-address=${encodeURIComponent(rebate)}`
        }
      } catch {}
      return base
    })()
    const connection = new Connection(rpcUrl)
    escrowService.setConnection(connection)

    // Assign or reuse escrow wallet id for this lobby
    if (!lobby.escrowWalletId) {
      // Optional override: force a single escrow wallet for Phase I rollouts
      const force = String(process.env.FORCE_ESCROW_WALLET_ID || '').trim().toUpperCase() as any
      if (force === 'A' || force === 'B' || force === 'C') {
        if (escrowService.getWallet(force)) {
          lobby.escrowWalletId = force
        }
      }
      if (!lobby.escrowWalletId) {
        // Use simple fallback A/B/C
        const candidates: Array<'A'|'B'|'C'> = ['A','B','C']
        for (const id of candidates) { if (escrowService.getWallet(id)) { lobby.escrowWalletId = id; break } }
      }
    }

    if (!lobby.escrowWalletId) {
      return NextResponse.json({ error: 'Escrow wallets not configured' }, { status: 500 })
    }

    const escrow = escrowService.getWallet(lobby.escrowWalletId)
    if (!escrow) return NextResponse.json({ error: 'Escrow wallet unavailable' }, { status: 500 })

    const payer = new PublicKey(playerPublicKey)
    const escrowPk = escrow.publicKey
    const lamports = Math.round(lobby.amount * LAMPORTS_PER_SOL)
    const ix = SystemProgram.transfer({ fromPubkey: payer, toPubkey: escrowPk, lamports })
    const tx = new Transaction().add(ix)
    const { blockhash } = await connection.getLatestBlockhash('finalized')
    tx.recentBlockhash = blockhash
    tx.feePayer = payer

    const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64')
    let intentId: string | null = null;
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (supabaseUrl && supabaseServiceKey) {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const { data } = await supabase
          .from('wager_deposits')
          .insert({
            lobby_id: lobbyId,
            player_wallet: String(playerPublicKey || ''),
            escrow_wallet_id: String(lobby.escrowWalletId),
            expected_lamports: lamports,
            status: 'intent',
          })
          .select('intent_id')
          .single();
        intentId = (data && (data as any).intent_id) ? String((data as any).intent_id) : null;
      } else if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
      }
    } catch {}

    return NextResponse.json({ chain: 'solana', escrow: escrowPk.toBase58(), lamports, transaction: serialized, lobbyId, intentId })

  } catch (error) {
    console.error("❌ Error creating wager transaction:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({
      error: "Failed to create wager transaction",
      details: errorMessage,
    }, { status: 500 });
  }
} 