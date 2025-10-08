"use client"

import { useEffect, useMemo, useState, useCallback } from "react"
import { isBsc } from "@/lib/chain"
import { evmConfig } from "@/lib/evm-config"

type AnyFn = (...args: any[]) => any

// Chain-aware wallet shim to keep the rest of the app stable during migration
export function useWallet() {
  // Selected provider key: 'metamask' | 'coinbase' | 'brave' | 'rabby' | 'injected'
  const [providerKey, setProviderKey] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    try { return localStorage.getItem('wallet_provider_key') } catch { return null }
  })

  // Shared address across hook instances (same tab/app)
  let _shared: any = (globalThis as any).__cock_wallet__
  if (!_shared) {
    _shared = { evmAddress: null as string | null }
    ;(globalThis as any).__cock_wallet__ = _shared
  }
  const [evmAddress, setEvmAddress] = useState<string | null>(_shared.evmAddress)
  const setAddressShared = useCallback((addr: string | null) => {
    try { (globalThis as any).__cock_wallet__.evmAddress = addr } catch {}
    setEvmAddress(addr)
    try { window.dispatchEvent(new CustomEvent('wallet_address_changed', { detail: addr })) } catch {}
  }, [])
  const [evmConnecting, setEvmConnecting] = useState(false)

  // Prefer the MetaMask provider if multiple are injected
  const getInjectedProvider = useCallback(() => {
    if (typeof window === 'undefined') return null as any
    const w = window as any
    const eth = w.ethereum
    if (!eth) return null
    // If multiple providers are present, select MetaMask specifically
    if (Array.isArray(eth.providers)) {
      const list: any[] = eth.providers
      const pickByKey = (key: string | null) => {
        if (!key) return null
        switch (key) {
          case 'metamask': return list.find((p: any) => p && p.isMetaMask) || null
          case 'coinbase': return list.find((p: any) => p && (p.isCoinbaseWallet || p.isCoinbaseBrowser)) || null
          case 'brave': return list.find((p: any) => p && p.isBraveWallet) || null
          case 'rabby': return list.find((p: any) => p && p.isRabby) || null
          case 'injected': return eth
          default: return null
        }
      }
      const selected = pickByKey(providerKey)
      if (selected) return selected
      const mm = list.find((p: any) => p && p.isMetaMask)
      return mm || eth
    }
    return eth
  }, [providerKey])

  // Enumerate available injected wallets for UI selection
  const injectedWallets = useMemo(() => {
    if (typeof window === 'undefined') return [] as Array<{ key: string, adapter: { name: string } }>
    const w = window as any
    const eth = w.ethereum
    const out: Array<{ key: string, adapter: { name: string } }> = []
    const pushUnique = (key: string, name: string) => {
      if (!out.some(w => w.key === key)) out.push({ key, adapter: { name } })
    }
    if (eth) {
      const list: any[] = Array.isArray(eth.providers) ? eth.providers : [eth]
      for (const p of list) {
        if (!p) continue
        if (p.isMetaMask) pushUnique('metamask', 'MetaMask')
        else if (p.isCoinbaseWallet || p.isCoinbaseBrowser) pushUnique('coinbase', 'Coinbase Wallet')
        else if (p.isBraveWallet) pushUnique('brave', 'Brave Wallet')
        else if (p.isRabby) pushUnique('rabby', 'Rabby Wallet')
        else pushUnique('injected', 'Injected Wallet')
      }
    }
    return out
  }, [])

  // Keep provider selection in sync across components/tabs
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'wallet_provider_key') {
        setProviderKey((e.newValue as string) || null)
      }
    }
    const onCustom = (e: any) => {
      try { if (e?.detail) setProviderKey(String(e.detail)) } catch {}
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener('wallet_provider_changed', onCustom as any)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('wallet_provider_changed', onCustom as any)
    }
  }, [])

  // Ensure we are on BSC (switch or add chain)
  const ensureBscChain = useCallback(async () => {
    if (typeof window === 'undefined') return null
    const eth = getInjectedProvider()
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
  }, [getInjectedProvider])

  // EVM connect helper
  const evmConnect = useCallback(async (key?: string) => {
    if (key) {
      setProviderKey(key)
      try { localStorage.setItem('wallet_provider_key', key) } catch {}
      try { window.dispatchEvent(new CustomEvent('wallet_provider_changed', { detail: key })) } catch {}
    }
    await ensureBscChain()
    if (typeof window === 'undefined') return null
    const eth = getInjectedProvider()
    if (!eth) return null
    try {
      setEvmConnecting(true)
      const accounts: string[] = await eth.request({ method: 'eth_requestAccounts' })
      const addr = accounts && accounts[0] ? String(accounts[0]) : null
      if (addr) setAddressShared(addr)
      return addr
    } finally {
      setEvmConnecting(false)
    }
  }, [ensureBscChain, getInjectedProvider, setAddressShared])

  // EVM disconnect helper (local only)
  const evmDisconnect = useCallback(async () => {
    setAddressShared(null)
  }, [setAddressShared])

  // Initialize from already-connected provider
  useEffect(() => {
    if (!isBsc()) return
    if (typeof window === 'undefined') return
    const eth = getInjectedProvider()
    if (!eth) return
    eth.request({ method: 'eth_accounts' }).then((accounts: string[]) => {
      const addr = accounts && accounts[0] ? String(accounts[0]) : null
      if (addr) setAddressShared(addr)
    }).catch(() => {})
    // Listen for account/chain changes to keep address in sync with MetaMask UI
    const onAccountsChanged = (accounts: string[]) => {
      const addr = accounts && accounts[0] ? String(accounts[0]) : null
      setAddressShared(addr || null)
    }
    const onChainChanged = async (_chainId: string) => {
      try { await ensureBscChain() } catch {}
      try {
        const accounts: string[] = await eth.request({ method: 'eth_accounts' })
        const addr = accounts && accounts[0] ? String(accounts[0]) : null
        setAddressShared(addr || null)
      } catch {}
    }
    const onDisconnect = () => { setAddressShared(null) }
    try {
      eth.on?.('accountsChanged', onAccountsChanged)
      eth.on?.('chainChanged', onChainChanged)
      eth.on?.('disconnect', onDisconnect)
    } catch {}
    const onSharedAddress = (e: any) => { try { setEvmAddress((e?.detail as string) || null) } catch {} }
    window.addEventListener('wallet_address_changed', onSharedAddress as any)
    return () => {
      try {
        eth.removeListener?.('accountsChanged', onAccountsChanged)
        eth.removeListener?.('chainChanged', onChainChanged)
        eth.removeListener?.('disconnect', onDisconnect)
      } catch {}
      window.removeEventListener('wallet_address_changed', onSharedAddress as any)
    }
  }, [ensureBscChain, getInjectedProvider, setAddressShared])

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
      wallet: evmAddress ? { adapter: { name: (injectedWallets.find(w => w.key === (providerKey || 'metamask'))?.adapter.name) || 'BSC (Injected)' } } : null,
      wallets: injectedWallets,
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
