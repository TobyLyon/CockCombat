/**
 * Lobby Types and Data
 * Centralized lobby management for the game
 */

// Lobby interface
export interface Lobby {
  id: string;
  name?: string;
  amount: number;
  currency: string;
  players: { playerId: string; chickenId: string; isAi?: boolean; username?: string; isReady?: boolean; hasWagered?: boolean }[];
  capacity: number;
  highRoller: boolean;
  status: 'open' | 'starting' | 'in-progress';
  matchType: 'ranked' | 'tutorial';
  isComingSoon?: boolean;
  escrowWalletId?: 'A' | 'B' | 'C'; // Which escrow wallet this match uses
}

// In-memory lobbies store
// TODO: Move this to Supabase database for persistence
const CURRENCY = 'SOL';

// Paid lobbies need a configured escrow wallet to hold entry deposits and pay
// out winners. Until one is set (server logs "No escrow wallets configured"),
// paid lobbies are gated to "coming soon" so players can't enter and risk SOL
// while payouts are disabled. This auto-enables once escrow env is present, so
// no code change is needed to turn paid matches back on — just set the wallet
// env vars (and rotate the previously-leaked keys first). Server-side only:
// these non-public envs are undefined on the client, which safely keeps paid
// lobbies gated there too (the authoritative list comes from /api/lobbies).
const ESCROW_CONFIGURED = !!(
  (process.env.ESCROW_WALLET_A_PUBLIC_KEY && process.env.ESCROW_WALLET_A_PRIVATE_KEY) ||
  (process.env.EVM_ESCROW_A_ADDRESS && process.env.EVM_ESCROW_A_PRIVATE_KEY)
);
const PAID_COMING_SOON = !ESCROW_CONFIGURED;

export const lobbies: Lobby[] = [
  // Free lobbies (no AI, require 2 humans)
  { id: 'free-1', name: 'Free Match', amount: 0, currency: "FREE", players: [], capacity: 8, highRoller: false, status: 'open', matchType: 'ranked' },
  { id: 'free-2', name: 'Free Match', amount: 0, currency: "FREE", players: [], capacity: 8, highRoller: false, status: 'open', matchType: 'ranked' },
  { id: 'free-3', name: 'Free Match', amount: 0, currency: "FREE", players: [], capacity: 8, highRoller: false, status: 'open', matchType: 'ranked' },
  { id: 'free-4', name: 'Free Match', amount: 0, currency: "FREE", players: [], capacity: 8, highRoller: false, status: 'open', matchType: 'ranked' },
  // Wagered lobbies — gated to "coming soon" until escrow wallets are configured
  { id: 'lobby-0.01', amount: 0.01, currency: CURRENCY, players: [], capacity: 8, highRoller: false, status: 'open', matchType: 'ranked', isComingSoon: PAID_COMING_SOON },
  { id: 'lobby-0.25', amount: 0.25, currency: CURRENCY, players: [], capacity: 8, highRoller: false, status: 'open', matchType: 'ranked', isComingSoon: PAID_COMING_SOON },
  { id: 'lobby-0p005', amount: 0.05, currency: CURRENCY, players: [], capacity: 8, highRoller: false, status: 'open', matchType: 'ranked', isComingSoon: PAID_COMING_SOON },
  { id: 'lobby-0p005-2', amount: 0.1, currency: CURRENCY, players: [], capacity: 8, highRoller: false, status: 'open', matchType: 'ranked', isComingSoon: PAID_COMING_SOON },
];

// Lobby timers (reserved; AI backfill removed)
export const lobbyTimers = new Map<string, NodeJS.Timeout>();

