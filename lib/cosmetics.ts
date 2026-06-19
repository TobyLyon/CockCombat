// Cosmetics catalog — the single source of truth for chicken "drip".
//
// Add a new skin by appending an object to SKINS. `colors` maps to the 7 parts
// the 3D chicken renders (see PixelChicken defaultColors): body, comb, beak,
// legs, tail, eyes, pupils. Prices are in in-game COINS (off-chain, instant).
// This file is intentionally code-driven so the catalog is easy + reliable to
// edit; ownership lives in the `cosmetic_unlocks` table and the applied skin is
// stored on the chicken (chickens.colors + chickens.skin_id).

export type ChickenColors = {
  body: string;
  comb: string;
  beak: string;
  legs: string;
  tail: string;
  eyes: string;
  pupils: string;
};

export type Rarity = "common" | "rare" | "epic" | "legendary";

export interface Skin {
  id: string;
  name: string;
  rarity: Rarity;
  price: number; // in coins; 0 = free/owned by everyone
  colors: ChickenColors;
}

export const RARITY_META: Record<Rarity, { label: string; color: string }> = {
  common: { label: "Common", color: "#9ca3af" },
  rare: { label: "Rare", color: "#3b82f6" },
  epic: { label: "Epic", color: "#a855f7" },
  legendary: { label: "Legendary", color: "#f59e0b" },
};

export const DEFAULT_SKIN_ID = "classic";

export const SKINS: Skin[] = [
  {
    id: "classic",
    name: "Classic Cluck",
    rarity: "common",
    price: 0,
    colors: { body: "#f97316", comb: "#ef4444", beak: "#FFD600", legs: "#FFD600", tail: "#6366f1", eyes: "#ffffff", pupils: "#222222" },
  },
  {
    id: "midnight",
    name: "Midnight Pecker",
    rarity: "rare",
    price: 250,
    colors: { body: "#1f2937", comb: "#ef4444", beak: "#f59e0b", legs: "#f59e0b", tail: "#10b981", eyes: "#e5e7eb", pupils: "#000000" },
  },
  {
    id: "frostbite",
    name: "Frostbite",
    rarity: "rare",
    price: 250,
    colors: { body: "#e0f2fe", comb: "#38bdf8", beak: "#0ea5e9", legs: "#7dd3fc", tail: "#2563eb", eyes: "#ffffff", pupils: "#1e3a8a" },
  },
  {
    id: "bubblegum",
    name: "Bubblegum",
    rarity: "rare",
    price: 300,
    colors: { body: "#f472b6", comb: "#db2777", beak: "#fbbf24", legs: "#fbbf24", tail: "#a78bfa", eyes: "#ffffff", pupils: "#831843" },
  },
  {
    id: "toxic",
    name: "Toxic Yolk",
    rarity: "epic",
    price: 600,
    colors: { body: "#22c55e", comb: "#84cc16", beak: "#a3e635", legs: "#65a30d", tail: "#14532d", eyes: "#ecfccb", pupils: "#1a2e05" },
  },
  {
    id: "inferno",
    name: "Inferno",
    rarity: "epic",
    price: 600,
    colors: { body: "#ef4444", comb: "#fbbf24", beak: "#f97316", legs: "#dc2626", tail: "#7c2d12", eyes: "#fff7ed", pupils: "#450a0a" },
  },
  {
    id: "gold",
    name: "24 Carat",
    rarity: "epic",
    price: 800,
    colors: { body: "#f59e0b", comb: "#b45309", beak: "#fde68a", legs: "#fbbf24", tail: "#92400e", eyes: "#fffbeb", pupils: "#451a03" },
  },
  {
    id: "royal",
    name: "Royal Rooster",
    rarity: "legendary",
    price: 1500,
    colors: { body: "#7c3aed", comb: "#f59e0b", beak: "#fbbf24", legs: "#fde047", tail: "#4c1d95", eyes: "#ede9fe", pupils: "#2e1065" },
  },
  {
    id: "cyber",
    name: "Cyber Cluck",
    rarity: "legendary",
    price: 1500,
    colors: { body: "#0f172a", comb: "#22d3ee", beak: "#a855f7", legs: "#22d3ee", tail: "#ec4899", eyes: "#67e8f9", pupils: "#020617" },
  },
];

export function getSkin(id?: string | null): Skin {
  return SKINS.find((s) => s.id === id) || SKINS.find((s) => s.id === DEFAULT_SKIN_ID)!;
}

// Skins everyone owns for free (price 0). Used to seed/grant unlocks implicitly.
export const FREE_SKIN_IDS = SKINS.filter((s) => s.price === 0).map((s) => s.id);
