"use client"

import { useEffect, useMemo, useState, useCallback } from "react"
import { useWallet as useSolanaWallet } from "@solana/wallet-adapter-react"
import { isBsc } from "@/lib/chain"

type AnyFn = (...args: any[]) => any

// Chain-aware wallet shim to keep the rest of the app stable during migration
export function useWallet() {
  // SOL path: passthrough
  const sol = useSolanaWallet()

  const [evmAddress, setEvmAddress] = useState<string | null>(null)
  const [evmConnecting, setEvmConnecting] = useState(false)

  // EVM connect helper
  const evmConnect = useCallback(async () => {
    if (typeof window === 'undefined') return null
    const eth = (window as any).ethereum
    if (!eth) return null
    try {
      setEvmConnecting(true)
      const accounts: string[] = await eth.request({ method: 'eth_requestAccounts' })
      const addr = accounts && accounts[0] ? String(accounts[0]) : null
      if (addr) setEvmAddress(addr)
      return addr
    } finally {
      setEvmConnecting(false)
    }
  }, [])

  // EVM disconnect helper (local only)
  const evmDisconnect = useCallback(async () => {
    setEvmAddress(null)
  }, [])

  // Initialize from already-connected provider
  useEffect(() => {
    if (!isBsc()) return
    if (typeof window === 'undefined') return
    const eth = (window as any).ethereum
    if (!eth) return
    eth.request({ method: 'eth_accounts' }).then((accounts: string[]) => {
      const addr = accounts && accounts[0] ? String(accounts[0]) : null
      if (addr) setEvmAddress(addr)
    }).catch(() => {})
  }, [])

  // Provide a publicKey-like shim for EVM with toBase58()/toString()
  const evmPublicKey = useMemo(() => {
    if (!evmAddress) return null
    const addr = evmAddress
    return {
      toBase58: () => addr,
      toString: () => addr,
    }
  }, [evmAddress])

  // EVM message signing
  const evmSignMessage: AnyFn = useCallback(async (messageBytes: Uint8Array) => {
    if (typeof window === 'undefined') throw new Error('No window')
    const eth = (window as any).ethereum
    if (!eth) throw new Error('No EVM provider')
    const from = evmAddress || await evmConnect()
    if (!from) throw new Error('No account')
    // Convert bytes to hex
    const hex = '0x' + Buffer.from(messageBytes).toString('hex')
    const sig: string = await eth.request({ method: 'personal_sign', params: [hex, from] })
    return sig // hex string
  }, [evmAddress, evmConnect])

  // Compose chain-aware return
  if (isBsc()) {
    return {
      publicKey: evmPublicKey,
      connected: Boolean(evmAddress),
      connecting: evmConnecting,
      disconnect: evmDisconnect as AnyFn,
      wallet: evmAddress ? { adapter: { name: 'EVM (Injected)' } } : null,
      wallets: [],
      select: evmConnect as AnyFn,
      sendTransaction: null,
      signTransaction: null,
      signMessage: evmSignMessage as AnyFn,
      signAllTransactions: null,
    }
  }

  // Solana passthrough
  return sol as any
}
