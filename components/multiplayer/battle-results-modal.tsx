"use client"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useProfile } from "@/contexts/ProfileContext"
import { useAudio } from "@/contexts/AudioContext"
import confetti from "canvas-confetti"
import { useEffect, useState } from "react"
import ClaimWinningsDialog from "@/components/wallet/claim-winnings-dialog"
import { TokenDisplay } from "@/components/wallet/token-display"
import { ProfileService } from "@/lib/profile-service"
import { useWallet } from "@/hooks/use-wallet"

interface BattleResultsModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: { isWinner: boolean; byDisconnect?: boolean } | null;
  playerName?: string;
  opponentName?: string;
  matchId?: string;
}

export default function BattleResultsModal({ 
  isOpen, 
  onClose, 
  result, 
  playerName, 
  opponentName,
  matchId = 'default-match' 
}: BattleResultsModalProps) {
  const isWinner = result?.isWinner
  const { playSound } = useAudio()
  const { publicKey, connected } = useWallet()
  const { 
    profile, 
    refreshProfile, 
    activeChicken, 
    currentWagerAmount, 
    recordMatch 
  } = useProfile()
  
  const [showClaimDialog, setShowClaimDialog] = useState(false)
  
  // Calculate rewards based on wager amount
  const expReward = isWinner ? 100 : 25
  const cockReward = isWinner ? currentWagerAmount * 2 : 0 // Double the wager amount as reward
  const rankPoints = isWinner ? 15 : 0

  // Record match in our profile system when battle ends
  useEffect(() => {
    if (isOpen && profile && publicKey && result !== null) {
      const recordTheMatch = async () => {
        try {
          // Create match record
          const matchData = {
            match_timestamp: new Date().toISOString(),
            player1_wallet: publicKey.toString(),
            player1_chicken_id: activeChicken?.id,
            player1_tokens_wagered: currentWagerAmount,
            player2_wallet: 'opponent', // In a real app, we'd have the opponent's wallet
            player2_chicken_id: undefined,
            player2_tokens_wagered: currentWagerAmount,
            winner_wallet: isWinner ? publicKey.toString() : 'opponent',
            duration_seconds: 180, // Placeholder
            map: 'standard',
            metadata: {
              player1_name: playerName || profile.username,
              player2_name: opponentName || 'Opponent',
              by_disconnect: result.byDisconnect
            }
          }
          
          // Record match
          await recordMatch(matchData)
          
          // Refresh profile to get updated stats
          await refreshProfile()
        } catch (error) {
          console.error("Error recording match:", error)
        }
      }
      
      recordTheMatch()
    }
  }, [isOpen, profile, publicKey, isWinner, currentWagerAmount, activeChicken, playerName, opponentName, result, recordMatch, refreshProfile])

  // Trigger confetti effect on win
  useEffect(() => {
    if (isOpen && isWinner) {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      })
    }
  }, [isOpen, isWinner])
  
  // Handle claim button click
  const handleClaimClick = () => {
    if (playSound) playSound("click")
    setShowClaimDialog(true)
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="bg-[#333333] border-[#666666] text-white max-w-md">
          <DialogHeader>
            <DialogTitle className={`text-2xl font-bold pixel-font ${isWinner ? "text-yellow-400" : "text-red-500"}`}>
              {isWinner ? "VICTORY!" : "DEFEAT!"}
            </DialogTitle>
          </DialogHeader>

          <div className="py-6">
            <div className="flex justify-center mb-6">
              <div
                className={`w-24 h-24 rounded-full ${isWinner ? "bg-yellow-500" : "bg-red-500"} flex items-center justify-center`}
              >
                <span className="text-4xl">{isWinner ? "🏆" : "💀"}</span>
              </div>
            </div>

            <div className="text-center mb-6">
              <p className="text-xl mb-2">
                {isWinner ? `You defeated ${opponentName}!` : `You were defeated by ${opponentName}!`}
              </p>

              {result?.byDisconnect && (
                <p className="text-sm text-gray-400">Your opponent disconnected from the battle.</p>
              )}
            </div>

            <div className="bg-[#444444] p-4 rounded-lg mb-6">
              <h3 className="font-bold mb-2 text-center">Battle Rewards</h3>

              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm text-gray-300">Experience</p>
                  <p className="font-bold text-green-400">+{expReward} XP</p>
                </div>

                <div>
                  <p className="text-sm text-gray-300">$COCK</p>
                  <p className="font-bold text-yellow-400">
                    {isWinner ? `+${currentWagerAmount}` : `-${currentWagerAmount}`}
                  </p>
                </div>

                <div>
                  <p className="text-sm text-gray-300">Rank Points</p>
                  <p className="font-bold text-blue-400">{isWinner ? `+${rankPoints}` : '0'}</p>
                </div>
              </div>
            </div>

            <div className="bg-[#444444] p-4 rounded-lg mb-6">
              <h3 className="font-bold mb-2 text-center">Wager Results</h3>
              
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm text-gray-300">Wagered</p>
                  <p className="font-bold text-yellow-400">{currentWagerAmount} $COCK</p>
                </div>

                <div>
                  <p className="text-sm text-gray-300">{isWinner ? 'Won' : 'Lost'}</p>
                  <p className={`font-bold ${isWinner ? 'text-green-400' : 'text-red-400'}`}>
                    {isWinner ? `${cockReward} $COCK` : `${currentWagerAmount} $COCK`}
                  </p>
                </div>
              </div>
              
              {/* Add token balance display */}
              <div className="mt-4 flex justify-center">
                <TokenDisplay showRefresh={true} />
              </div>
            </div>

            {profile && (
              <div className="bg-[#444444] p-4 rounded-lg mb-6">
                <h3 className="font-bold mb-2 text-center">Your Stats</h3>
                
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-gray-300">Total Matches</p>
                    <p className="font-bold text-white">{profile.total_matches}</p>
                  </div>
                  
                  <div>
                    <p className="text-gray-300">Win Rate</p>
                    <p className="font-bold text-white">
                      {profile.total_matches > 0 
                        ? Math.round((profile.wins / profile.total_matches) * 100) 
                        : 0}%
                    </p>
                  </div>
                  
                  <div>
                    <p className="text-gray-300">Total Won</p>
                    <p className="font-bold text-green-400">{profile.total_tokens_won} $COCK</p>
                  </div>
                  
                  <div>
                    <p className="text-gray-300">Total Lost</p>
                    <p className="font-bold text-red-400">{profile.total_tokens_lost} $COCK</p>
                  </div>
                </div>
                
                {activeChicken && (
                  <div className="mt-3 pt-3 border-t border-gray-600">
                    <p className="text-sm text-center text-gray-300 mb-2">
                      {activeChicken.name}'s Record: {activeChicken.wins}W - {activeChicken.losses}L
                    </p>
                    <div className="text-xs text-center text-gray-400 italic">
                      "{activeChicken.catchphrase}"
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-col space-y-2">
              {isWinner && (
                <Button 
                  className="w-full bg-[#fbbf24] hover:bg-[#f59e0b] text-[#333333] font-bold" 
                  onClick={handleClaimClick}
                >
                  Claim Winnings
                </Button>
              )}
              
              <Button 
                className={`w-full ${isWinner ? 'bg-[#444444] hover:bg-[#555555]' : 'bg-[#ff4500] hover:bg-[#ff6347]'} text-white font-bold`} 
                onClick={onClose}
              >
                Return to Arena
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Claim Winnings Dialog */}
      <ClaimWinningsDialog
        isOpen={showClaimDialog}
        onClose={() => setShowClaimDialog(false)}
        matchId={matchId}
        winAmount={cockReward}
        playSound={playSound}
      />
    </>
  )
}
