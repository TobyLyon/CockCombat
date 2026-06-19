import { NextRequest, NextResponse } from 'next/server';
import { getWriteClient } from '@/lib/supabase';
import { SKINS, FREE_SKIN_IDS } from '@/lib/cosmetics';

// GET /api/cosmetics?wallet=<addr>
// Returns the cosmetics catalog plus, for the given wallet, which skins are
// owned and the current coin balance. Catalog is code-driven (lib/cosmetics.ts).
export async function GET(req: NextRequest) {
  try {
    const wallet = String(req.nextUrl.searchParams.get('wallet') || '').trim();
    let coins = 0;
    let owned: string[] = [...FREE_SKIN_IDS];

    const db = getWriteClient();
    if (wallet && db) {
      const { data: prof } = await db.from('profiles').select('coins').eq('wallet_address', wallet).maybeSingle();
      coins = Number(prof?.coins ?? 0);
      const { data: unlocks } = await db.from('cosmetic_unlocks').select('cosmetic_id').eq('wallet_address', wallet);
      owned = Array.from(new Set([...FREE_SKIN_IDS, ...((unlocks || []) as any[]).map((u) => u.cosmetic_id)]));
    }

    return NextResponse.json({ catalog: SKINS, owned, coins });
  } catch (error) {
    console.error('GET /api/cosmetics error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
