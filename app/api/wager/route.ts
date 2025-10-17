import { NextResponse } from 'next/server';
import { lobbies, type Lobby } from '@/lib/lobbies';
import { z } from 'zod';
import { isBsc } from '@/lib/chain';
import { evmEscrowService } from '@/lib/evm-escrow-service';
import { getEvmProvider } from '@/lib/evm-config';
import { ethers } from 'ethers';
import { Connection, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL, clusterApiUrl } from '@solana/web3.js';
import escrowService from '@/lib/escrow-service';

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
      return NextResponse.json({
        chain: 'bsc',
        to: w.address,
        value: valueHex,
        gas: gasHex,
        gasPrice: gasPriceHex,
        lobbyId: lobbyId,
      });
    }

    // Solana path: return a serialized transfer transaction (player -> escrow)
    const network = (process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet') as 'devnet' | 'testnet' | 'mainnet-beta'
    const base = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl(network)
    const rpcUrl = (() => {
      try {
        const rebate = process.env.NEXT_PUBLIC_HELIUS_REBATE_ADDRESS || ''
        if (network === 'mainnet-beta' && rebate) {
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
      // Use simple rotation A/B/C
      const candidates: Array<'A'|'B'|'C'> = ['A','B','C']
      for (const id of candidates) { if (escrowService.getWallet(id)) { lobby.escrowWalletId = id; break } }
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
    return NextResponse.json({ chain: 'solana', escrow: escrowPk.toBase58(), lamports, transaction: serialized, lobbyId })

  } catch (error) {
    console.error("❌ Error creating wager transaction:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ 
      error: "Failed to create wager transaction",
      details: errorMessage,
    }, { status: 500 });
  }
} 