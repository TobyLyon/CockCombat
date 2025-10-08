"use client"

import { useEffect, useMemo, useState, useCallback } from "react"
import { isBsc } from "@/lib/chain"
import { evmConfig } from "@/lib/evm-config"

type AnyFn = (...args: any[]) => any

// Chain-aware wallet shim to keep the rest of the app stable during migration
export function useWallet() {

  const [evmAddress, setEvmAddress] = useState<string | null>(null)
  const [evmConnecting, setEvmConnecting] = useState(false)

  // Ensure we are on BSC (switch or add chain)
  const ensureBscChain = useCallback(async () => {
    if (typeof window === 'undefined') return null
    const eth = (window as any).ethereum
    if (!eth) return null
    const { chainId, rpcUrl } = evmConfig.getConfig()
    const hexChainId = '0x' + chainId.toString(16)
    try {
      await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hexChainId }] })
    } catch (switchError: any) {
      if (switchError?.code === 4902 || String(switchError?.message || '').includes('Unrecognized chain ID')) {
        try {
          await eth.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: hexChainId,
              chainName: chainId === 56 ? 'BNB Smart Chain' : 'BNB Smart Chain Testnet',
              nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
              rpcUrls: [rpcUrl],
              blockExplorerUrls: [chainId === 56 ? 'https://bscscan.com' : 'https://testnet.bscscan.com'],
            }]
          })
        } catch {
          // ignore
        }
      }
    }
    return true
  }, [])

  // EVM connect helper
  const evmConnect = useCallback(async () => {
    await ensureBscChain()
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
  }, [ensureBscChain])

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
      wallet: evmAddress ? { adapter: { name: 'BSC (Injected)' } } : null,
      wallets: [],
      select: evmConnect as AnyFn,
      sendTransaction: null,
      signTransaction: null,
      signMessage: evmSignMessage as AnyFn,
      signAllTransactions: null,
    }
  }

  // Non-BSC path disabled in EVM-only build
  return {
    publicKey: null,
    connected: false,
    connecting: false,
    disconnect: async () => {},
    wallet: null,
    wallets: [],
    select: async () => null,
    sendTransaction: null,
    signTransaction: null,
    signMessage: null,
    signAllTransactions: null,
  } as any
}
