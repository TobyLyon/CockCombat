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

// Paid lobbies stay "coming soon" until BOTH conditions hold:
//   1. Escrow is actually configured (a treasury wallet keypair is set), AND
//   2. We explicitly flip OPEN_PAID_LOBBIES=true.
// Decoupling the public gate from escrow presence lets us wire up and TEST the
// full wager/escrow/payout plumbing (set the escrow env vars) WITHOUT exposing
// paid lobbies to players before the lobby configuration is finalized for smooth
// matches with more than 2 people. Server-side only: these non-public envs are
// undefined on the client, which safely keeps paid lobbies gated there too (the
// authoritative list is served from /api/lobbies).
const ESCROW_CONFIGURED = !!(
  (process.env.ESCROW_WALLET_A_PUBLIC_KEY && process.env.ESCROW_WALLET_A_PRIVATE_KEY) ||
  (process.env.EVM_ESCROW_A_ADDRESS && process.env.EVM_ESCROW_A_PRIVATE_KEY)
);
const PAID_LOBBIES_OPEN = String(process.env.OPEN_PAID_LOBBIES || '').toLowerCase() === 'true';
const PAID_COMING_SOON = !(ESCROW_CONFIGURED && PAID_LOBBIES_OPEN);

export const lobbies: Lobby[] = [
  // Free lobby (single — consolidates players so a match can actually fill; no AI, require 2 humans)
  { id: 'free-1', name: 'Free Match', amount: 0, currency: "FREE", players: [], capacity: 8, highRoller: false, status: 'open', matchType: 'ranked' },
  // Wagered lobbies — gated to "coming soon" until escrow wallets are configured
  { id: 'lobby-0.01', amount: 0.01, currency: CURRENCY, players: [], capacity: 8, highRoller: false, status: 'open', matchType: 'ranked', isComingSoon: PAID_COMING_SOON },
  { id: 'lobby-0.25', amount: 0.25, currency: CURRENCY, players: [], capacity: 8, highRoller: false, status: 'open', matchType: 'ranked', isComingSoon: PAID_COMING_SOON },
  { id: 'lobby-0p005', amount: 0.05, currency: CURRENCY, players: [], capacity: 8, highRoller: false, status: 'open', matchType: 'ranked', isComingSoon: PAID_COMING_SOON },
  { id: 'lobby-0p005-2', amount: 0.1, currency: CURRENCY, players: [], capacity: 8, highRoller: false, status: 'open', matchType: 'ranked', isComingSoon: PAID_COMING_SOON },
];

// Lobby timers (reserved; AI backfill removed)
export const lobbyTimers = new Map<string, NodeJS.Timeout>();

