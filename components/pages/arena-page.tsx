"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { WalletMultiButton } from "@/components/wallet/wallet-multi-button"
import { useWallet } from "@/hooks/use-wallet"
import ArenaViewer from "@/components/3d/arena-viewer"
import SpectatorView from "@/components/spectator/spectator-view"
import { Button } from "@/components/ui/button"
import { Volume2, VolumeX, Info, Home, DollarSign } from "lucide-react"
import Link from "next/link"
import { useAudio } from "@/contexts/AudioContext"
import { TokenDisplay } from "@/components/wallet/token-display"
import { useToken } from "@/hooks/use-token"
import BetDialog from "@/components/battle/bet-dialog"
import { PlayerStatus } from "@/contexts/GameStateContext"

// Add these imports at the top of the file
import MatchmakingModal from "@/components/multiplayer/matchmaking-modal"
import MultiplayerArena from "@/components/multiplayer/multiplayer-arena"
import BattleResultsModal from "@/components/multiplayer/battle-results-modal"

// Arena Info Tooltip component
function ArenaInfoTooltip({ isVisible, onClose }: ArenaInfoTooltipProps) {
  if (!isVisible) return null

  return (
    <div className="absolute z-30 top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-[#333333] border-4 border-[#222222] rounded-lg p-6 max-w-md text-white">
      <button className="absolute top-2 right-2 text-gray-400 hover:text-white" onClick={onClose}>
        ✕
      </button>

      <h3 className="text-xl font-bold mb-4 text-yellow-400 pixel-font">ARENA ELEMENTS</h3>

      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-6 h-6 bg-red-500 flex-shrink-0 mt-1"></div>
          <div>
            <p className="font-bold">Health Potions</p>
            <p className="text-sm text-gray-300">Restores 25% of your chicken's health.</p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="w-6 h-6 bg-yellow-500 flex-shrink-0 mt-1"></div>
          <div>
            <p className="font-bold">Power-ups</p>
            <p className="text-sm text-gray-300">Increases attack damage by 50% for 10 seconds.</p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="w-6 h-6 bg-green-500 flex-shrink-0 mt-1"></div>
          <div>
            <p className="font-bold">Speed Boosts</p>
            <p className="text-sm text-gray-300">Increases movement speed by 50% for 10 seconds.</p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="w-6 h-6 bg-blue-500 flex-shrink-0 mt-1"></div>
          <div>
            <p className="font-bold">Shields</p>
            <p className="text-sm text-gray-300">Absorbs the next 2 hits you take.</p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="w-6 h-6 bg-purple-500 flex-shrink-0 mt-1"></div>
          <div>
            <p className="font-bold">Damage Boost</p>
            <p className="text-sm text-gray-300">Your next attack deals double damage.</p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="w-6 h-6 bg-gray-500 flex-shrink-0 mt-1"></div>
          <div>
            <p className="font-bold">Hazards</p>
            <p className="text-sm text-gray-300">Spikes, fire pits, and water puddles damage your chicken.</p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="w-6 h-6 bg-amber-800 flex-shrink-0 mt-1"></div>
          <div>
            <p className="font-bold">Crates</p>
            <p className="text-sm text-gray-300">Break them to find random items.</p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="w-6 h-6 bg-purple-800 flex-shrink-0 mt-1"></div>
          <div>
            <p className="font-bold">Teleporters</p>
            <p className="text-sm text-gray-300">Instantly move to another teleporter on the map.</p>
          </div>
        </div>
      </div>

      <Button className="mt-6 w-full bg-yellow-500 hover:bg-yellow-600 text-black font-bold" onClick={onClose}>
        Got it!
      </Button>
    </div>
  )
}

// Add type definitions for props and game state
interface ArenaPageProps {}

interface Player {
  id: string;
  name: string;
  health: number;
  energy: number;
  position?: { x: number; y: number; z: number };
  rotation?: { y: number };
  status?: string;
}

interface GameState {
  player1: Player;
  player2: Player;
  battleStatus: string;
  arena?: {
    weather?: string;
    items?: any[]; // Define item type if known
    hazards?: any[]; // Define hazard type if known
  };
  roundTime?: number;
}

interface Opponent {
  id: string;
  name: string;
}

interface BattleResult {
  isWinner: boolean;
  byDisconnect?: boolean;
}

// Define types for tooltip props
interface ArenaInfoTooltipProps {
  isVisible: boolean;
  onClose: () => void;
}

// Add this interface for the ArenaState expected by MultiplayerArena
interface ArenaState {
  arena?: {
    items?: any[];
    hazards?: any[];
  };
  roundTime?: number;
  battleStatus?: string;
  player1?: PlayerStatus;
  player2?: PlayerStatus;
}

// Add this function to convert our GameState to ArenaState
function convertToArenaState(gameState: GameState): ArenaState {
  // Convert position object to Vector3 or array format if needed
  const getPosition = (pos: any): [number, number, number] => {
    if (!pos) return [0, 0.7, 0];
    if (Array.isArray(pos)) {
      // Ensure it's a tuple with exactly 3 elements
      const [x = 0, y = 0.7, z = 0] = pos;
      return [x, y, z];
    }
    return [pos.x || 0, pos.y || 0.7, pos.z || 0];
  };

  return {
    arena: gameState.arena,
    roundTime: gameState.roundTime,
    battleStatus: gameState.battleStatus,
    player1: {
      id: gameState.player1.id,
      name: gameState.player1.name,
      isPlayer: true,
      position: getPosition(gameState.player1.position),
      rotation: gameState.player1.rotation?.y !== undefined ? [0, gameState.player1.rotation.y, 0] : [0, 0, 0],
      hp: gameState.player1.health,
      maxHp: 100,
      isAlive: gameState.player1.health > 0,
      visible: true
    },
    player2: {
      id: gameState.player2.id,
      name: gameState.player2.name,
      isPlayer: false,
      position: getPosition(gameState.player2.position),
      rotation: gameState.player2.rotation?.y !== undefined ? [0, gameState.player2.rotation.y, 0] : [0, 0, 0],
      hp: gameState.player2.health,
      maxHp: 100,
      isAlive: gameState.player2.health > 0,
      visible: true
    }
  };
}

export default function ArenaPage(props: ArenaPageProps) {
  const router = useRouter()
  const { connected } = useWallet()
  const { refreshBalance } = useToken()
  const [showArenaInfo, setShowArenaInfo] = useState(false)
  const [showBetDialog, setShowBetDialog] = useState(false)
  // Correctly type the audioRef
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isSpectateMode, setIsSpectateMode] = useState(false)
  
  // Use AudioContext
  const { audioEnabled, setAudioEnabled, playSound, playBackgroundMusic, volume } = useAudio()

  // Add these state variables inside the ArenaPage component
  const [showMatchmaking, setShowMatchmaking] = useState(false)
  const [inMultiplayerBattle, setInMultiplayerBattle] = useState(false)
  const [multiplayerGameState, setMultiplayerGameState] = useState<GameState | null>(null)
  const [multiplayerOpponent, setMultiplayerOpponent] = useState<Opponent | null>(null)
  const [isPlayer1, setIsPlayer1] = useState(false)
  const [showBattleResults, setShowBattleResults] = useState(false)
  const [battleResult, setBattleResult] = useState<BattleResult | null>(null)
  const [selectedChicken, setSelectedChicken] = useState({
    name: "Feather Fury",
    level: 5,
    stats: { strength: 8, speed: 7, defense: 6 },
    color: "#f97316",
  })
  // Add state for active live matches
  const [liveMatches, setLiveMatches] = useState([
    { id: "match-1", player1: "CockyWarrior", player2: "FeatherFury", inProgress: true },
    { id: "match-2", player1: "CluckNorris", player2: "WingCommander", inProgress: true },
    { id: "match-3", player1: "BeakTyson", player2: "HenSolo", inProgress: true }
  ])
  // Add state for current spectating match
  const [currentSpectatingMatch, setCurrentSpectatingMatch] = useState("match-1")

  // Check URL parameters for spectate mode
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const spectateParam = urlParams.get("spectate")
    console.log("Spectate URL param:", spectateParam)
    
    if (spectateParam === "true") {
      console.log("Setting spectate mode from URL")
      setIsSpectateMode(true)
    }
  }, [])

  // Redirect if not connected
  useEffect(() => {
    if (!connected && !isSpectateMode) {
      // Small delay to avoid immediate redirect
      const timer = setTimeout(() => {
        router.push("/")
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [connected, router, isSpectateMode])

  // Setup background music when component mounts or audioEnabled changes
  useEffect(() => {
    // Check if audioRef.current is not null before calling
    if (audioRef.current && audioEnabled) {
      playBackgroundMusic('/sounds/background.mp3', audioRef as React.RefObject<HTMLAudioElement>)
    } else if (audioRef.current && !audioEnabled) {
      // Explicitly pause if audio gets disabled
      audioRef.current.pause()
    }
  }, [audioEnabled, playBackgroundMusic]) 

  // Handle audio toggle using AudioContext
  const toggleAudio = () => {
    const currentlyEnabled = audioEnabled;
    setAudioEnabled(!currentlyEnabled);
    // No need to manually play/pause here, the useEffect hooks will handle it
  }

  // Add these handler functions inside the ArenaPage component
  const handleStartMultiplayer = () => {
    playSound("click")
    setShowMatchmaking(true)
  }

  // Add types to parameters
  const handleMatchFound = (gameState: GameState, opponent: Opponent) => {
    setMultiplayerGameState(gameState)
    setMultiplayerOpponent(opponent)
    // Assuming player1 always has a fixed mock ID for now
    setIsPlayer1(gameState.player1.id === "mockSocketId") 
    setInMultiplayerBattle(true)
    setShowMatchmaking(false)
  }

  const handleExitMultiplayerBattle = () => {
    playSound("click")
    // Show battle results if available
    if (multiplayerGameState?.battleStatus === "ended") {
      setBattleResult({
        isWinner: isPlayer1 ? multiplayerGameState.player1.health > 0 : multiplayerGameState.player2.health > 0,
      })
      setShowBattleResults(true)
    }
    setInMultiplayerBattle(false)
  }

  // Add handler for placing bets
  const handlePlaceBet = (amount: number) => {
    // This will be called when a bet is successfully placed
    console.log(`Bet placed: ${amount} $COCK`);
    playSound("success");
    
    // We'll update this later with server-side validation
    // For now, let's refresh the balance
    setTimeout(() => {
      refreshBalance();
    }, 2000);
  }

  // Handle direct spectate navigation
  const handleSpectate = () => {
    playSound("click")
    console.log("Spectate button clicked, setting spectate mode")
    
    // Force spectate mode on
    setIsSpectateMode(true)
    
    // Also update URL but don't rely on it for state changes
    window.history.pushState({}, '', '/arena?spectate=true')
  }

  return (
    <div className="h-screen w-screen overflow-hidden relative bg-[#3a8c4f] flex flex-col">
      {/* Background audio - persisted across component state changes */}
      <audio ref={audioRef} loop>
        <source src="/sounds/background.mp3" type="audio/mpeg" />
      </audio>

      {/* Pixel art background - different from landing page */}
      <div className="absolute inset-0 z-0">
        {/* Dark sky for arena */}
        <div className="absolute inset-0 bg-[#2c3e50] h-1/2"></div>

        {/* Sandy ground */}
        <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-[#D2B48C]"></div>

        {/* Stars */}
        {Array.from({ length: 50 }).map((_, i) => (
          <div
            key={i}
            className="absolute bg-white rounded-full"
            style={{
              top: `${Math.random() * 30}%`,
              left: `${Math.random() * 100}%`,
              width: `${Math.random() * 2 + 1}px`,
              height: `${Math.random() * 2 + 1}px`,
              opacity: Math.random() * 0.7 + 0.3,
              animation: `pulse ${Math.random() * 3 + 2}s infinite ease-in-out`,
            }}
          ></div>
        ))}

        {/* Arena circle - larger and more prominent */}
        <div className="absolute bottom-[10%] left-1/2 transform -translate-x-1/2 w-[90vw] h-[40vh] bg-[#8B4513] rounded-full"></div>
        <div className="absolute bottom-[11%] left-1/2 transform -translate-x-1/2 w-[85vw] h-[38vh] bg-[#D2B48C] rounded-full"></div>
      </div>

      {/* Game header */}
      <header className="relative z-10 flex justify-between items-center p-4 bg-[#333333] border-b-4 border-[#222222] text-white">
        <div className="flex items-center gap-2">
          <Link href="/">
            <Button
              variant="outline"
              size="icon"
              className="w-10 h-10 rounded-md bg-[#444444] border-2 border-[#666666] hover:bg-[#555555]"
              onClick={() => playSound("click")}
            >
              <Home className="w-6 h-6" />
            </Button>
          </Link>
          <Button
            variant="outline"
            size="icon"
            className="w-10 h-10 rounded-md bg-[#444444] border-2 border-[#666666] hover:bg-[#555555]"
            onClick={() => {
              toggleAudio()
              playSound("click")
            }}
          >
            {audioEnabled ? <Volume2 className="w-6 h-6" /> : <VolumeX className="w-6 h-6" />}
          </Button>
        </div>

        <h1 className="text-2xl md:text-3xl font-bold pixel-font text-center text-yellow-400 drop-shadow-[2px_2px_0px_#000000] animate-pulse">
          {isSpectateMode ? "SPECTATOR MODE" : "BATTLE ARENA"}
        </h1>

        <div className="flex items-center gap-2">
          <TokenDisplay 
            compact={true} 
            className="mr-2"
            onTokenClick={() => setShowBetDialog(true)}
          />
          {!connected && <WalletMultiButton onClickSound={() => playSound("click")} />}
        </div>
      </header>

      {/* Main content */}
      <main className="relative z-10 flex-1 flex flex-col md:flex-row">
        {/* Display either the Arena or the Spectator interface */}
        {isSpectateMode ? (
          // Full Spectator Interface
          <div className="flex-1 flex flex-col md:flex-row">
            {/* Left column - Live Matches */}
            <div className="md:w-1/4 p-4 bg-[#222222] overflow-y-auto">
              <h2 className="text-xl font-bold text-yellow-400 pixel-font mb-4">LIVE MATCHES</h2>
              <div className="space-y-2">
                {liveMatches.map(match => (
                  <div 
                    key={match.id}
                    className={`p-3 rounded cursor-pointer transition-all ${
                      currentSpectatingMatch === match.id 
                        ? 'bg-yellow-600 text-white' 
                        : 'bg-[#333333] text-white hover:bg-[#444444]'
                    }`}
                    onClick={() => {
                      playSound("click")
                      setCurrentSpectatingMatch(match.id)
                    }}
                  >
                    <div className="flex justify-between">
                      <span>{match.player1}</span>
                      <span>VS</span>
                      <span>{match.player2}</span>
                    </div>
                    <div className="mt-1 flex items-center">
                      <span className="flex items-center text-xs">
                        <span className={`w-2 h-2 rounded-full ${match.inProgress ? 'bg-green-500' : 'bg-red-500'} mr-1`}></span>
                        {match.inProgress ? 'LIVE' : 'ENDED'}
                      </span>
                      <span className="ml-auto text-xs">250 Spectators</span>
                    </div>
                  </div>
                ))}
              </div>
              
              <Button
                className="w-full mt-4 bg-[#3b82f6] hover:bg-[#2563eb] text-white font-bold py-2 rounded border-b-4 border-[#1e40af] hover:border-[#3b82f6]"
                onClick={() => {
                  playSound("click")
                  setIsSpectateMode(false)
                  // Update URL
                  window.history.pushState({}, '', '/arena')
                }}
              >
                ENTER ARENA
              </Button>
            </div>
            
            {/* Middle column - Match View */}
            <div className="flex-1 p-4 flex flex-col">
              <div className="bg-black/70 p-2 mb-2 rounded flex justify-between items-center">
                <div className="text-yellow-400 font-bold pixel-font">{
                  liveMatches.find(m => m.id === currentSpectatingMatch)?.player1
                } VS {
                  liveMatches.find(m => m.id === currentSpectatingMatch)?.player2
                }</div>
                <div className="flex items-center">
                  <span className="text-white text-sm mr-2">ROUND 2/3</span>
                  <span className="text-white text-sm">02:45</span>
                </div>
              </div>
              
              <div className="flex-1 bg-[#333333] rounded overflow-hidden relative">
                <SpectatorView
                  key={`spectator-${currentSpectatingMatch}`}
                  matchId={currentSpectatingMatch}
                  onSendMessage={(msg) => console.log("Message sent:", msg)}
                  onPlaceBet={(chickenId, amount) => handlePlaceBet(amount)}
                />
              </div>
            </div>
            
            {/* Right column - Stats & Betting */}
            <div className="md:w-1/4 p-4">
              <div className="bg-[#333333] border-4 border-[#222222] rounded-lg p-4 mb-4">
                <h2 className="text-xl font-bold mb-4 text-yellow-400 pixel-font">MATCH STATS</h2>
                
                <div className="space-y-4 text-white">
                  <div className="bg-[#444444] p-3 rounded-lg">
                    <div className="text-yellow-400 font-bold">{
                      liveMatches.find(m => m.id === currentSpectatingMatch)?.player1
                    }</div>
                    <div className="text-sm text-gray-300">Health</div>
                    <div className="w-full h-4 bg-gray-700 rounded-full overflow-hidden mt-1">
                      <div className="h-full bg-green-500 rounded-full" style={{ width: "72%" }}></div>
                    </div>
                  </div>
                  
                  <div className="bg-[#444444] p-3 rounded-lg">
                    <div className="text-yellow-400 font-bold">{
                      liveMatches.find(m => m.id === currentSpectatingMatch)?.player2
                    }</div>
                    <div className="text-sm text-gray-300">Health</div>
                    <div className="w-full h-4 bg-gray-700 rounded-full overflow-hidden mt-1">
                      <div className="h-full bg-green-500 rounded-full" style={{ width: "45%" }}></div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="bg-[#333333] border-4 border-[#222222] rounded-lg p-4">
                <h2 className="text-xl font-bold mb-4 text-yellow-400 pixel-font">BETTING</h2>
                
                <div className="space-y-4 text-white">
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                      onClick={() => {
                        playSound("click")
                        setShowBetDialog(true)
                      }}
                    >
                      BET ON {liveMatches.find(m => m.id === currentSpectatingMatch)?.player1}
                    </Button>
                    
                    <Button
                      className="bg-red-600 hover:bg-red-700 text-white"
                      onClick={() => {
                        playSound("click")
                        setShowBetDialog(true)
                      }}
                    >
                      BET ON {liveMatches.find(m => m.id === currentSpectatingMatch)?.player2}
                    </Button>
                  </div>
                  
                  <div className="bg-[#444444] p-3 rounded-lg">
                    <div className="text-sm text-gray-300">Betting Pool</div>
                    <div className="text-xl font-bold text-green-400 flex items-center">
                      <div className="w-5 h-5 mr-2">
                        <img src="/images/cock-token.png" alt="$COCK" className="w-full h-full object-contain" />
                      </div>
                      <span>1,250 $COCK</span>
                    </div>
                  </div>
                  
                  <div className="bg-[#444444] p-3 rounded-lg">
                    <div className="text-sm text-gray-300">Your Bets</div>
                    <div className="text-xl font-bold text-yellow-400 flex items-center">
                      <div className="w-5 h-5 mr-2">
                        <img src="/images/cock-token.png" alt="$COCK" className="w-full h-full object-contain" />
                      </div>
                      <span>50 $COCK</span>
                    </div>
                  </div>
                  
                  <div className="bg-[#444444] p-3 rounded-lg">
                    <div className="text-sm text-gray-300">Potential Winnings</div>
                    <div className="text-xl font-bold text-green-400 flex items-center">
                      <div className="w-5 h-5 mr-2">
                        <img src="/images/cock-token.png" alt="$COCK" className="w-full h-full object-contain" />
                      </div>
                      <span>150 $COCK</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          // Original Arena Interface
          <>
            <div className="flex-1 relative flex items-center justify-center">
              <div className="w-full h-full max-w-[800px] max-h-[600px]">
                <ArenaViewer />
                <Button
                  className="absolute top-4 right-20 bg-[#3b82f6] hover:bg-[#2563eb] text-white font-bold py-2 px-4 rounded border-b-4 border-[#1e40af] hover:border-[#3b82f6] transition-all"
                  onClick={handleStartMultiplayer}
                >
                  MULTIPLAYER
                </Button>
                <div className="absolute bottom-4 left-4 z-20">
                  <Button
                    variant="outline"
                    size="icon"
                    className="w-10 h-10 rounded-full bg-[#444444] border-2 border-[#666666] hover:bg-[#555555]"
                    onClick={() => {
                      playSound("click")
                      setShowArenaInfo(true)
                    }}
                  >
                    <Info className="w-6 h-6" />
                  </Button>
                </div>
                <Button
                  className="absolute top-4 right-4 bg-[#ff4500] hover:bg-[#ff6347] text-white font-bold py-2 px-4 rounded border-b-4 border-[#8B0000] hover:border-[#ff4500] transition-all"
                  onClick={handleSpectate}
                >
                  SPECTATE
                </Button>
              </div>
            </div>

            {/* Game controls - simplified for arena page */}
            <div className="md:w-1/4 p-6">
              <div className="bg-[#333333] border-4 border-[#222222] rounded-lg p-6">
                <h2 className="text-xl font-bold mb-4 text-yellow-400 pixel-font">BATTLE STATS</h2>

                <div className="text-white space-y-4">
                  <div className="bg-[#444444] p-3 rounded-lg">
                    <div className="text-sm text-gray-300">Health</div>
                    <div className="w-full h-4 bg-gray-700 rounded-full overflow-hidden mt-1">
                      <div className="h-full bg-green-500 rounded-full" style={{ width: "85%" }}></div>
                    </div>
                  </div>

                  <div className="bg-[#444444] p-3 rounded-lg">
                    <div className="text-sm text-gray-300">Energy</div>
                    <div className="w-full h-4 bg-gray-700 rounded-full overflow-hidden mt-1">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: "65%" }}></div>
                    </div>
                  </div>

                  <div className="bg-[#444444] p-3 rounded-lg">
                    <div className="text-sm text-gray-300">Special Attack</div>
                    <div className="w-full h-4 bg-gray-700 rounded-full overflow-hidden mt-1">
                      <div className="h-full bg-purple-500 rounded-full" style={{ width: "40%" }}></div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="bg-[#444444] p-2 rounded-lg text-center">
                      <div className="text-gray-300">Wins</div>
                      <div className="text-xl font-bold text-green-400">12</div>
                    </div>
                    <div className="bg-[#444444] p-2 rounded-lg text-center">
                      <div className="text-gray-300">Losses</div>
                      <div className="text-xl font-bold text-red-400">3</div>
                    </div>
                  </div>
                </div>

                <div className="mt-6">
                  <Button
                    className="w-full bg-[#ff4500] hover:bg-[#ff6347] text-white font-bold py-3 px-6 rounded border-b-4 border-[#8B0000] hover:border-[#ff4500] transition-all pixel-font"
                    onClick={handleSpectate}
                  >
                    SPECTATE BATTLES
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}
      </main>

      <ArenaInfoTooltip
        isVisible={showArenaInfo}
        onClose={() => {
          playSound("click")
          setShowArenaInfo(false)
        }}
      />

      {/* Game footer */}
      <footer className="relative z-10 p-2 bg-[#333333] border-t-4 border-[#222222] text-white text-center text-xs">
        <p>© {new Date().getFullYear()} Cock Combat • Powered by Solana</p>
      </footer>

      {/* Multiplayer Battle */}
      {inMultiplayerBattle && multiplayerGameState && (
        <div className="fixed inset-0 z-50 bg-black">
          <MultiplayerArena
            gameState={convertToArenaState(multiplayerGameState)} 
            isPlayer1={isPlayer1}
            onExit={handleExitMultiplayerBattle}
          />
        </div>
      )}

      {/* Matchmaking Modal */}
      <MatchmakingModal
        isOpen={showMatchmaking}
        onClose={() => setShowMatchmaking(false)}
        selectedChicken={selectedChicken}
        onMatchFound={handleMatchFound}
      />

      {/* Battle Results Modal */}
      <BattleResultsModal
        isOpen={showBattleResults}
        onClose={() => setShowBattleResults(false)}
        result={battleResult}
        playerName={isPlayer1 ? multiplayerGameState?.player1?.name : multiplayerGameState?.player2?.name}
        opponentName={isPlayer1 ? multiplayerGameState?.player2?.name : multiplayerGameState?.player1?.name}
      />

      {/* Add Bet Dialog */}
      <BetDialog
        isOpen={showBetDialog}
        onClose={() => setShowBetDialog(false)}
        onBetPlaced={handlePlaceBet}
        minBet={1}
        maxBet={100}
        defaultBet={5}
        playSound={playSound}
      />
    </div>
  )
}
