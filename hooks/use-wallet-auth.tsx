"use client"

import { useState, useEffect, useCallback } from 'react'
import { useWallet } from '@/hooks/use-wallet'
import { toast } from 'sonner'
import { isBsc } from '@/lib/chain'

export function useWalletAuth() {
  const { connected, publicKey, signMessage } = useWallet()
  const [authenticated, setAuthenticated] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)

  useEffect(() => {
    // If wallet disconnects, drop session state locally
    if (!connected) {
      setAuthenticated(false)
      setSessionId(null)
    }
  }, [connected])

  const signIn = useCallback(async (): Promise<string | null> => {
    if (!connected || !publicKey) {
      toast.error("Please connect your wallet first.")
      return null
    }
    if (!signMessage) {
      toast.error("Your wallet does not support message signing.")
      return null
    }
    
    setLoading(true)
    try {
      const walletAddress = publicKey.toString()

      // 1) Get nonce and human-readable message
      const nonceRes = await fetch('/api/auth/nonce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress }),
      })
      if (!nonceRes.ok) {
        const err = await nonceRes.json().catch(() => ({}))
        throw new Error(err?.error || 'Failed to get nonce')
      }
      const { nonce, message } = await nonceRes.json()

      // 2) Sign message with wallet
      const messageBytes = new TextEncoder().encode(message)
      // For Solana we expect base58; for BSC we accept hex
      let signature: string
      const sig = await (signMessage as any)(messageBytes)
      if (isBsc()) {
        signature = sig
      } else {
        signature = Array.isArray(sig) || sig instanceof Uint8Array ? (await import('bs58')).default.encode(sig) : String(sig)
      }

      // 3) Verify on server and mint a session
      const verifyRes = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress, signature, nonce }),
      })
      if (!verifyRes.ok) {
        const err = await verifyRes.json().catch(() => ({}))
        throw new Error(err?.error || 'Authentication failed')
      }
      const verifyJson = await verifyRes.json()

      setSessionId(verifyJson.sessionId)
      setAuthenticated(true)
      return verifyJson.sessionId || null
    } catch (error) {
      console.error('Authentication error', error)
      toast.error('Authentication failed.', {
        description: error instanceof Error ? error.message : 'An unexpected error occurred.'
      })
      return null
    } finally {
      setLoading(false)
    }
  }, [publicKey, connected, signMessage])

  const signOut = useCallback(async () => {
    setLoading(true)
    try {
      if (sessionId && publicKey) {
        // Best-effort server invalidation
        await fetch('/api/auth/session', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        }).catch(() => null)
      }
    } finally {
      setAuthenticated(false)
      setSessionId(null)
      await new Promise(resolve => setTimeout(resolve, 300))
      setLoading(false)
    }
  }, [sessionId, publicKey])

  return { authenticated, loading, sessionId, signIn, signOut }
}