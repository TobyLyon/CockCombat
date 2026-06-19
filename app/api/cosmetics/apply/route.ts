import { NextRequest, NextResponse } from 'next/server';
import { getWriteClient } from '@/lib/supabase';
import { getSkin, SKINS } from '@/lib/cosmetics';

// POST /api/cosmetics/apply  { wallet, chickenId, skinId }
// Applies an owned skin's colors to a chicken the wallet owns.
export async function POST(req: NextRequest) {
  try {
    const { wallet, chickenId, skinId } = await req.json();
    const w = String(wallet || '').trim();
    const skin = SKINS.find((s) => s.id === skinId);
    if (!w || !chickenId || !skin) {
      return NextResponse.json({ error: 'Invalid wallet, chicken, or skin' }, { status: 400 });
    }
    const db = getWriteClient();
    if (!db) return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });

    // Must own the skin (free skins are always owned)
    if (skin.price > 0) {
      const { data: own } = await db
        .from('cosmetic_unlocks')
        .select('cosmetic_id')
        .eq('wallet_address', w)
        .eq('cosmetic_id', skin.id)
        .maybeSingle();
      if (!own) return NextResponse.json({ error: "You don't own this skin" }, { status: 403 });
    }

    // Chicken must belong to the wallet
    const { data: chk } = await db.from('chickens').select('id, owner_wallet').eq('id', chickenId).maybeSingle();
    if (!chk || String(chk.owner_wallet || '').toLowerCase() !== w.toLowerCase()) {
      return NextResponse.json({ error: 'Not your chicken' }, { status: 403 });
    }

    const { error } = await db.from('chickens').update({ colors: skin.colors, skin_id: skin.id }).eq('id', chickenId);
    if (error) {
      console.error('apply skin update error:', error);
      return NextResponse.json({ error: 'Failed to apply skin' }, { status: 500 });
    }
    return NextResponse.json({ ok: true, colors: skin.colors, skinId: skin.id });
  } catch (error) {
    console.error('POST /api/cosmetics/apply error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
