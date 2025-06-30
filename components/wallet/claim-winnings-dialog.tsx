"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Trophy, X, Check, Loader2, AlertCircle } from "lucide-react"
import { useToken } from "@/hooks/use-token"
import Image from "next/image"
import { useWallet } from "@/hooks/use-wallet"
import { useProfile } from "@/hooks/use-profile"
import { ProfileService } from "@/lib/profile-service"

interface ClaimWinningsDialogProps {
  isOpen: boolean
  onClose: () => void
  matchId: string
  winAmount: number
  playSound?: (sound: string) => void
}

// Transaction status type
type TransactionStatus = 'idle' | 'validating' | 'processing' | 'success' | 'error';

export default function ClaimWinningsDialog({
  isOpen,
  onClose,
  matchId,
  winAmount,
  playSound
}: ClaimWinningsDialogProps) {
  const { balance, claimWinnings, refreshBalance } = useToken()
  const { connected, publicKey } = useWallet()
  const { profile, refreshProfile } = useProfile()
  
  const [error, setError] = useState<string | null>(null)
  const [txStatus, setTxStatus] = useState<TransactionStatus>('idle')
  
  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setError(null)
      setTxStatus('idle')
      
      // Refresh balance when opening dialog
      if (connected && publicKey) {
        refreshBalance()
      }
    }
  }, [isOpen, connected, publicKey, refreshBalance])
  
  // Handle claim submission
  const handleClaim = async () => {
    if (playSound) playSound("button")
    
    // Validate connection
    if (!connected || !publicKey) {
      setError("Please connect your wallet first")
      return
    }
    
    // Update transaction status
    setTxStatus('validating')
    
    try {
      // First validate the claim with the API
      setTxStatus('processing')
      
      // Call Solana token claim
      const success = await claimWinnings(winAmount, matchId)
      
      if (success) {
        if (playSound) playSound("success")
        
        // Also record the transaction in our database
        if (publicKey) {
          await ProfileService.recordTransaction({
            wallet_address: publicKey.toString(),
            transaction_type: 'win',
            amount: winAmount,
            timestamp: new Date().toISOString(),
            related_entity_id: matchId,
            description: 'Claimed match winnings'
          })
          
          // Update user profile with the new balance
          if (profile) {
            await ProfileService.updateProfile(publicKey.toString(), {
              token_balance: profile.token_balance + winAmount
            })
            
            // Refresh profile
            await refreshProfile()
          }
        }
        
        setTxStatus('success')
        
        // Close dialog after a short delay to show success state
        setTimeout(() => {
          onClose()
        }, 2000)
      } else {
        if (playSound) playSound("error")
        setTxStatus('error')
        setError("Failed to claim winnings. Please try again.")
      }
    } catch (error: any) {
      console.error("Claim error:", error)
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
                <Trophy className="mr-2 h-6 w-6" />
                Claim Winnings
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
            
            {/* Winnings amount display */}
            <div className="bg-[#2a2a2a] rounded-lg p-4 mb-6">
              <p className="text-gray-400 text-sm mb-1">Your Winnings</p>
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
                  {winAmount.toFixed(2)} $COCK
                </span>
              </div>
            </div>
            
            {/* Profile stats - show how this affects your profile */}
            {profile && (
              <div className="bg-[#2a2a2a] rounded-lg p-4 mb-6">
                <p className="text-gray-400 text-sm mb-1">Profile Stats</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-gray-400">Total Won:</span>
                    <span className="text-white ml-1">
                      {(profile.total_tokens_won + winAmount).toFixed(2)} $COCK
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400">Win Rate:</span>
                    <span className="text-white ml-1">
                      {profile.total_matches > 0 
                        ? Math.round((profile.wins / profile.total_matches) * 100) 
                        : 0}%
                    </span>
                  </div>
                </div>
              </div>
            )}
            
            {/* Error message */}
            {error && (
              <div className="mb-6 p-3 bg-red-900/50 border border-red-800 rounded-lg flex items-start">
                <AlertCircle className="h-5 w-5 text-red-500 mr-2 mt-0.5 flex-shrink-0" />
                <p className="text-red-300 text-sm">{error}</p>
              </div>
            )}
            
            {/* Transaction status */}
            {txStatus === 'validating' && (
              <div className="mb-6 p-3 bg-blue-900/50 border border-blue-800 rounded-lg flex items-center">
                <Loader2 className="h-5 w-5 text-blue-500 mr-2 animate-spin" />
                <p className="text-blue-300 text-sm">Validating your claim...</p>
              </div>
            )}
            
            {txStatus === 'processing' && (
              <div className="mb-6 p-3 bg-yellow-900/50 border border-yellow-800 rounded-lg flex items-center">
                <Loader2 className="h-5 w-5 text-yellow-500 mr-2 animate-spin" />
                <p className="text-yellow-300 text-sm">Processing your claim...</p>
              </div>
            )}
            
            {txStatus === 'success' && (
              <div className="mb-6 p-3 bg-green-900/50 border border-green-800 rounded-lg flex items-center">
                <Check className="h-5 w-5 text-green-500 mr-2" />
                <p className="text-green-300 text-sm">Winnings claimed successfully!</p>
              </div>
            )}
            
            {/* Submit button */}
            <button
              onClick={handleClaim}
              disabled={!!error || txStatus === 'processing' || txStatus === 'validating' || txStatus === 'success' || !connected}
              className={`w-full py-3 px-4 rounded-lg font-bold text-lg flex items-center justify-center transition-all ${
                txStatus === 'validating' || txStatus === 'processing'
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
              {(txStatus === 'validating' || txStatus === 'processing') && <Loader2 className="animate-spin mr-2 h-5 w-5" />}
              {txStatus === 'success' && <Check className="mr-2 h-5 w-5" />}
              
              {txStatus === 'validating' 
                ? 'Validating...' 
                : txStatus === 'processing' 
                ? 'Processing...' 
                : txStatus === 'success' 
                ? 'Claimed!' 
                : txStatus === 'error'
                ? 'Try Again'
                : !connected
                ? 'Connect Wallet'
                : `Claim ${winAmount} $COCK`
              }
            </button>
            
            {/* Match ID */}
            <div className="mt-4 text-xs text-gray-500 text-center">
              Match ID: {matchId}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
} 