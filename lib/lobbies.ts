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
export const lobbies: Lobby[] = [
  // Free lobbies (no AI, require 2 humans)
  { id: 'free-1', name: 'Free Match', amount: 0, currency: "FREE", players: [], capacity: 8, highRoller: false, status: 'open', matchType: 'ranked' },
  { id: 'free-2', name: 'Free Match', amount: 0, currency: "FREE", players: [], capacity: 8, highRoller: false, status: 'open', matchType: 'ranked' },
  { id: 'free-3', name: 'Free Match', amount: 0, currency: "FREE", players: [], capacity: 8, highRoller: false, status: 'open', matchType: 'ranked' },
  { id: 'free-4', name: 'Free Match', amount: 0, currency: "FREE", players: [], capacity: 8, highRoller: false, status: 'open', matchType: 'ranked' },
  // Wagered lobbies temporarily disabled (coming soon)
  { id: 'lobby-0.01', amount: 0.01, currency: CURRENCY, players: [], capacity: 8, highRoller: false, status: 'open', matchType: 'ranked', isComingSoon: false },
  { id: 'lobby-0.25', amount: 0.25, currency: CURRENCY, players: [], capacity: 8, highRoller: false, status: 'open', matchType: 'ranked', isComingSoon: true },
  { id: 'lobby-0p005', amount: 0.05, currency: CURRENCY, players: [], capacity: 8, highRoller: false, status: 'open', matchType: 'ranked', isComingSoon: false },
  { id: 'lobby-0p005-2', amount: 0.1, currency: CURRENCY, players: [], capacity: 8, highRoller: false, status: 'open', matchType: 'ranked', isComingSoon: true },
];

// Lobby timers (reserved; AI backfill removed)
export const lobbyTimers = new Map<string, NodeJS.Timeout>();

