/**
 * Chain selector and small helpers
 */

export type ChainType = 'solana' | 'bsc';

export function getChain(): ChainType {
  const raw = (process.env.CHAIN || 'bsc').toLowerCase();
  return raw === 'bsc' ? 'bsc' : 'solana';
}

export function isSolana(): boolean {
  return getChain() === 'solana';
}

export function isBsc(): boolean {
  return getChain() === 'bsc';
}

export function getNativeDecimals(): number {
  return isBsc() ? 18 : 9; // BNB uses 18, SOL uses 9
}

export function toNativeUnits(amount: number): number {
  const decimals = getNativeDecimals();
  const multiplier = Math.pow(10, decimals);
  return Math.round(amount * multiplier);
}


