import { NextRequest, NextResponse } from 'next/server';
import { getWriteClient } from '@/lib/supabase';

// POST /api/profile/active-chicken  { wallet, chickenId }
// Sets which chicken from the wallet's barn is the active fighter.
export async function POST(req: NextRequest) {
  try {
    const { wallet, chickenId } = await req.json();
    const w = String(wallet || '').trim();
    if (!w || !chickenId) {
      return NextResponse.json({ error: 'wallet and chickenId required' }, { status: 400 });
    }
    const db = getWriteClient();
    if (!db) return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });

    // The chicken must belong to this wallet
    const { data: chk } = await db.from('chickens').select('id, owner_wallet').eq('id', chickenId).maybeSingle();
    if (!chk || String(chk.owner_wallet || '').toLowerCase() !== w.toLowerCase()) {
      return NextResponse.json({ error: 'Not your chicken' }, { status: 403 });
    }

    const { error } = await db.from('profiles').update({ active_chicken_id: chickenId }).eq('wallet_address', w);
    if (error) {
      console.error('set active chicken error:', error);
      return NextResponse.json({ error: 'Failed to set active chicken' }, { status: 500 });
    }
    return NextResponse.json({ ok: true, activeChickenId: chickenId });
  } catch (error) {
    console.error('POST /api/profile/active-chicken error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
