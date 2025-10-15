"use client"

import { useMemo } from "react"
import { useWallet as useSolanaWallet } from "@solana/wallet-adapter-react"

type AnyFn = (...args: any[]) => any

// Solana wallet hook backed by wallet-adapter
export function useWallet() {
  const {
    publicKey,
    connected,
    connecting,
    disconnect,
    wallet,
    wallets,
    select,
    sendTransaction,
    signTransaction,
    signAllTransactions,
    signMessage,
  } = useSolanaWallet()

  const simplifiedWallets = useMemo(() => {
    return (wallets || []).map((w: any) => ({ key: w.adapter?.name, adapter: { name: w.adapter?.name } }))
  }, [wallets])

  return {
    publicKey,
    connected,
    connecting,
    disconnect: disconnect as AnyFn,
    wallet,
    wallets: simplifiedWallets,
    select: select as AnyFn,
    chooseAccount: undefined,
    sendTransaction: sendTransaction as AnyFn,
    signTransaction: signTransaction as AnyFn,
    signMessage: signMessage as AnyFn,
    signAllTransactions: signAllTransactions as AnyFn,
  }
}
