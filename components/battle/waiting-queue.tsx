"use client"

import { useState, useEffect } from "react"
import { useWallet } from "@solana/wallet-adapter-react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Avatar } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Clock, Users, Trophy, AlertCircle, Loader2, Check } from "lucide-react"
import { truncateAddress, getRandomColor, getRandomChickenName } from "@/lib/utils"
import { Lobby } from "@/app/api/lobbies/route"

interface WaitingQueueProps {
  lobby: Lobby;
  onLeaveQueue: () => void;
  onStartBattle: () => void;
  playSound: (sound: string) => void;
}

// Keeping the Player type for displaying player info
interface Player {
  id: string; // Using wallet address or a unique ID
}

export default function WaitingQueue({
  lobby,
  onLeaveQueue,
  onStartBattle,
  playSound,
}: WaitingQueueProps) {
  const { publicKey } = useWallet()
  const [currentLobby, setCurrentLobby] = useState<Lobby>(lobby);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [allPlayersReady, setAllPlayersReady] = useState(false);

  useEffect(() => {
    // Poll the specific lobby for status updates
    const interval = setInterval(async () => {
      try {
        const response = await fetch('/api/lobbies');
        if (!response.ok) throw new Error('Failed to fetch lobbies');
        
        const lobbies: Lobby[] = await response.json();
        const updatedLobby = lobbies.find(l => l.id === lobby.id);

        if (updatedLobby) {
          setCurrentLobby(updatedLobby);
          
          // Check if all players are ready (minimum requirements met)
          const minPlayersRequired = lobby.matchType === 'tutorial' ? 2 : 4;
          const hasEnoughPlayers = updatedLobby.players.length >= minPlayersRequired;
          const allReady = hasEnoughPlayers && updatedLobby.players.every((p: any) => p.isReady);
          setAllPlayersReady(allReady);
          
          // If the lobby is starting, trigger the battle
          if (updatedLobby.status === 'starting') {
            playSound('button'); // Or a more appropriate sound
            onStartBattle();
            clearInterval(interval); // Stop polling once the match starts
          }
          
          // Handle countdown from server
          if (updatedLobby.countdown && updatedLobby.countdown > 0) {
            setCountdown(updatedLobby.countdown);
          }
        }
      } catch (error) {
        console.error("Error polling for lobby status:", error);
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(interval);
  }, [lobby.id, lobby.matchType, onStartBattle, playSound]);

  // Countdown effect
  useEffect(() => {
    if (countdown !== null && countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(countdown - 1)
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [countdown])

  // The backend now provides the full player list, so we can use it directly.
  const players = currentLobby.players;
  
  return (
    <div className="bg-[#333333] border-4 border-[#222222] rounded-lg p-4 lg:p-6 max-w-6xl w-full mx-auto max-h-full overflow-hidden relative">
      
      {/* Countdown Overlay */}
      <AnimatePresence>
        {countdown !== null && countdown > 0 && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            className="absolute inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50 rounded-lg"
          >
            <div className="text-center">
              <motion.div
                key={countdown}
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 1.2, opacity: 0 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="text-6xl sm:text-8xl font-bold text-yellow-400 pixel-font mb-4 drop-shadow-lg"
                style={{ 
                  textShadow: '4px 4px 0px rgba(0,0,0,0.8), 8px 8px 0px rgba(255,170,0,0.3)' 
                }}
              >
                {countdown}
              </motion.div>
              <motion.p 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-xl sm:text-2xl text-gray-300 pixel-font mb-4"
              >
                BATTLE STARTING...
              </motion.p>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="flex items-center justify-center gap-2 text-lg text-yellow-400"
              >
                <Clock className="h-5 w-5 animate-pulse" />
                <span>Get ready to fight!</span>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ready Status Banner */}
      <AnimatePresence>
        {allPlayersReady && countdown === null && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="absolute top-0 left-0 right-0 bg-green-600/90 backdrop-blur-sm p-3 z-40 rounded-t-lg"
          >
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 text-white">
                <Check className="h-5 w-5" />
                <span className="text-base font-bold pixel-font">ALL PLAYERS READY!</span>
              </div>
              <p className="text-sm text-green-100 mt-1">Starting soon...</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 h-full">
        {/* Left side - Queue status */}
        <div className="flex-1 min-h-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2">
            <h2 className="text-xl lg:text-2xl font-bold text-yellow-400 pixel-font">
              {allPlayersReady ? "ALL READY!" : "WAITING FOR PLAYERS..."}
            </h2>
            <Badge variant="outline" className="bg-[#444444] text-white px-3 py-1 flex items-center gap-1 w-fit">
              <Users className="h-4 w-4" />
              <span>{players.length} / {currentLobby.capacity}</span>
            </Badge>
          </div>
          
          <div className="bg-[#222222] rounded-lg p-3 lg:p-4 mb-4 flex-1 min-h-0">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-bold text-sm lg:text-base">Wager Amount</h3>
              <div className="flex items-center text-yellow-400">
                <Trophy className="h-4 w-4 mr-1" />
                <span className="text-sm lg:text-base">{currentLobby.amount} {currentLobby.currency}</span>
              </div>
            </div>
            
            <div className="max-h-48 lg:max-h-60 overflow-y-auto">
              <ul className="space-y-2">
                {players.map((player, index) => (
                  <motion.li 
                    key={player.playerId || index} 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={`flex items-center justify-between rounded-lg p-2 lg:p-3 transition-colors ${
                      player.isReady 
                        ? 'bg-green-900/30 border border-green-600/50' 
                        : 'bg-[#1a1a1a]'
                    }`}
                  >
                    <div className="flex items-center min-w-0">
                      <div className="w-6 h-6 lg:w-8 lg:h-8 rounded-full mr-2 flex items-center justify-center bg-gray-600 flex-shrink-0">
                        <span className="text-white text-xs lg:text-sm">🐔</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center">
                          <span className="text-white text-xs lg:text-sm mr-1 truncate">
                            {player.username || (player.playerId === publicKey?.toBase58() ? "You" : truncateAddress(player.playerId))}
                          </span>
                          {player.isAi && (
                            <Badge variant="secondary" className="text-xs bg-blue-600/20 text-blue-400 border-blue-600/30 ml-1">
                              AI
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      {player.isReady ? (
                        <Badge className="bg-green-600 text-white text-xs px-2 py-1">
                          <Check className="mr-1 h-3 w-3" />
                          Ready
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-gray-500 text-gray-400 text-xs px-2 py-1">
                          <Clock className="mr-1 h-3 w-3" />
                          Wait
                        </Badge>
                      )}
                    </div>
                  </motion.li>
                ))}
              </ul>
            </div>
          </div>
        </div>
        
        {/* Right side - Actions */}
        <div className="w-full lg:w-64 xl:w-72 flex flex-col justify-between min-h-0">
          <div className="flex-1">
            <h3 className="text-lg lg:text-xl font-bold text-white pixel-font mb-3 lg:mb-4">LOBBY DETAILS</h3>
            <div className="space-y-2 text-xs lg:text-sm mb-4">
              <div className="flex justify-between">
                <span className="text-gray-400">Status:</span>
                <span className={`font-bold flex items-center ${allPlayersReady ? 'text-green-400' : 'text-yellow-400'}`}>
                  {allPlayersReady ? (
                    <>
                      <Check className="mr-2 h-3 w-3 lg:h-4 lg:w-4" />
                      Ready!
                    </>
                  ) : (
                    <>
                      <Loader2 className="mr-2 h-3 w-3 lg:h-4 lg:w-4 animate-spin" />
                      Waiting...
                    </>
                  )}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Prize Pool:</span>
                <span className="text-yellow-400 font-bold">
                  {(players.length * currentLobby.amount).toFixed(2)} {currentLobby.currency}
                </span>
              </div>
            </div>

            {lobby.matchType !== 'tutorial' && (
              <div className="bg-[#222222] p-3 rounded-lg mb-4">
                 <h4 className="text-sm lg:text-lg font-bold text-white pixel-font mb-2">Requirements</h4>
                 <div className="flex items-center text-xs lg:text-sm text-gray-300">
                  <AlertCircle className="h-3 w-3 lg:h-4 lg:w-4 mr-2 text-yellow-400 flex-shrink-0" />
                  <span>4 players minimum to start.</span>
                </div>
              </div>
            )}
          </div>
          
          <div className="mt-4">
            <Button
              onClick={onLeaveQueue}
              variant="destructive"
              className="w-full pixel-font text-sm lg:text-base"
            >
              LEAVE LOBBY
            </Button>
            <p className="text-xs text-gray-500 mt-2 text-center">
              You will need to re-wager if you leave.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
