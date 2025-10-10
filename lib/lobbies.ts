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
  // Single FREE tutorial lobby
  { id: 'tutorial-1', amount: 0, currency: "FREE", players: [], capacity: 8, highRoller: false, status: 'open', matchType: 'tutorial' },
  // Low-wager BNB lobbies for accessibility
  // Replace the old 0.005 lobby with a fresh clone of 0.01, then set price to 0.005
  { id: 'lobby-0p005', amount: 0.005, currency: CURRENCY, players: [], capacity: 8, highRoller: false, status: 'open', matchType: 'ranked' },
  { id: 'lobby-0.01', amount: 0.01, currency: CURRENCY, players: [], capacity: 8, highRoller: false, status: 'open', matchType: 'ranked' },
  { id: 'lobby-0.05', amount: 0.05, currency: CURRENCY, players: [], capacity: 8, highRoller: false, status: 'open', matchType: 'ranked' },
  { id: 'lobby-0.1', amount: 0.1, currency: CURRENCY, players: [], capacity: 8, highRoller: false, status: 'open', matchType: 'ranked' },
  { id: 'lobby-0.25', amount: 0.25, currency: CURRENCY, players: [], capacity: 8, highRoller: false, status: 'open', matchType: 'ranked' },
  { id: 'lobby-0.5', amount: 0.5, currency: CURRENCY, players: [], capacity: 8, highRoller: false, status: 'open', matchType: 'ranked' },
  { id: 'lobby-1.0', amount: 1.0, currency: CURRENCY, players: [], capacity: 8, highRoller: false, status: 'open', matchType: 'ranked', isComingSoon: true },
  { id: 'lobby-2.5', amount: 2.5, currency: CURRENCY, players: [], capacity: 4, highRoller: true, status: 'open', matchType: 'ranked', isComingSoon: true },
  { id: 'lobby-5.0', amount: 5.0, currency: CURRENCY, players: [], capacity: 4, highRoller: true, status: 'open', matchType: 'ranked', isComingSoon: true },
];

// Lobby timers for AI backfill
export const lobbyTimers = new Map<string, NodeJS.Timeout>();

