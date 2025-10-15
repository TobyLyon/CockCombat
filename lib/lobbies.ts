/**
 * Lobby Types and Data
 * Centralized lobby management for the game
 */

// Lobby interface
export interface Lobby {
  id: string;
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
import { isBsc } from './chain';
const CURRENCY = isBsc() ? 'BNB' : 'SOL';
export const lobbies: Lobby[] = [
  // Tutorial (free)
  { id: 'tutorial-1', amount: 0, currency: "FREE", players: [], capacity: 8, highRoller: false, status: 'open', matchType: 'tutorial' },
  { id: 'tutorial-2', amount: 0, currency: "FREE", players: [], capacity: 8, highRoller: false, status: 'open', matchType: 'tutorial' },
  // Primary test ranked lobbies
  { id: 'lobby-0p005', amount: 0.005, currency: CURRENCY, players: [], capacity: 8, highRoller: false, status: 'open', matchType: 'ranked' },
  { id: 'lobby-0p005-2', amount: 0.005, currency: CURRENCY, players: [], capacity: 8, highRoller: false, status: 'open', matchType: 'ranked' },
  { id: 'lobby-0.01', amount: 0.01, currency: CURRENCY, players: [], capacity: 8, highRoller: false, status: 'open', matchType: 'ranked' },
];

// Lobby timers for AI backfill
export const lobbyTimers = new Map<string, NodeJS.Timeout>();

