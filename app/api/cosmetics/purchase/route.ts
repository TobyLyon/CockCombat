import { NextRequest, NextResponse } from 'next/server';
import { getWriteClient } from '@/lib/supabase';
import { SKINS } from '@/lib/cosmetics';

// POST /api/cosmetics/purchase  { wallet, cosmeticId }
// Spends coins for a cosmetic via the atomic purchase_cosmetic RPC.
export async function POST(req: NextRequest) {
  try {
    const { wallet, cosmeticId } = await req.json();
    const w = String(wallet || '').trim();
    const skin = SKINS.find((s) => s.id === cosmeticId);
    if (!w || !skin) {
      return NextResponse.json({ error: 'Invalid wallet or cosmetic' }, { status: 400 });
    }
    if (skin.price <= 0) {
      return NextResponse.json({ ok: true, alreadyFree: true }); // free skins need no purchase
    }
    const db = getWriteClient();
    if (!db) return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });

    const { data, error } = await db.rpc('purchase_cosmetic', {
      p_wallet: w,
      p_cosmetic_id: skin.id,
      p_price: skin.price,
    });
    if (error) {
      console.error('purchase_cosmetic rpc error:', error);
      return NextResponse.json({ error: 'Purchase failed' }, { status: 500 });
    }
    if (data === null || data === undefined) {
      return NextResponse.json({ error: 'Not enough coins (or no profile)' }, { status: 402 });
    }
    return NextResponse.json({ ok: true, coins: Number(data) });
  } catch (error) {
    console.error('POST /api/cosmetics/purchase error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
