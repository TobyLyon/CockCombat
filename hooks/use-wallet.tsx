"use client"

import { useWallet as useSolanaWallet } from "@solana/wallet-adapter-react"

// Re-export Solana's useWallet hook with simplified interface
export function useWallet() {
  const { 
    publicKey,
    connected,
    connecting,
    disconnect,
    select,
    wallet,
    wallets,
    sendTransaction,
    signTransaction,
    signMessage,
    signAllTransactions
  } = useSolanaWallet()

  // Create a simple interface that matches our existing code
  return {
    publicKey,
    connected,
    connecting,
    disconnect,
    wallet,
    wallets,
    select,
    sendTransaction,
    signTransaction,
    signMessage,
    signAllTransactions
  }
}
