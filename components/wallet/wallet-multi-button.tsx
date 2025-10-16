"use client"

import { useCallback, useMemo, useState } from "react"
import { useWallet } from "@/hooks/use-wallet"
import { useUsername, getDisplayName } from "@/hooks/use-username"
import { truncateAddress } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Copy, ChevronDown, LogOut, Wallet } from "lucide-react"
import { useWalletModal } from "@solana/wallet-adapter-react-ui"

export interface WalletMultiButtonProps {
  className?: string
}

export function WalletMultiButton({ className = "" }: WalletMultiButtonProps) {
  const { connected, publicKey, disconnect } = useWallet()
  const modal = useWalletModal() as any
  const address = useMemo(() => {
    try {
      if (!publicKey) return ""
      const str = (typeof publicKey === 'string')
        ? publicKey
        : (publicKey as any)?.toBase58?.() || (publicKey as any)?.toString?.() || ""
      return String(str)
    } catch { return "" }
  }, [publicKey])

  const username = useUsername(address)
  const display = useMemo(() => getDisplayName(username, address) || truncateAddress(address), [username, address])

  const onConnect = useCallback(() => {
    try { modal?.setVisible?.(true) } catch {}
  }, [modal])

  const onCopy = useCallback(async () => {
    try { await navigator.clipboard.writeText(address) } catch {}
  }, [address])

  if (!connected) {
    return (
      <Button className={className} onClick={onConnect}>
        <Wallet className="mr-2 h-4 w-4" /> Connect Wallet
      </Button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className={className}>
          <Wallet className="mr-2 h-4 w-4" /> {display}
          <ChevronDown className="ml-2 h-4 w-4 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[12rem]">
        <DropdownMenuItem onClick={onCopy}>
          <Copy className="mr-2 h-4 w-4" /> Copy Address
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onConnect}>
          <Wallet className="mr-2 h-4 w-4" /> Switch Wallet
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => { try { (disconnect as any)?.() } catch {} }}>
          <LogOut className="mr-2 h-4 w-4" /> Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

