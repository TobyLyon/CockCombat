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
import LobbyRoom from "./lobby-room"
import { useAudio } from "@/contexts/AudioContext"
import LoadingPixelChicken from "@/components/ui/loading-pixel-chicken"
import BattleHUD from './battle-hud';
import GameOver from './game-over';
import WinnerCelebration from './winner-celebration';
import { useGameState, GameState } from "@/contexts/GameStateContext"
import { Lobby } from "@/app/api/lobbies/route";
import { Transaction, Connection, clusterApiUrl } from "@solana/web3.js"
import { motion } from "framer-motion"

export default function BattleArena() {
  const router = useRouter()
  const { connected, publicKey, sendTransaction } = useWallet()
  const { audioEnabled, volume } = useAudio()
  const [walletChecked, setWalletChecked] = useState(false)
  const [lobbies, setLobbies] = useState<Lobby[]>([]);
  const [isLoadingLobbies, setIsLoadingLobbies] = useState(true);
  const [isJoining, setIsJoining] = useState<string | null>(null);
  const [joinedLobby, setJoinedLobby] = useState<Lobby | null>(null);
  const [inLobbyRoom, setInLobbyRoom] = useState(false);
  
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
      setIsLoadingLobbies(true);
      try {
        const response = await fetch('/api/lobbies');
        if (response.ok) {
          const data = await response.json();
          setLobbies(data);
        }
                    } catch (error: unknown) {
        console.error('Failed to fetch lobbies:', error instanceof Error ? error.message : 'Unknown error');
      } finally {
        setIsLoadingLobbies(false);
      }
    };

    fetchLobbies();

    // Reduce polling frequency to prevent constant reloads
    // Only poll if not in lobby room to avoid interference
    const interval = setInterval(() => {
      if (!inLobbyRoom) {
        fetchLobbies();
      }
    }, 10000); // Poll every 10 seconds instead of 5, and only when not in lobby room

    return () => clearInterval(interval);
  }, [inLobbyRoom]); // Add inLobbyRoom dependency

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

    console.log('🎯 Joining lobby:', lobby);
    setIsJoining(lobby.id);

    try {
      // Generate random chicken for player
      const randomChickens = ['warrior', 'ninja', 'berserker', 'mage', 'tank', 'assassin', 'paladin', 'archer'];
      const randomChicken = randomChickens[Math.floor(Math.random() * randomChickens.length)];
      console.log('🐔 Assigned random chicken:', randomChicken);

      // Join the lobby (no wager transaction needed yet)
      const joinResponse = await fetch('/api/lobbies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lobbyId: lobby.id,
          playerId: publicKey.toBase58(),
          chickenId: randomChicken,
        }),
      });

      if (!joinResponse.ok) {
        const errorData = await joinResponse.json();
        
        // If player is already in lobby, just show the lobby room
        if (errorData.error === 'Player already in lobby') {
          console.log('✅ Player already in lobby, showing lobby room');
          setJoinedLobby(lobby);
          setInLobbyRoom(true);
          return;
        }
        
        throw new Error(errorData.error || 'Failed to join lobby');
      }

      const joinResult = await joinResponse.json();
      console.log('✅ Successfully joined lobby:', joinResult);

      // Go to lobby room for ready-up phase (wager will be handled there)
      console.log('🏠 Going to lobby room...');
      setJoinedLobby(lobby);
      setInLobbyRoom(true);

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error("❌ Failed to join lobby:", errorMessage);
      // Add user-facing error notification here (e.g., a toast)
      alert(`Failed to join lobby: ${errorMessage}`);
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
    <div className="h-screen w-screen relative bg-gray-900 text-white flex flex-col overflow-hidden" style={{
      backgroundImage: `radial-gradient(circle at top right, rgba(255, 170, 0, 0.1), transparent 30%), radial-gradient(circle at bottom left, rgba(255, 0, 0, 0.1), transparent 30%)`
    }}>
      <main className="relative z-10 flex-1 flex flex-col max-w-full max-h-full overflow-hidden">

        {gameState === "lobby" && (
          <div className="flex-1 flex h-full max-h-full gap-4 overflow-hidden">
            {/* Main Lobby Selection - Left Side (Priority) */}
            <div className={`transition-all duration-300 ${inLobbyRoom ? 'w-2/3' : 'w-full'} flex flex-col min-w-0 overflow-hidden`}>
              <div className="p-4 border-b border-gray-700/50 flex-shrink-0">
                <h1 className="text-3xl lg:text-4xl font-bold text-yellow-400 pixel-font mb-2">BATTLE ARENAS</h1>
                <p className="text-gray-400 text-sm lg:text-base">Select your arena and dominate the competition</p>
              </div>
              
              <div className="flex-1 p-4 overflow-y-auto">
                {isLoadingLobbies ? (
                  <div className="flex justify-center items-center h-64">
                    <div className="flex flex-col items-center gap-4">
                      <Loader2 className="h-16 w-16 animate-spin text-yellow-400"/>
                      <p className="text-gray-400 pixel-font">Loading Arenas...</p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3 lg:gap-4 max-w-full">
                    {lobbies.map((lobby) => (
                      <motion.div
                        key={lobby.id}
                        whileHover={{ scale: 1.02, y: -2 }}
                        className={`relative overflow-hidden bg-gradient-to-br from-gray-800/90 to-gray-900/90 border-2 rounded-xl p-4 lg:p-6 cursor-pointer transition-all duration-300 group backdrop-blur-sm min-w-0
                          ${lobby.highRoller 
                            ? 'border-red-500/50 hover:border-red-400 hover:shadow-red-500/20' 
                            : 'border-gray-600/50 hover:border-yellow-400 hover:shadow-yellow-500/20'} 
                          ${joinedLobby?.id === lobby.id ? 'ring-2 ring-yellow-400 border-yellow-400' : ''}
                          hover:shadow-xl`}
                        onClick={() => !isJoining && handleJoinLobby(lobby)}
                      >
                        {/* Glow Effect */}
                        <div className={`absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-10 transition-opacity duration-300 ${
                          lobby.highRoller ? 'from-red-500 to-red-600' : 'from-yellow-400 to-yellow-500'
                        }`}></div>
                        
                        {/* High Roller Badge */}
                        {lobby.highRoller && (
                          <div className="absolute top-3 right-3 bg-red-600 text-white px-2 py-1 rounded-full text-xs font-bold flex items-center gap-1">
                            <Flame className="h-3 w-3" />
                            VIP
                          </div>
                        )}
                        
                        {/* Coming Soon Overlay */}
                        {lobby.isComingSoon && (
                          <div className="absolute inset-0 bg-gray-900/80 backdrop-blur-sm flex items-center justify-center rounded-xl">
                            <span className="text-yellow-400 font-bold text-sm lg:text-lg pixel-font">COMING SOON</span>
                          </div>
                        )}
                        
                        <div className="relative z-10">
                          {/* Entry Amount */}
                          <div className="mb-3 lg:mb-4">
                            <div className={`text-2xl lg:text-3xl font-bold pixel-font ${lobby.highRoller ? 'text-red-400' : 'text-yellow-400'}`}>
                              {lobby.amount === 0 ? 'FREE' : `${lobby.amount} ${lobby.currency}`}
                            </div>
                            <div className="text-xs lg:text-sm text-gray-400 uppercase tracking-wide">
                              {lobby.amount === 0 ? 'Tutorial Match' : 'Entry Fee'}
                            </div>
                          </div>
                          
                          {/* Players Count */}
                          <div className="flex items-center justify-between mb-3 lg:mb-4">
                            <div className="flex items-center gap-2 text-gray-300">
                              <Users className="h-4 w-4" />
                              <span className="font-semibold text-sm lg:text-base">
                                {Array.isArray(lobby.players) ? lobby.players.length : lobby.players} / {lobby.capacity}
                              </span>
                            </div>
                            
                            {/* Status Indicator */}
                            <div className={`px-2 py-1 rounded-full text-xs font-bold ${
                              (Array.isArray(lobby.players) ? lobby.players.length : lobby.players) >= lobby.capacity
                                ? 'bg-red-600/20 text-red-400 border border-red-600/30'
                                : (Array.isArray(lobby.players) ? lobby.players.length : lobby.players) > 0
                                ? 'bg-yellow-600/20 text-yellow-400 border border-yellow-600/30'
                                : 'bg-green-600/20 text-green-400 border border-green-600/30'
                            }`}>
                              {(Array.isArray(lobby.players) ? lobby.players.length : lobby.players) >= lobby.capacity 
                                ? 'FULL' 
                                : (Array.isArray(lobby.players) ? lobby.players.length : lobby.players) > 0 
                                ? 'ACTIVE' 
                                : 'OPEN'}
                            </div>
                          </div>
                          
                          {/* Action Button */}
                          <Button
                            className={`w-full font-bold py-2 px-3 lg:px-4 rounded-lg transition-all duration-300 border-2 text-sm lg:text-base ${
                              lobby.isComingSoon
                                ? 'bg-gray-600 border-gray-700 text-gray-400 cursor-not-allowed'
                                : isJoining === lobby.id
                                ? 'bg-blue-600 border-blue-700 text-white'
                                : joinedLobby?.id === lobby.id
                                ? 'bg-yellow-600 border-yellow-700 text-black'
                                : lobby.highRoller 
                                ? 'bg-red-600/80 hover:bg-red-500 border-red-700 text-white hover:border-red-500' 
                                : 'bg-yellow-500/80 hover:bg-yellow-400 border-yellow-600 text-black hover:border-yellow-400'
                            }`}
                            disabled={isJoining === lobby.id || (Array.isArray(lobby.players) ? lobby.players.length : lobby.players) >= lobby.capacity || lobby.isComingSoon}
                          >
                            {lobby.isComingSoon 
                              ? 'COMING SOON'
                              : isJoining === lobby.id 
                                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Joining...</>
                                : joinedLobby?.id === lobby.id
                                ? '✓ JOINED'
                                : ((Array.isArray(lobby.players) ? lobby.players.length : lobby.players) >= lobby.capacity ? 'LOBBY FULL' : 'JOIN ARENA')
                            }
                          </Button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Lobby Room Details - Right Side (Compact) */}
            {inLobbyRoom && joinedLobby && (
              <div className="w-1/3 min-w-80 border-l border-gray-700/50 bg-gray-900/50 backdrop-blur-sm flex flex-col overflow-hidden">
                <div className="p-4 border-b border-gray-700/50 flex-shrink-0">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-lg lg:text-xl font-bold text-yellow-400 pixel-font">LOBBY ROOM</h2>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        setInLobbyRoom(false);
                        setJoinedLobby(null);
                      }}
                      className="bg-red-600/20 border-red-600 text-red-400 hover:bg-red-600/30"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-sm text-gray-400">
                    {joinedLobby.amount === 0 ? 'Free Practice' : `${joinedLobby.amount} ${joinedLobby.currency} Wager`}
                  </p>
                </div>
                
                <div className="flex-1 overflow-hidden">
                  <LobbyRoom
                    lobby={joinedLobby}
                    onLeaveLobby={() => {
                      setInLobbyRoom(false);
                      setJoinedLobby(null);
                    }}
                    onStartMatch={() => {
                      setInLobbyRoom(false);
                      joinQueue();
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {gameState === "queue" && joinedLobby && !inLobbyRoom && (
          <div className="flex-1 flex flex-col items-center justify-center p-4 lg:p-6 max-w-full max-h-full overflow-hidden">
            <WaitingQueue
              lobby={joinedLobby}
              onLeaveQueue={leaveQueue}
              onStartBattle={startBattle}
              playSound={playSound}
            />
          </div>
        )}

        {gameState === "battle" && (
          <div className="flex-1 w-full h-full relative overflow-hidden">
            <BattleHUD 
              playerHP={playerHP} 
              chickensLeft={chickensLeft} 
              players={players}
            />

            <div className="absolute inset-0 w-full h-full">
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
          </div>
        )}
        
        {gameState === "gameOver" && (
          <div className="flex-1 w-full h-full relative overflow-hidden">
            <div className="absolute inset-0 w-full h-full">
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
            
            {/* Show game over screen */}
            <GameOver 
              winner={isVictorious ? (playerChicken || null) : null}
              humanPlayer={playerChicken || null}
              onExit={exitBattle}
            />
          </div>
        )}
        
        {gameState === "winner" && (
          <div className="flex-1 w-full h-full relative overflow-hidden">
            <div className="absolute inset-0 w-full h-full">
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
            
            {/* Show winner celebration screen */}
            <WinnerCelebration />
          </div>
        )}
      </main>

      {gameState !== "battle" && gameState !== "gameOver" && gameState !== "winner" && (
        <footer className="relative z-10 p-2 bg-black/20 border-t border-white/10 text-white text-center text-xs flex-shrink-0">
          <p> {new Date().getFullYear()} Cock Combat • Powered by Solana</p>
        </footer>
      )}
    </div>
  )
}
