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
  aiBackfill?: boolean; // Whether to auto-populate with AI when humans are missing
}

// In-memory lobbies store
// TODO: Move this to Supabase database for persistence
const CURRENCY = 'SOL';
export const lobbies: Lobby[] = [
  // Tutorial (free)
  { id: 'tutorial', name: 'Tutorial', amount: 0, currency: "FREE", players: [], capacity: 8, highRoller: false, status: 'open', matchType: 'tutorial', aiBackfill: true },
  { id: 'tutorial-1', amount: 0, currency: "FREE", players: [], capacity: 8, highRoller: false, status: 'open', matchType: 'tutorial' },
  { id: 'tutorial-2', amount: 0, currency: "FREE", players: [], capacity: 8, highRoller: false, status: 'open', matchType: 'tutorial' },
  { id: 'tutorial-3', amount: 0, currency: "FREE", players: [], capacity: 8, highRoller: false, status: 'open', matchType: 'tutorial' },
  // Free lobbies (coming soon for wagers)
  { id: 'free-1', name: 'Free Match', amount: 0, currency: "FREE", players: [], capacity: 8, highRoller: false, status: 'open', matchType: 'ranked' },
  { id: 'free-2', name: 'Free Match', amount: 0, currency: "FREE", players: [], capacity: 8, highRoller: false, status: 'open', matchType: 'ranked' },
  // Wagered lobbies temporarily disabled (coming soon)
  { id: 'lobby-0p005', amount: 0.005, currency: CURRENCY, players: [], capacity: 8, highRoller: false, status: 'open', matchType: 'ranked', isComingSoon: true },
  { id: 'lobby-0p005-2', amount: 0.005, currency: CURRENCY, players: [], capacity: 8, highRoller: false, status: 'open', matchType: 'ranked', isComingSoon: true },
];

// Lobby timers for AI backfill
export const lobbyTimers = new Map<string, NodeJS.Timeout>();

