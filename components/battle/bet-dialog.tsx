"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Coins, X, ChevronLeft, ChevronRight, AlertCircle, Check, Loader2 } from "lucide-react"
import { useToken } from "@/hooks/use-token"
import Image from "next/image"
import { useWallet } from "@/hooks/use-wallet"
import { useConnection } from "@solana/wallet-adapter-react"

interface BetDialogProps {
  isOpen: boolean
  onClose: () => void
  onBetPlaced: (amount: number) => void
  minBet?: number
  maxBet?: number
  defaultBet?: number
  playSound?: (sound: string) => void
}

// Transaction status type
type TransactionStatus = 'idle' | 'processing' | 'success' | 'error';

export default function BetDialog({
  isOpen,
  onClose,
  onBetPlaced,
  minBet = 1,
  maxBet = 100,
  defaultBet = 5,
  playSound
}: BetDialogProps) {
  const { balance, placeBet, isLoading, tokenMint, escrowWallet, refreshBalance } = useToken()
  const { connected, publicKey } = useWallet()
  const { connection } = useConnection()
  
  const [betAmount, setBetAmount] = useState(defaultBet)
  const [error, setError] = useState<string | null>(null)
  const [txStatus, setTxStatus] = useState<TransactionStatus>('idle')
  const [txSignature, setTxSignature] = useState<string | null>(null)
  
  // Reset bet amount and error when dialog opens
  useEffect(() => {
    if (isOpen) {
      setBetAmount(defaultBet)
      setError(null)
      setTxStatus('idle')
      setTxSignature(null)
      
      // Refresh balance when opening dialog
      if (connected && publicKey) {
        refreshBalance()
      }
    }
  }, [isOpen, defaultBet, connected, publicKey, refreshBalance])
  
  // Handle bet amount change
  const handleBetChange = (amount: number) => {
    if (playSound) playSound("click")
    
    // Enforce min/max boundaries
    let newAmount = Math.max(minBet, Math.min(maxBet, amount))
    
    // Enforce integer values
    newAmount = Math.floor(newAmount)
    
    setBetAmount(newAmount)
    
    // Clear error if the amount is valid
    if (newAmount <= balance) {
      setError(null)
    } else {
      setError(`Not enough $COCK tokens. You have ${balance.toFixed(1)} but need ${newAmount}`)
    }
  }
  
  // Increment/decrement bet amount
  const adjustBet = (adjustment: number) => {
    handleBetChange(betAmount + adjustment)
  }
  
  // Handle bet submission
  const handleSubmit = async () => {
    if (playSound) playSound("button")
    
    // Validate connection
    if (!connected) {
      setError("Please connect your wallet first")
      return
    }
    
    // Validate token mint
    if (!tokenMint) {
      setError("Token not configured")
      return
    }
    
    // Validate escrow wallet
    if (!escrowWallet) {
      setError("Game wallet not configured")
      return
    }
    
    // Validate bet amount
    if (betAmount < minBet) {
      setError(`Minimum bet is ${minBet} $COCK`)
      return
    }
    
    if (betAmount > maxBet) {
      setError(`Maximum bet is ${maxBet} $COCK`)
      return
    }
    
    if (betAmount > balance) {
      setError(`Not enough $COCK tokens. You have ${balance.toFixed(1)} but need ${betAmount}`)
      return
    }
    
    // Update transaction status
    setTxStatus('processing')
    
    // Try to place the bet
    try {
      const success = await placeBet(betAmount)
      
      if (success) {
        if (playSound) playSound("success")
        setTxStatus('success')
        
        // Notify parent component
        onBetPlaced(betAmount)
        
        // Close dialog after a short delay to show success state
        setTimeout(() => {
          onClose()
        }, 1500)
      } else {
        if (playSound) playSound("error")
        setTxStatus('error')
        setError("Failed to place bet. Please try again.")
      }
    } catch (error: any) {
      console.error("Bet error:", error)
      if (playSound) playSound("error")
      setTxStatus('error')
      setError(error.message || "Transaction failed. Please try again.")
    }
  }
  
  if (!isOpen) return null
  
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 flex items-center justify-center z-50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/70"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          
          {/* Dialog content */}
          <motion.div
            className="bg-[#1a1a1a] border-2 border-[#fbbf24] rounded-lg p-6 w-full max-w-md relative z-10"
            initial={{ scale: 0.9, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, y: 20, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
          >
            {/* Header with close button */}
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-[#fbbf24] flex items-center">
                <Coins className="mr-2 h-6 w-6" />
                Place Your Bet
              </h2>
              
              <button
                onClick={() => {
                  if (playSound) playSound("click")
                  onClose()
                }}
                className="text-gray-400 hover:text-white transition-colors"
                disabled={txStatus === 'processing'}
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            
            {/* Current balance */}
            <div className="bg-[#2a2a2a] rounded-lg p-4 mb-6">
              <p className="text-gray-400 text-sm mb-1">Your Balance</p>
              <div className="flex items-center">
                <div className="relative h-8 w-8 mr-2">
                  <Image 
                    src="/images/cock-token.png" 
                    alt="$COCK Token" 
                    width={32} 
                    height={32}
                    className="object-contain"
                  />
                </div>
                <span className="text-xl font-bold text-white">
                  {balance.toFixed(2)} $COCK
                </span>
              </div>
            </div>
            
            {/* Bet amount input */}
            <div className="mb-6">
              <label className="block text-gray-400 text-sm mb-2">
                Bet Amount
              </label>
              
              <div className="flex items-center">
                <button
                  onClick={() => adjustBet(-1)}
                  disabled={betAmount <= minBet || txStatus === 'processing'}
                  className="bg-[#333333] hover:bg-[#444444] text-white p-2 rounded-l-lg disabled:opacity-50"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                
                <div className="relative flex-1">
                  <div className="relative h-6 w-6 absolute left-3 top-1/2 transform -translate-y-1/2">
                    <Image 
                      src="/images/cock-token.png" 
                      alt="$COCK Token" 
                      width={24} 
                      height={24}
                      className="object-contain"
                    />
                  </div>
                  
                  <input
                    type="number"
                    value={betAmount}
                    onChange={(e) => handleBetChange(parseInt(e.target.value) || 0)}
                    min={minBet}
                    max={maxBet}
                    disabled={txStatus === 'processing'}
                    className="bg-[#333333] text-white text-center py-3 px-10 w-full focus:outline-none focus:ring-2 focus:ring-[#fbbf24] disabled:opacity-50"
                  />
                  
                  <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                    $COCK
                  </span>
                </div>
                
                <button
                  onClick={() => adjustBet(1)}
                  disabled={betAmount >= maxBet || txStatus === 'processing'}
                  className="bg-[#333333] hover:bg-[#444444] text-white p-2 rounded-r-lg disabled:opacity-50"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
              
              <div className="mt-2 flex justify-between text-sm text-gray-400">
                <span>Min: {minBet} $COCK</span>
                <span>Max: {maxBet} $COCK</span>
              </div>
            </div>
            
            {/* Potential winnings */}
            <div className="bg-[#2a2a2a] rounded-lg p-4 mb-6">
              <p className="text-gray-400 text-sm mb-1">Potential Winnings</p>
              <div className="flex items-center">
                <div className="relative h-8 w-8 mr-2">
                  <Image 
                    src="/images/cock-token.png" 
                    alt="$COCK Token" 
                    width={32} 
                    height={32}
                    className="object-contain"
                  />
                </div>
                <span className="text-xl font-bold text-green-500">
                  {(betAmount * 1.95).toFixed(2)} $COCK
                </span>
              </div>
            </div>
            
            {/* Error message */}
            {error && (
              <div className="mb-6 p-3 bg-red-900/50 border border-red-800 rounded-lg flex items-start">
                <AlertCircle className="h-5 w-5 text-red-500 mr-2 mt-0.5 flex-shrink-0" />
                <p className="text-red-300 text-sm">{error}</p>
              </div>
            )}
            
            {/* Transaction status */}
            {txStatus === 'processing' && (
              <div className="mb-6 p-3 bg-yellow-900/50 border border-yellow-800 rounded-lg flex items-center">
                <Loader2 className="h-5 w-5 text-yellow-500 mr-2 animate-spin" />
                <p className="text-yellow-300 text-sm">Processing your bet...</p>
              </div>
            )}
            
            {txStatus === 'success' && (
              <div className="mb-6 p-3 bg-green-900/50 border border-green-800 rounded-lg flex items-center">
                <Check className="h-5 w-5 text-green-500 mr-2" />
                <p className="text-green-300 text-sm">Bet placed successfully!</p>
              </div>
            )}
            
            {/* Submit button */}
            <button
              onClick={handleSubmit}
              disabled={!!error || txStatus === 'processing' || txStatus === 'success' || !connected}
              className={`w-full py-3 px-4 rounded-lg font-bold text-lg flex items-center justify-center transition-all ${
                txStatus === 'processing' 
                  ? 'bg-yellow-600 cursor-wait' 
                  : txStatus === 'success'
                  ? 'bg-green-600 cursor-default'
                  : txStatus === 'error'
                  ? 'bg-red-600 hover:bg-red-700'
                  : !connected
                  ? 'bg-gray-600 cursor-not-allowed'
                  : 'bg-[#fbbf24] hover:bg-[#f59e0b] text-[#333333]'
              }`}
            >
              {txStatus === 'processing' && <Loader2 className="animate-spin mr-2 h-5 w-5" />}
              {txStatus === 'success' && <Check className="mr-2 h-5 w-5" />}
              
              {txStatus === 'processing' 
                ? 'Processing...' 
                : txStatus === 'success' 
                ? 'Bet Placed!' 
                : txStatus === 'error'
                ? 'Try Again'
                : !connected
                ? 'Connect Wallet'
                : `Place ${betAmount} $COCK Bet`
              }
            </button>
            
            {/* Wallet connection info */}
            {!connected && (
              <div className="mt-4 text-center text-sm text-gray-400">
                You need to connect your wallet to place bets
              </div>
            )}
            
            {/* Token info for debugging (can be removed in production) */}
            {connected && tokenMint && (
              <div className="mt-4 text-xs text-gray-500 text-center">
                Token: {`${tokenMint.slice(0, 4)}...${tokenMint.slice(-4)}`}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
} 