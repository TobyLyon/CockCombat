"use client"

import { useState, useEffect } from "react"
import { useToken } from "@/hooks/use-token"
import Image from "next/image"
import { Coins, RefreshCw } from "lucide-react"
import { useWallet } from "@/hooks/use-wallet"

interface TokenDisplayProps {
  showRefresh?: boolean
  compact?: boolean
  className?: string
  onTokenClick?: () => void
}

export function TokenDisplay({ 
  showRefresh = true, 
  compact = false,
  className = "",
  onTokenClick
}: TokenDisplayProps) {
  const { balance, isLoading, refreshBalance } = useToken()
  const { connected } = useWallet()
  const [isRefreshing, setIsRefreshing] = useState(false)
  
  // Handle refresh button click
  const handleRefresh = async () => {
    if (isRefreshing || !connected) return
    
    setIsRefreshing(true)
    await refreshBalance()
    
    // Show refreshing state for a minimum time
    setTimeout(() => {
      setIsRefreshing(false)
    }, 500)
  }
  
  if (!connected) {
    return (
      <div className={`inline-flex items-center gap-2 py-2 px-3 bg-[#2a2a2a] rounded-lg ${className}`}>
        <Coins className="h-4 w-4 text-gray-400" />
        <span className="text-gray-400 text-sm">Not connected</span>
      </div>
    )
  }
  
  return (
    <div 
      className={`inline-flex items-center gap-2 py-2 px-3 bg-[#2a2a2a] rounded-lg ${
        onTokenClick ? "cursor-pointer hover:bg-[#3a3a3a] transition-colors" : ""
      } ${className}`}
      onClick={onTokenClick}
    >
      <div className="relative h-6 w-6 flex-shrink-0">
        <Image 
          src="/images/cock-token.png" 
          alt="$COCK Token" 
          width={24} 
          height={24}
          className="object-contain"
        />
      </div>
      
      {isLoading || isRefreshing ? (
        <div className="flex items-center gap-1">
          <div className="h-3 w-12 bg-gray-700 animate-pulse rounded"></div>
          <span className="text-gray-400 text-sm">$COCK</span>
        </div>
      ) : (
        <span className="text-white font-medium">
          {balance.toFixed(compact ? 1 : 2)}
          <span className="text-gray-400 ml-1 text-sm">$COCK</span>
        </span>
      )}
      
      {showRefresh && (
        <button 
          onClick={(e) => {
            e.stopPropagation()
            handleRefresh()
          }}
          disabled={isRefreshing || isLoading}
          className="text-gray-400 hover:text-white transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
        </button>
      )}
    </div>
  )
} 