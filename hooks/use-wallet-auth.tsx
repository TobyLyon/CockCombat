"use client"

import { useState, useEffect, useCallback } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { toast } from 'sonner'

export function useWalletAuth() {
  const { connected, publicKey } = useWallet()
  const [authenticated, setAuthenticated] = useState(false)
  const [loading, setLoading] = useState(false)

  // Simple authentication based on wallet connection
  useEffect(() => {
    setAuthenticated(connected && !!publicKey)
  }, [connected, publicKey])

  const signIn = useCallback(async () => {
    if (!connected || !publicKey) {
      toast.error("Please connect your wallet first.")
      return false
    }
    
    setLoading(true)

    try {
      // Simple wallet-based authentication
      // Just verify we have a connected wallet
      console.log('Wallet authenticated:', publicKey.toBase58())
      
      // Small delay to show loading state
      await new Promise(resolve => setTimeout(resolve, 500))
      
      setAuthenticated(true)
      return true
      
    } catch (error) {
      console.error("Authentication error", error)
      toast.error("Authentication failed.", {
        description: error instanceof Error ? error.message : "An unexpected error occurred."
      })
      return false
    } finally {
      setLoading(false)
    }
  }, [publicKey, connected])

  const signOut = async () => {
    setLoading(true)
    setAuthenticated(false)
    // Small delay for UX
    await new Promise(resolve => setTimeout(resolve, 300))
    setLoading(false)
  }

  return { authenticated, loading, signIn, signOut }
} 