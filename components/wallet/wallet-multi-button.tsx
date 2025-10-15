"use client"

import { WalletMultiButton as SolanaWalletMultiButton } from "@solana/wallet-adapter-react-ui"

export interface WalletMultiButtonProps {
  className?: string
}

export function WalletMultiButton({ className = "" }: WalletMultiButtonProps) {
  return <SolanaWalletMultiButton className={className} />
}

 
