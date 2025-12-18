import { clusterApiUrl } from '@solana/web3.js'

export function getBrowserSolanaRpcEndpoint(): string {
  const net = (process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet') as 'devnet' | 'testnet' | 'mainnet-beta'

  // For mainnet we always proxy via same-origin to avoid CORS/403 and keep API keys server-side.
  if (net === 'mainnet-beta') {
    try {
      if (typeof window !== 'undefined' && window.location?.origin) {
        return `${window.location.origin}/api/solana/rpc`
      }
    } catch {}
    // Fallback (should only happen in non-browser contexts)
    return 'http://localhost:3000/api/solana/rpc'
  }

  // Dev/test can use public cluster endpoints.
  return clusterApiUrl(net)
}
