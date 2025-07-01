"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { WalletMultiButton } from "@/components/wallet/wallet-multi-button"
import { useWallet } from "@solana/wallet-adapter-react"
import { Button } from "@/components/ui/button"
import { Volume2, VolumeX, Home, ArrowLeft, Swords, Flame, Users, Loader2 } from "lucide-react"
import Link from "next/link"
import EnhancedArenaScene from "./enhanced-arena-scene"
import WaitingQueue from "./waiting-queue"
import { useAudio } from "@/contexts/AudioContext"
import LoadingPixelChicken from "@/components/ui/loading-pixel-chicken"
import BattleHUD from './battle-hud';
import GameOver from './game-over';
import WinnerCelebration from './winner-celebration';
import { useGameState, GameState } from "@/contexts/GameStateContext"
import { Lobby } from "@/app/api/lobbies/route";
import { Transaction, Connection, clusterApiUrl } from "@solana/web3.js"
import { motion } from "framer-motion"
import supabase from '@/lib/supabase-client'
import { useProfile } from "@/hooks/use-profile"

export default function BattleArena() {
  const router = useRouter()
  const { connected, publicKey, sendTransaction } = useWallet()
  const { audioEnabled, volume } = useAudio()
  const [walletChecked, setWalletChecked] = useState(false)
  const [lobbies, setLobbies] = useState<Lobby[]>([]);
  const [isLoadingLobbies, setIsLoadingLobbies] = useState(true);
  const [isJoining, setIsJoining] = useState<string | null>(null);
  const [joinedLobby, setJoinedLobby] = useState<Lobby | null>(null);
  const { activeChicken } = useProfile();
  
  // Use the game state context instead of local state
  const { 
    gameState, 
    players, 
    handlePlayerDamage, 
    chickensLeft, 
    joinQueue,
    leaveQueue,
    startBattle,
    exitBattle,
    playSound,
    setGameState
  } = useGameState();
  
  // Local state for chicken selection since we removed it from the context
  const [selectedChicken, setSelectedChicken] = useState(null);
  
  // Get the player from the players array
  const playerChicken = players.find(p => p.isPlayer);
  const playerHP = playerChicken?.hp || 3;
  
  // Check if player is victorious (player is alive and all others are dead)
  const isVictorious = Boolean(playerChicken?.isAlive && players.filter(p => !p.isPlayer && p.isAlive).length === 0);

  // Check wallet connection on component mount
  useEffect(() => {
    const fetchLobbies = async () => {
      try {
        const response = await fetch('/api/lobbies');
        if (!response.ok) {
          throw new Error('Failed to fetch lobbies');
        }
        const data: Lobby[] = await response.json();
        setLobbies(data);
      } catch (error) {
        console.error(error);
      } finally {
        setIsLoadingLobbies(false);
      }
    };

    fetchLobbies();

    // Set up an interval to poll for lobby updates.
    // In a real-world app, you'd use WebSockets for this.
    const interval = setInterval(fetchLobbies, 5000); // Poll every 5 seconds

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const checkWallet = setTimeout(() => {
      setWalletChecked(true)
      if (!connected) {
        router.push("/")
      }
    }, 1000)

    return () => clearTimeout(checkWallet)
  }, [connected, router])

  // Handle drumstick collection
  const handleDrumstickCollected = (id: string) => {
    // Removed collectDrumstick function call
  };
  
  // Handle play again
  const handlePlayAgain = () => {
    // Reset game state and start a new battle
    players.forEach(player => {
      if (!player.isAlive) {
        handlePlayerDamage(player.id, -player.maxHp); // Heal to full health
      }
    });
    setGameState('battle');
    playSound('button');
  };

  // Handle selecting a chicken
  const handleSelectChicken = (chicken: any) => {
    setSelectedChicken(chicken);
    console.log("Selected chicken:", chicken);
    
    // Update player colors if needed
    if (chicken && chicken.color && playerChicken) {
      // We could update player appearance here if needed
    }
  };

  const handleJoinLobby = async (lobby: Lobby) => {
    if (!publicKey) {
      console.error("Wallet not connected");
      return;
    }
    if (!activeChicken) {
      console.error("No active chicken selected!");
      // Here you might want to show a toast notification to the user
      return;
    }

    setIsJoining(lobby.id);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      const joinResponse = await fetch('/api/lobbies', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          lobbyId: lobby.id,
          chickenId: activeChicken.id,
        }),
      });

      if (!joinResponse.ok) {
        const errorData = await joinResponse.json();
        throw new Error(errorData.error || 'Failed to join lobby');
      }

      // Proceed to the queue
      joinQueue();
      setJoinedLobby(lobby);

    } catch (error) {
      console.error("Failed to join lobby:", error);
      // Add user-facing error notification here (e.g., a toast)
    } finally {
      setIsJoining(null);
    }
  };

  if (!walletChecked) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gray-900">
        <LoadingPixelChicken size="lg" text="Connecting to Arena..." />
      </div>
    );
  }

  if (!connected && walletChecked) {
    return null;
  }

  return (
    <div className="h-screen w-screen overflow-hidden relative bg-gray-900 text-white flex flex-col" style={{
      backgroundImage: `radial-gradient(circle at top right, rgba(255, 170, 0, 0.1), transparent 30%), radial-gradient(circle at bottom left, rgba(255, 0, 0, 0.1), transparent 30%)`
    }}>
      <main className="relative z-10 flex-1 flex flex-col overflow-hidden">
        {gameState === "lobby" && (
          <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6">
            <div className="bg-black/30 backdrop-blur-md border border-white/10 rounded-xl p-6 sm:p-8 max-w-5xl w-full text-center shadow-2xl shadow-yellow-500/5">
              <h2 className="text-4xl sm:text-5xl font-bold mb-2 text-yellow-400 pixel-font">CHOOSE YOUR ARENA</h2>
              <p className="text-gray-400 mb-8 max-w-lg mx-auto">Select a lobby to wager and fight for the prize pool. Winner takes all!</p>
              
              {isLoadingLobbies ? (
                <div className="flex justify-center items-center h-64">
                  <Loader2 className="h-16 w-16 animate-spin text-yellow-400"/>
                </div>
              ) : (
                <motion.div 
                  className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
                  variants={{
                    hidden: {},
                    show: {
                      transition: {
                        staggerChildren: 0.1,
                      },
                    },
                  }}
                  initial="hidden"
                  animate="show"
                >
                  {lobbies.map((lobby) => (
                    <motion.div
                      key={lobby.id}
                      variants={{
                        hidden: { opacity: 0, y: 20 },
                        show: { opacity: 1, y: 0 },
                      }}
                      whileHover={{ scale: 1.05, y: -5 }}
                      className={`relative overflow-hidden bg-gray-800/50 border rounded-lg flex flex-col justify-between transition-all duration-300 group
                        ${lobby.highRoller 
                          ? 'border-red-500/50 hover:border-red-500' 
                          : 'border-gray-700/50 hover:border-yellow-500'}`
                      }
                    >
                      <div className={`absolute top-0 left-0 w-full h-full bg-gradient-to-br from-transparent to-black/40 opacity-0 group-hover:opacity-100 transition-opacity`}></div>
                      {lobby.highRoller && <div className="absolute inset-0 bg-red-500/10 animate-pulse-slow"></div>}
                      <div className={`absolute -top-12 -right-12 text-6xl opacity-5 group-hover:opacity-10 transition-opacity duration-300 ${lobby.highRoller ? 'text-red-400' : 'text-yellow-400'}`}>
                        {lobby.highRoller ? <Flame /> : <Swords />}
                      </div>
                      
                      <div className="p-5 sm:p-6 z-10 flex flex-col flex-grow">
                        <div className="mb-4 flex-grow">
                          <p className={`text-sm uppercase tracking-widest ${lobby.highRoller ? 'text-red-400' : 'text-yellow-400'}`}>
                            {lobby.highRoller ? 'High-Roller' : 'Wager'}
                          </p>
                          <h3 className="text-3xl font-bold pixel-font text-white">
                            {lobby.amount} <span className="text-2xl opacity-80">{lobby.currency}</span>
                          </h3>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2 text-gray-400">
                            <Users className="h-4 w-4" />
                            <span>{lobby.players.length} / {lobby.capacity}</span>
                          </div>
                        </div>
                      </div>

                      <div className="p-3 bg-black/20 z-10">
                        <Button 
                          className={`w-full font-bold text-lg pixel-font transition-all ${
                            lobby.players.length >= lobby.capacity ? 'bg-gray-600 cursor-not-allowed' :
                            lobby.highRoller 
                              ? 'bg-red-600 hover:bg-red-500 text-white' 
                              : 'bg-yellow-500 hover:bg-yellow-400 text-black'
                          }`}
                          onClick={() => handleJoinLobby(lobby)}
                          disabled={isJoining === lobby.id || lobby.players.length >= lobby.capacity}
                        >
                          {isJoining === lobby.id ? (
                            <Loader2 className="h-6 w-6 animate-spin" />
                          ) : (
                            lobby.players.length >= lobby.capacity ? 'Lobby Full' : 'Join Match'
                          )}
                        </Button>
                      </div>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </div>
          </div>
        )}

        {gameState === "queue" && joinedLobby && (
          <div className="flex-1 flex flex-col items-center justify-center p-6">
            <WaitingQueue
              lobby={joinedLobby}
              onLeaveQueue={leaveQueue}
              onStartBattle={startBattle}
              playSound={playSound}
            />
          </div>
        )}

        {gameState === "battle" && (
          <div className="flex-1 relative overflow-hidden">
            <BattleHUD 
              playerHP={playerHP} 
              chickensLeft={chickensLeft} 
              players={players}
            />

            {/* Add other UI elements here as needed */}
            <EnhancedArenaScene 
              gameState={gameState}
              playerChicken={playerChicken}
              onExit={exitBattle}
              onPlayerDamage={handlePlayerDamage}
              onDrumstickCollected={handleDrumstickCollected}
              playSound={playSound}
              players={players}
            />
          </div>
        )}
        
        {gameState === "gameOver" && (
          <div className="flex-1 relative">
            {/* Keep showing the arena in the background */}
            <EnhancedArenaScene 
              gameState={gameState}
              playerChicken={playerChicken}
              onExit={exitBattle}
              onPlayerDamage={handlePlayerDamage}
              onDrumstickCollected={handleDrumstickCollected}
              playSound={playSound}
              players={players}
            />
            
            {/* Show game over screen */}
            <GameOver 
              winner={players.find(p => p.isAlive) || null}
              humanPlayer={playerChicken || null}
              onExit={exitBattle} 
            />
          </div>
        )}
        
        {gameState === "winner" && (
          <div className="flex-1 relative">
            {/* Keep showing the arena in the background */}
            <EnhancedArenaScene 
              gameState={gameState}
              playerChicken={playerChicken}
              onExit={exitBattle}
              onPlayerDamage={handlePlayerDamage}
              onDrumstickCollected={handleDrumstickCollected}
              playSound={playSound}
              players={players}
            />
            
            {/* Show winner celebration screen */}
            <WinnerCelebration />
          </div>
        )}
      </main>

      {gameState !== "battle" && gameState !== "gameOver" && gameState !== "winner" && (
        <footer className="relative z-10 p-2 bg-black/20 border-t border-white/10 text-white text-center text-xs">
          <p> {new Date().getFullYear()} Cock Combat • Powered by Solana</p>
        </footer>
      )}
    </div>
  )
}
