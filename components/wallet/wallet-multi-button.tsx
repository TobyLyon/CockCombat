"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { useWallet } from "@solana/wallet-adapter-react"
import { WalletMultiButton as SolanaWalletMultiButton } from "@solana/wallet-adapter-react-ui"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { Copy, Check, LogOut, Wallet, User } from "lucide-react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

export interface WalletMultiButtonProps {
  onClickSound?: () => void;
  className?: string;
}

export function WalletMultiButton({ onClickSound, className = "" }: WalletMultiButtonProps) {
  const { 
    connected, 
    connecting, 
    publicKey, 
    disconnect, 
    wallet: selectedWallet,
  } = useWallet()
  const router = useRouter()
  const [copied, setCopied] = useState(false)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)

  const copyAddress = () => {
    if (publicKey) {
      try {
        navigator.clipboard.writeText(publicKey.toString())
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch (err) {
        console.error("Failed to copy address", err)
        toast.error("Failed to copy address")
      }
    }
  }

  const handleDisconnect = async () => {
    if (onClickSound) onClickSound()
    
    try {
      await disconnect()
    } catch (err) {
      console.error("Disconnect error:", err)
      toast.error("Failed to disconnect wallet")
    }
  }

  const handleProfileClick = () => {
    if (onClickSound) onClickSound()
    router.push("/profile")
  }

  // If not connected, show the native Solana wallet button
  if (!connected) {
    return (
      <div onClick={onClickSound} className={className}>
        <SolanaWalletMultiButton className="!bg-[#fbbf24] !text-[#333333] !font-bold !py-2 !px-4 !rounded !border-b-4 !border-[#d97706] hover:!bg-[#f59e0b] hover:!border-[#b45309] !transition-all !flex !items-center !gap-2" />
      </div>
    )
  }

  // If connected, show our custom dropdown
  return (
    <DropdownMenu onOpenChange={setIsDropdownOpen}>
      <DropdownMenuTrigger asChild>
        <motion.button
          className={`bg-[#fbbf24] text-[#333333] font-bold py-2 px-4 rounded border-b-4 border-[#d97706] hover:bg-[#f59e0b] hover:border-[#b45309] transition-all flex items-center gap-2 ${className} ${isDropdownOpen ? "bg-[#f59e0b] border-[#b45309]" : ""}`}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <Wallet className="h-5 w-5 hidden sm:block" />
          <span className="truncate max-w-[80px] sm:max-w-[100px]">
            {publicKey?.toString().slice(0, 4)}...{publicKey?.toString().slice(-4)}
          </span>
        </motion.button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="bg-[#333333] border-2 border-[#555555] text-white min-w-[200px]">
        <div className="px-2 py-1.5 text-xs text-gray-400 border-b border-[#555555]">
          {selectedWallet?.adapter.name || "Connected"}
        </div>
        <DropdownMenuItem onClick={copyAddress} className="cursor-pointer hover:bg-[#444444] flex items-center">
          {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
          {copied ? "Copied" : "Copy Address"}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleProfileClick} className="cursor-pointer hover:bg-[#444444] flex items-center">
          <User className="mr-2 h-4 w-4" />
          My Profile
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-[#555555]" />
        <DropdownMenuItem onClick={handleDisconnect} className="cursor-pointer hover:bg-[#444444] flex items-center text-red-400 hover:!text-red-400">
          <LogOut className="mr-2 h-4 w-4" />
          Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
