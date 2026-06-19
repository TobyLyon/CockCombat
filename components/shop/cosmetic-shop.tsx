"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useWallet } from "@/hooks/use-wallet";
import { SKINS, getSkin, RARITY_META, DEFAULT_SKIN_ID, type Skin } from "@/lib/cosmetics";
import ChickenPreview from "@/components/shop/chicken-preview";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Chicken = { id: string; name: string; skin_id?: string; colors?: any };

export default function CosmeticShop() {
  const { publicKey } = useWallet();
  const wallet = useMemo(
    () => (typeof publicKey === "string" ? publicKey : (publicKey as any)?.toBase58?.() || (publicKey as any)?.toString?.() || ""),
    [publicKey]
  );

  const [loading, setLoading] = useState(true);
  const [coins, setCoins] = useState(0);
  const [owned, setOwned] = useState<string[]>([]);
  const [chickens, setChickens] = useState<Chicken[]>([]);
  const [activeChickenId, setActiveChickenId] = useState<string>("");
  const [selectedSkinId, setSelectedSkinId] = useState<string>(DEFAULT_SKIN_ID);
  const [busy, setBusy] = useState<string>("");

  const activeChicken = chickens.find((c) => c.id === activeChickenId);
  const selectedSkin = getSkin(selectedSkinId);

  const load = useCallback(async () => {
    if (!wallet) { setLoading(false); return; }
    setLoading(true);
    try {
      const [cosRes, chkRes, profRes] = await Promise.all([
        fetch(`/api/cosmetics?wallet=${encodeURIComponent(wallet)}`).then((r) => r.json()).catch(() => null),
        fetch(`/api/profile/${encodeURIComponent(wallet)}/chickens`).then((r) => r.json()).catch(() => []),
        fetch(`/api/profile/${encodeURIComponent(wallet)}`).then((r) => r.json()).catch(() => null),
      ]);
      if (cosRes) { setCoins(cosRes.coins || 0); setOwned(cosRes.owned || []); }

      let barn: Chicken[] = Array.isArray(chkRes) ? chkRes : [];
      // Ensure the player has at least one chicken to dress up
      if (barn.length === 0) {
        const created = await fetch(`/api/profile/${encodeURIComponent(wallet)}/chickens`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "My Chicken", skin_id: DEFAULT_SKIN_ID, colors: getSkin(DEFAULT_SKIN_ID).colors }),
        }).then((r) => r.json()).catch(() => null);
        if (created && created.id) barn = [created];
      }
      setChickens(barn);

      const active = (profRes && profRes.active_chicken_id) || barn[0]?.id || "";
      setActiveChickenId(active);
      const ac = barn.find((c) => c.id === active);
      setSelectedSkinId(ac?.skin_id || DEFAULT_SKIN_ID);
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => { load(); }, [load]);

  const buy = async (skin: Skin) => {
    if (!wallet) return;
    setBusy(skin.id);
    try {
      const res = await fetch("/api/cosmetics/purchase", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet, cosmeticId: skin.id }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data?.error || "Purchase failed"); return; }
      if (typeof data.coins === "number") setCoins(data.coins);
      setOwned((o) => Array.from(new Set([...o, skin.id])));
      toast.success(`Unlocked ${skin.name}!`);
    } finally { setBusy(""); }
  };

  const equip = async (skin: Skin) => {
    if (!wallet || !activeChickenId) return;
    setBusy(skin.id);
    try {
      const res = await fetch("/api/cosmetics/apply", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet, chickenId: activeChickenId, skinId: skin.id }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data?.error || "Couldn't equip"); return; }
      setChickens((cs) => cs.map((c) => (c.id === activeChickenId ? { ...c, skin_id: skin.id, colors: skin.colors } : c)));
      toast.success(`${skin.name} equipped — you'll fight with it.`);
    } finally { setBusy(""); }
  };

  const setActive = async (chickenId: string) => {
    if (!wallet) return;
    setActiveChickenId(chickenId);
    const ac = chickens.find((c) => c.id === chickenId);
    setSelectedSkinId(ac?.skin_id || DEFAULT_SKIN_ID);
    try {
      await fetch("/api/profile/active-chicken", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet, chickenId }),
      });
    } catch {}
  };

  if (!wallet) {
    return (
      <div className="max-w-md mx-auto mt-20 text-center bg-white/5 border border-white/10 rounded-xl p-8">
        <h2 className="text-2xl font-bold text-yellow-400 pixel-font mb-2">DRIP SHOP</h2>
        <p className="text-white/70">Connect your wallet to dress up your chicken.</p>
      </div>
    );
  }

  const equippedSkinId = activeChicken?.skin_id || DEFAULT_SKIN_ID;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 text-white">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-3xl font-bold text-yellow-400 pixel-font">DRIP SHOP</h1>
        <div className="flex items-center gap-2 bg-yellow-400/10 border border-yellow-500/50 rounded-full px-4 py-2">
          <span className="text-yellow-300 font-bold">🪙 {coins.toLocaleString()}</span>
          <span className="text-white/50 text-sm">coins</span>
        </div>
      </div>

      <div className="grid lg:grid-cols-[320px_1fr] gap-6">
        {/* Preview + barn */}
        <div className="space-y-4">
          <div className="bg-gradient-to-b from-purple-800/40 to-purple-950/40 border border-purple-600/40 rounded-xl p-5 flex flex-col items-center">
            <div className="text-xs text-purple-200/70 mb-2 uppercase tracking-wide">Preview · {selectedSkin.name}</div>
            <ChickenPreview colors={selectedSkin.colors} size={200} />
            <div className="mt-4 w-full">
              {equippedSkinId === selectedSkin.id ? (
                <div className="text-center text-green-400 text-sm font-bold py-2.5 border border-green-500/40 rounded-lg bg-green-500/10">✓ Equipped</div>
              ) : (
                <Button onClick={() => equip(selectedSkin)} disabled={busy === selectedSkin.id || (!owned.includes(selectedSkin.id))}
                  className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-bold">
                  {owned.includes(selectedSkin.id) ? "Equip this skin" : "Locked — buy below"}
                </Button>
              )}
            </div>
          </div>

          {/* Barn */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <div className="text-sm font-bold text-white/80 mb-3">Your Barn — active fighter</div>
            <div className="flex gap-2 flex-wrap">
              {chickens.map((c) => {
                const cols = getSkin(c.skin_id).colors;
                const isActive = c.id === activeChickenId;
                return (
                  <button key={c.id} onClick={() => setActive(c.id)}
                    className={`rounded-lg p-2 border-2 transition ${isActive ? "border-yellow-400 bg-yellow-400/10" : "border-white/10 hover:border-white/30 bg-black/20"}`}
                    title={c.name}>
                    <ChickenPreview colors={cols} size={56} />
                    <div className="text-[10px] text-center mt-1 text-white/60 max-w-[64px] truncate">{c.name}</div>
                  </button>
                );
              })}
            </div>
            {activeChicken && <div className="text-xs text-white/50 mt-3">Matches use <span className="text-yellow-300 font-semibold">{activeChicken.name}</span>'s skin.</div>}
          </div>
        </div>

        {/* Skin grid */}
        <div>
          {loading ? (
            <div className="text-center text-white/50 py-20">Loading the drip…</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {SKINS.map((skin) => {
                const isOwned = owned.includes(skin.id);
                const isEquipped = equippedSkinId === skin.id;
                const isSelected = selectedSkinId === skin.id;
                const rar = RARITY_META[skin.rarity];
                return (
                  <div key={skin.id}
                    onClick={() => setSelectedSkinId(skin.id)}
                    className={`cursor-pointer rounded-xl border-2 p-3 bg-black/30 transition ${isSelected ? "border-yellow-400" : "border-white/10 hover:border-white/30"}`}>
                    <div className="flex justify-center bg-gradient-to-b from-white/5 to-transparent rounded-lg py-2">
                      <ChickenPreview colors={skin.colors} size={90} />
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-sm font-bold truncate">{skin.name}</span>
                      <span className="text-[10px] font-bold uppercase" style={{ color: rar.color }}>{rar.label}</span>
                    </div>
                    <div className="mt-2">
                      {isEquipped ? (
                        <div className="text-center text-green-400 text-xs font-bold py-1.5 border border-green-500/40 rounded bg-green-500/10">✓ Equipped</div>
                      ) : isOwned ? (
                        <Button size="sm" onClick={(e) => { e.stopPropagation(); equip(skin); }} disabled={busy === skin.id}
                          className="w-full bg-purple-600 hover:bg-purple-500 text-white text-xs h-8">Equip</Button>
                      ) : (
                        <Button size="sm" onClick={(e) => { e.stopPropagation(); buy(skin); }} disabled={busy === skin.id || coins < skin.price}
                          className="w-full bg-yellow-500 hover:bg-yellow-400 text-black text-xs h-8 font-bold">
                          🪙 {skin.price.toLocaleString()}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
