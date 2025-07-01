"use client"

import { useState, useEffect } from "react"
import { useWallet } from "@solana/wallet-adapter-react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Avatar } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Clock, Users, Trophy, AlertCircle, Loader2 } from "lucide-react"
import { truncateAddress, getRandomColor, getRandomChickenName } from "@/lib/utils"
import { Lobby } from "@/app/api/lobbies/route"
import { Connection, clusterApiUrl } from "@solana/web3.js"
import { Transaction } from "@solana/web3.js"

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
  const { publicKey, sendTransaction } = useWallet()
  const [currentLobby, setCurrentLobby] = useState<Lobby>(lobby);
  const [isReady, setIsReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

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
          // If the lobby is starting, trigger the battle
          if (updatedLobby.status === 'starting') {
            playSound('button'); // Or a more appropriate sound
            onStartBattle();
            clearInterval(interval); // Stop polling once the match starts
          }
        }
      } catch (error) {
        console.error("Error polling for lobby status:", error);
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(interval);
  }, [lobby.id, onStartBattle, playSound]);

  // The backend now provides the full player list, so we can use it directly.
  const players = currentLobby.players;
  
  const handleReadyUp = async () => {
    if (lobby.matchType !== 'ranked' || !publicKey || !sendTransaction) return;
    
    setIsProcessing(true);
    
    try {
      // 1. Prepare the wager transaction from the backend
      const prepareResponse = await fetch('/api/wager/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lobbyId: lobby.id }),
      });

      if (!prepareResponse.ok) {
        throw new Error('Failed to prepare wager transaction');
      }

      const { transaction: serializedTransaction } = await prepareResponse.json();
      const transaction = Transaction.from(Buffer.from(serializedTransaction, 'base64'));

      // 2. Send and confirm the transaction
      const connection = new Connection(clusterApiUrl('devnet'));
      const signature = await sendTransaction(transaction, connection);
      await connection.confirmTransaction(signature, 'confirmed');

      console.log('Wager confirmed with signature:', signature);
      
      // 3. Confirm the wager with the backend
      const confirmResponse = await fetch('/api/wager/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lobbyId: lobby.id, signature }),
      });

      if (!confirmResponse.ok) {
        throw new Error('Failed to confirm wager with backend');
      }
      
      setIsReady(true);
      playSound('button');

    } catch (error) {
      console.error("Failed to ready up:", error);
      // Add user-facing error notification here
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="bg-[#333333] border-4 border-[#222222] rounded-lg p-6 max-w-4xl w-full mx-auto">
      <div className="flex flex-col md:flex-row gap-6">
        {/* Left side - Queue status */}
        <div className="flex-1">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-yellow-400 pixel-font">WAITING FOR PLAYERS...</h2>
            <Badge variant="outline" className="bg-[#444444] text-white px-3 py-1 flex items-center gap-1">
              <Users className="h-4 w-4" />
              <span>{players.length} / {currentLobby.capacity}</span>
            </Badge>
          </div>
          
          <div className="bg-[#222222] rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-white font-bold">Wager Amount</h3>
              <div className="flex items-center text-yellow-400">
                <Trophy className="h-4 w-4 mr-1" />
                <span>{currentLobby.amount} {currentLobby.currency}</span>
              </div>
            </div>
            
            <div className="max-h-60 overflow-y-auto">
              <ul className="space-y-2">
                {players.map((player, index) => (
                  <li key={player.playerId || index} className="flex items-center justify-between bg-[#1a1a1a] rounded-lg p-2">
                    <div className="flex items-center">
                      <div 
                        className="w-8 h-8 rounded-full mr-2 flex items-center justify-center bg-gray-600"
                      >
                        <span className="text-white text-sm">🐔</span>
                      </div>
                      <div>
                        <div className="flex items-center">
                          <span className="text-white text-sm mr-1">
                            {player.playerId === publicKey?.toBase58() ? "You" : truncateAddress(player.playerId)}
                          </span>
                          {/* We will add a ready status indicator here later */}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
        
        {/* Right side - Actions */}
        <div className="w-full md:w-64 flex flex-col justify-between">
          <div>
            <h3 className="text-xl font-bold text-white pixel-font mb-4">LOBBY DETAILS</h3>
            <div className="space-y-2 text-sm mb-4">
              <div className="flex justify-between">
                <span className="text-gray-400">Status:</span>
                <span className="text-green-400 font-bold flex items-center">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Waiting...
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
              <div className="bg-[#222222] p-3 rounded-lg">
                 <h4 className="text-lg font-bold text-white pixel-font mb-2">Requirements</h4>
                 <div className="flex items-center text-sm text-gray-300">
                  <AlertCircle className="h-4 w-4 mr-2 text-yellow-400" />
                  <span>4 players minimum to start.</span>
                </div>
              </div>
            )}

            {lobby.matchType === 'ranked' && (
              <div className="mt-4">
                <Button
                  onClick={handleReadyUp}
                  disabled={isReady || isProcessing}
                  className="w-full pixel-font bg-green-600 hover:bg-green-500 text-white"
                >
                  {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : (isReady ? "READY" : "READY UP")}
                </Button>
                <p className="text-xs text-gray-500 mt-2 text-center">
                  This will commit your wager of {lobby.amount} {lobby.currency}.
                </p>
              </div>
            )}
          </div>
          
          <div className="mt-4">
            <Button
              onClick={onLeaveQueue}
              variant="destructive"
              className="w-full pixel-font"
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
