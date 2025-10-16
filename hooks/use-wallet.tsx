"use client"

import { useMemo } from "react"
import { useWallet as useSolanaWallet } from "@solana/wallet-adapter-react"
import { useWalletEnv } from "@/contexts/WalletEnvContext"

type AnyFn = (...args: any[]) => any

// Solana wallet hook backed by wallet-adapter
export function useWallet() {
  // Access the adapter; if provider is missing at runtime, return a safe fallback
  const { hasWalletProvider } = (() => { try { return useWalletEnv() } catch { return { hasWalletProvider: false } as any } })()
  const base = (() => {
    if (!hasWalletProvider) return {} as any
    try { return useSolanaWallet() as any } catch { return {} as any }
  })()

  const safeGet = <T,>(getter: () => T, fallback: T): T => {
    try { return getter() } catch { return fallback }
  }

  const publicKey = safeGet(() => base.publicKey, undefined)
  const connected = safeGet(() => base.connected, false)
  const connecting = safeGet(() => base.connecting, false)
  const disconnect = safeGet(() => base.disconnect, undefined) as AnyFn | undefined
  const wallet = safeGet(() => base.wallet, undefined)
  const rawWallets = safeGet(() => base.wallets, []) as any[]
  const select = safeGet(() => base.select, undefined) as AnyFn | undefined
  const sendTransaction = safeGet(() => base.sendTransaction, undefined) as AnyFn | undefined
  const signTransaction = safeGet(() => base.signTransaction, undefined) as AnyFn | undefined
  const signAllTransactions = safeGet(() => base.signAllTransactions, undefined) as AnyFn | undefined
  const signMessage = safeGet(() => base.signMessage, undefined) as AnyFn | undefined

  const simplifiedWallets = useMemo(() => {
    return (rawWallets || []).map((w: any) => ({ key: safeGet(() => w.adapter?.name, ''), adapter: { name: safeGet(() => w.adapter?.name, '') } }))
  }, [rawWallets])

  return {
    publicKey,
    connected,
    connecting,
    disconnect: (disconnect || (() => {})) as AnyFn,
    wallet,
    wallets: simplifiedWallets,
    select: (select || (() => {})) as AnyFn,
    chooseAccount: undefined,
    sendTransaction: (sendTransaction || (() => Promise.reject(new Error('sendTransaction unavailable')))) as AnyFn,
    signTransaction: (signTransaction || (() => Promise.reject(new Error('signTransaction unavailable')))) as AnyFn,
    signMessage: (signMessage || (() => Promise.reject(new Error('signMessage unavailable')))) as AnyFn,
    signAllTransactions: (signAllTransactions || (() => Promise.reject(new Error('signAllTransactions unavailable')))) as AnyFn,
  }
}
