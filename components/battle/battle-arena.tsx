"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { useRouter } from "next/navigation"
import { WalletMultiButton } from "../wallet/wallet-multi-button"
import { useWallet } from "../../hooks/use-wallet"
// Solana modal removed in EVM-only build
import { isBsc } from "../../lib/chain"
import { Button } from "../ui/button"
import { Volume2, VolumeX, Home, ArrowLeft, Swords, Flame, Users, Loader2, ShieldCheck, Trophy, ChevronRight, Eye } from "lucide-react"
import Link from "next/link"
import dynamic from "next/dynamic"
const EnhancedArenaScene = dynamic(() => import("./enhanced-arena-scene"), { ssr: false })
import WaitingQueue from "./waiting-queue"
const LobbyRoom = dynamic(() => import("./lobby-room"), { ssr: false })
import { useAudio } from "../../contexts/AudioContext"
import BattleHUD from './battle-hud';
import GameOver from './game-over';
import WinnerCelebration from './winner-celebration';
import { useGameState, GameState } from "../../contexts/GameStateContext"
import { Lobby } from "../../lib/lobbies";
// Solana web3 removed in EVM-only build
import { motion } from "framer-motion"
import SpectatorChat from "../spectator/spectator-chat"
import ArenaBackground from "./arena-background"
import { toast } from "sonner"
import { useSocket } from "../../hooks/use-socket"

export default function BattleArena() {
  const router = useRouter()
  const { publicKey } = useWallet()
  const setVisible = () => {}
  const { audioEnabled, volume } = useAudio()
  const [lobbies, setLobbies] = useState<Lobby[]>([]);
  const [isLoadingLobbies, setIsLoadingLobbies] = useState(true);
  const [isJoining, setIsJoining] = useState<string | null>(null);
  const [joinedLobby, setJoinedLobby] = useState<Lobby | null>(null);
  const [inLobbyRoom, setInLobbyRoom] = useState(false);
  const [filter, setFilter] = useState<'all' | 'tutorial'>('all');
  const [hasLoadedLobbies, setHasLoadedLobbies] = useState(false);
  const fetchControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);
  const [guestId, setGuestId] = useState<string | null>(null);
  const [isPortrait, setIsPortrait] = useState(false);
  // Chat state
  const [xConnected, setXConnected] = useState<boolean>(false)
  const [chatOpen, setChatOpen] = useState<boolean>(false)
  const [activeMatchId, setActiveMatchId] = useState<string | undefined>(undefined)
  
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
    setGameState,
    setMatchMeta
  } = useGameState();
  const { socket } = useSocket();
  // Probe X session once
  useEffect(() => {
    const probe = async () => {
      try {
        const res = await fetch('/api/auth/x/session', { cache: 'no-store' })
        const data = await res.json().catch(() => ({}))
        setXConnected(Boolean(data && data.connected))
      } catch { setXConnected(false) }
    }
    probe()
  }, [])
  // Track match session id from server events/window cache
  useEffect(() => {
    try { const id = (window as any)?.__last_match_session_id; if (id && typeof id === 'string') setActiveMatchId(id) } catch {}
  }, [])
  useEffect(() => {
    if (!socket) return
    const capture = (p: any) => {
      try { const msid = String((p && (p.matchSessionId || (p as any)?.matchSessionId)) || ''); if (msid) setActiveMatchId(msid) } catch {}
    }
    socket.on?.('queue_begin', capture)
    socket.on?.('arena_lock_roster', capture)
    socket.on?.('round_start', capture)
    return () => {
      socket.off?.('queue_begin', capture)
      socket.off?.('arena_lock_roster', capture)
      socket.off?.('round_start', capture)
    }
  }, [socket])
  // Live counts overlay
  const [liveCounts, setLiveCounts] = useState<Record<string, { liveHumans: number; liveTotal: number }>>({})
  
  // Local state for chicken selection since we removed it from the context
  const [selectedChicken, setSelectedChicken] = useState(null);
  
  // Get the player from the players array
  const playerChicken = players.find(p => p.isPlayer);
  const playerHP = playerChicken?.hp || 3;
  // Listen for server sound triggers (killstreak, victory)
  useEffect(() => {
    if (!socket || !playSound) return;
    const onPlaySound = (payload: any) => {
      const key = payload?.key as string | undefined;
      if (!key) return;
      try { playSound(key); } catch {}
    };
    socket.on?.('play_sound', onPlaySound);
    return () => socket.off?.('play_sound', onPlaySound);
  }, [socket, playSound]);
  
  // Check if player is victorious (player is alive and all others are dead)
  const isVictorious = Boolean(playerChicken?.isAlive && players.filter(p => !p.isPlayer && p.isAlive).length === 0);

  // Robust queue->battle transition: listen at top-level too in case the waiting view misses the event
  useEffect(() => {
    if (!socket) return
    let startTimer: ReturnType<typeof setTimeout> | null = null
    const ensureStart = () => {
      // Only allow auto-start while explicitly on the queue screen.
      if (gameState === 'queue') {
        try {
          const override = (typeof window !== 'undefined') ? (window as any).__latest_roster_override : undefined
          if (Array.isArray(override) && override.length > 0) {
            startBattle(override)
          } else {
            startBattle()
          }
        } catch {}
      }
    }
    const onStarted = () => ensureStart()
    const onLock = (payload: any) => {
      try {
        const startAt = Number(payload?.roundStartAtEpochMs) || 0
        if (startAt > 0) {
          // Enter battle ~3s before the server start epoch to show synced countdown
          const delay = Math.max(0, startAt - Date.now() - 3000)
          if (startTimer) clearTimeout(startTimer)
          startTimer = setTimeout(ensureStart, delay)
        }
      } catch {}
    }
    socket.on('round_start', onStarted)
    socket.on('match_started', onStarted)
    socket.on('arena_lock_roster', onLock)
    return () => {
      socket.off('round_start', onStarted)
      socket.off('match_started', onStarted)
      socket.off('arena_lock_roster', onLock)
      if (startTimer) clearTimeout(startTimer)
    }
  }, [socket, startBattle, gameState])

  // Apply arena-specific CSS classes only during active battles
  useEffect(() => {
    const arenaDiv = document.querySelector('.battle-arena-container');
    if (gameState === 'battle') {
      document.body.classList.add('arena-active');
      if (arenaDiv) {
        arenaDiv.classList.add('arena-mode');
      }
    } else {
      document.body.classList.remove('arena-active');
      if (arenaDiv) {
        arenaDiv.classList.remove('arena-mode');
      }
    }

    return () => {
      document.body.classList.remove('arena-active');
      const cleanupDiv = document.querySelector('.battle-arena-container');
      if (cleanupDiv) {
        cleanupDiv.classList.remove('arena-mode');
      }
    };
  }, [gameState]);

  // Detect mobile portrait to show rotate notice
  useEffect(() => {
    const updateOrientation = () => {
      try {
        // Prefer matchMedia when available
        const mm = window.matchMedia && window.matchMedia('(orientation: portrait)');
        if (mm && typeof mm.matches === 'boolean') {
          setIsPortrait(mm.matches);
          return;
        }
      } catch (_) {}
      setIsPortrait(window.innerHeight > window.innerWidth);
    };
    updateOrientation();
    const onResize = () => updateOrientation();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize as any);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize as any);
    };
  }, []);

  // Cleanup mounted ref
  useEffect(() => {
    isMountedRef.current = true;
    const fetchLobbies = async () => {
      // Abort any in-flight request
      if (fetchControllerRef.current) {
        fetchControllerRef.current.abort();
      }
      const controller = new AbortController();
      fetchControllerRef.current = controller;

      // Only show the main loader on first load to avoid flicker during polling
      if (!hasLoadedLobbies) {
        setIsLoadingLobbies(true);
      }
      try {
        const response = await fetch('/api/lobbies', { signal: controller.signal });
        if (response.ok) {
          const data = await response.json();
          setLobbies(data);
        }
      } catch (error: unknown) {
        // Ignore abort errors
        if ((error as any)?.name === 'AbortError') return;
        console.error('Failed to fetch lobbies:', error instanceof Error ? error.message : 'Unknown error');
      } finally {
        if (!isMountedRef.current) return;
        setIsLoadingLobbies(false);
        setHasLoadedLobbies(true);
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

    return () => {
      isMountedRef.current = false;
      clearInterval(interval);
      if (fetchControllerRef.current) {
        fetchControllerRef.current.abort();
      }
    };
  }, [inLobbyRoom, hasLoadedLobbies]);

  // Subscribe to live lobby counts from socket
  useEffect(() => {
    if (!socket) return
    // payout toast
    const onPayout = (p: any) => {
      try {
        const me = getCurrentPlayerId()
        if (!me) return
        const isWinner = String(p?.winner||'').toLowerCase() === String(me).toLowerCase()
        if (!isWinner) return
        const amount = Number(p?.amount)||0
        const url = String(p?.explorer||'')
        toast.success(
          <div className="flex flex-col gap-1">
            <span className="font-bold">Payout received</span>
            <span className="text-sm text-white/80">+{amount.toFixed(3)} BNB</span>
            {url && <a href={url} target="_blank" rel="noreferrer" className="text-xs underline text-yellow-300">View transaction</a>}
          </div>,
          { duration: 4000 }
        )
      } catch {}
    }
    try { socket.on('payout_success', onPayout) } catch {}
    const onCounts = (payload: any) => {
      try {
        const { id, liveHumans, liveTotal } = payload || {}
        if (!id) return
        setLiveCounts(prev => ({ ...prev, [id]: { liveHumans: Number(liveHumans)||0, liveTotal: Number(liveTotal)||0 } }))
      } catch {}
    }
    const onSnapshot = (payload: any) => {
      try {
        const map = (payload && payload.counts) || {}
        setLiveCounts(map)
      } catch {}
    }
    socket.on('lobby_counts', onCounts)
    socket.on('lobby_counts_snapshot', onSnapshot)
    // Request an initial snapshot
    try { socket.emit('get_lobby_counts') } catch {}
    return () => {
      try { socket.off('payout_success', onPayout) } catch {}
      socket.off('lobby_counts', onCounts)
      socket.off('lobby_counts_snapshot', onSnapshot)
    }
  }, [socket])

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

  const leaveCurrentLobby = async () => {
    try {
      if (joinedLobby) {
        const id = getCurrentPlayerId();
        if (id) {
          await fetch('/api/lobbies', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lobbyId: joinedLobby.id, playerId: id })
          });
        }
      }
    } catch {}
    setInLobbyRoom(false);
    setJoinedLobby(null);
  };

  const getCurrentPlayerId = (): string | undefined => {
    try {
      if (publicKey && typeof (publicKey as any).toBase58 === 'function') return (publicKey as any).toBase58();
      // Do not fallback to cached guest id; only explicit wallet
    } catch {}
    return undefined;
  };

  // Filter and sort lobbies for display
  const displayedLobbies = useMemo(() => {
    let list = Array.isArray(lobbies) ? [...lobbies] : [];
    if (filter === 'tutorial') {
      list = list.filter(l => l.matchType === 'tutorial' || l.amount === 0);
    }
    // Sort: tutorial/free first, then by amount ascending; VIP/highRoller last to stand out
    return list.sort((a, b) => {
      const aIsFree = a.amount === 0;
      const bIsFree = b.amount === 0;
      if (aIsFree && !bIsFree) return -1;
      if (!aIsFree && bIsFree) return 1;
      return (a.amount || 0) - (b.amount || 0);
    });
  }, [lobbies, filter]);

  const handleJoinLobby = async (lobby: Lobby) => {
    // For FREE tutorial matches, allow guest join when no wallet
    const joiningAsGuest = (!publicKey && lobby.matchType === 'tutorial' && lobby.amount === 0);
    // Require wallet for paid/ranked lobbies
    if (!publicKey && !joiningAsGuest) {
      toast.error("Connect your wallet to join ranked matches", { duration: 2500 });
      setVisible(true);
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
      // Reuse stable guest id across refreshes to avoid ghost players
      let guestIdGenerated: string | null = null;
      if (joiningAsGuest) {
        try {
          const existing = typeof window !== 'undefined' ? localStorage.getItem('guest_id') : null;
          guestIdGenerated = existing || `guest_${Math.random().toString(36).slice(2, 10)}`;
          // Persist stable guest id for future sessions and cross-component access
          try { if (typeof window !== 'undefined') { localStorage.setItem('guest_id', guestIdGenerated); (window as any).__guestId = guestIdGenerated; } } catch {}
        } catch {
          guestIdGenerated = `guest_${Math.random().toString(36).slice(2, 10)}`;
          try { if (typeof window !== 'undefined') { localStorage.setItem('guest_id', guestIdGenerated); (window as any).__guestId = guestIdGenerated; } } catch {}
        }
      }
      const joinResponse = await fetch('/api/lobbies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lobbyId: lobby.id,
          // Always use lowercase wallet id to match server normalization and avoid 400s
          playerId: joiningAsGuest ? guestIdGenerated! : publicKey!.toBase58().toLowerCase(),
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

      // Stop persisting guest IDs globally to avoid sticky ghost identities
      setGuestId(joiningAsGuest ? guestIdGenerated : null);
      try { if (joiningAsGuest && typeof window !== 'undefined') (window as any).__guestId = guestIdGenerated } catch {}
 
      // Go to lobby room for ready-up phase (wager will be handled there)
      console.log('🏠 Going to lobby room...');
      // Use API response lobby (contains server-enriched usernames/players) when available
      setJoinedLobby(joinResult || lobby);
      setInLobbyRoom(true);
      try { (window as any).currentLobbyId = lobby.id } catch {}

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error("❌ Failed to join lobby:", errorMessage);
      // Add user-facing error notification here (e.g., a toast)
      alert(`Failed to join lobby: ${errorMessage}`);
    } finally {
      setIsJoining(null);
    }
  };

  // Allow viewing lobbies without wallet - wallet check happens when joining a match

  return (
    <div className="battle-arena-container relative min-h-screen bg-gray-900 text-white flex flex-col overflow-hidden" style={{
      backgroundImage: `radial-gradient(circle at top right, rgba(255, 170, 0, 0.1), transparent 30%), radial-gradient(circle at bottom left, rgba(255, 0, 0, 0.1), transparent 30%)`
    }}>
      <main className="relative z-10 flex-1 flex flex-col max-w-full max-h-full overflow-auto">
        {/* Minimal farm-like background scenes behind UI (non-interactive) */}
        {gameState !== "battle" && (
          <div className="absolute inset-0 z-0">
            <ArenaBackground />
          </div>
        )}
        {/* Top Bar moved to universal NavBar; removed local header */}

        {gameState === "lobby" && (
          <div className="flex-1 flex flex-col lg:flex-row w-full h-full max-h-full overflow-hidden gap-4">
            {/* Main Lobby Selection */}
            <div className={`flex-1 flex flex-col min-w-0 overflow-hidden transition-all duration-300 ${inLobbyRoom ? 'hidden lg:flex lg:w-[calc(100%-400px)]' : 'w-full lg:w-[calc(100%-350px)]'}`}>
              
              <div className="flex-1 w-full max-w-7xl mx-auto px-4 py-6 overflow-y-auto">
                {isLoadingLobbies ? (
                  <div className="flex justify-center items-center h-64">
                    <div className="flex flex-col items-center gap-4">
                      <Loader2 className="h-16 w-16 animate-spin text-yellow-400"/>
                      <p className="text-gray-400 pixel-font">Loading Arenas...</p>
                    </div>
                  </div>
                ) : (
                  <>
                  {/* Pro banner - glassmorphic update */}
                  <div className="mb-6 rounded-xl border border-white/10 bg-white/5 backdrop-blur-md p-4 shadow-[0_8px_30px_rgb(0,0,0,0.12)]">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2">
                        <div className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-white/10 border border-white/20 shadow-inner">
                          <ShieldCheck className="h-5 w-5 text-white/80" />
                          </div>
                          <div>
                          <p className="text-sm font-semibold text-white/90 tracking-wide">Official Arenas</p>
                          <p className="text-xs text-white/60">Verified lobbies with fair matchmaking</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled
                            className="border-yellow-600/30 text-yellow-400 bg-black/60 text-opacity-80 cursor-not-allowed text-xs gap-1"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Spectate (Coming Soon)
                          </Button>
                          <button
                            onClick={() => setFilter('all')}
                          className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${filter === 'all' ? 'bg-white/80 text-gray-900 border-white/70 shadow' : 'bg-white/5 text-white/80 border-white/10 hover:bg-white/10'}`}
                          >All</button>
                          <button
                            onClick={() => setFilter('tutorial')}
                          className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${filter === 'tutorial' ? 'bg-white/80 text-gray-900 border-white/70 shadow' : 'bg-white/5 text-white/80 border-white/10 hover:bg-white/10'}`}
                          >Tutorial</button>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 gap-5 sm:gap-6">
                    {displayedLobbies.map((lobby) => (
                      <motion.div
                        key={lobby.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.25, ease: 'easeOut' }}
                        whileHover={{ y: -3, scale: 1.01 }}
                        whileTap={{ scale: 0.995 }}
                        className={`relative overflow-hidden rounded-2xl p-6 md:p-7 cursor-pointer transition-all duration-300 group h-full flex flex-col
                          bg-white/6 backdrop-blur-md border border-white/10 shadow-[0_8px_30px_rgb(0,0,0,0.12)]
                          ${joinedLobby?.id === lobby.id ? 'ring-2 ring-white/70 border-white/30' : 'hover:border-white/20'}
                        min-h-[280px]
                        `}
                        onClick={() => !isJoining && handleJoinLobby(lobby)}
                      >
                        {/* Subtle gradient overlay on hover */}
                        <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none bg-gradient-to-br ${lobby.highRoller ? 'from-red-400/10 to-red-700/10' : 'from-white/8 to-white/0'}`} />
                        
                        {/* High Roller Badge */}
                        {lobby.highRoller && (
                          <div className="absolute top-2 right-2 bg-red-600/80 backdrop-blur-sm text-white px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 border border-white/10">
                            <Flame className="h-3 w-3" />
                            VIP
                          </div>
                        )}
                        
                        {/* Coming Soon Overlay removed; we keep the button label instead */}
                        
                        <div className="relative z-10">
                          {/* Entry Amount */}
                          <div className="mb-3 lg:mb-3">
                            <div className={`text-xl lg:text-2xl font-bold pixel-font ${lobby.highRoller ? 'text-red-300' : 'text-white'}`}>
                              {lobby.amount === 0 ? 'FREE' : `${lobby.amount} ${lobby.currency}`}
                            </div>
                            <div className="text-[10px] lg:text-[12px] text-white/70 uppercase tracking-wide">
                              {lobby.amount === 0 ? 'Tutorial Match' : 'Entry Fee'}
                            </div>
                          </div>
                          
                          {/* Players Count */}
                          {(() => {
                            const live = liveCounts[lobby.id]
                            const playerCount = live ? live.liveHumans : 0
                            const isLocked = lobby.status !== 'open' || playerCount >= lobby.capacity
                            const fillPercent = Math.min(100, Math.round((playerCount / lobby.capacity) * 100))
                            return (
                              <>
                                <div className="flex items-center justify-between mb-3 lg:mb-3">
                                  <div className="flex items-center gap-2 text-white/85">
                                    <Users className="h-4 w-4" />
                                    <span className="font-semibold text-sm lg:text-base">
                                      {playerCount} / {lobby.capacity}
                                    </span>
                                  </div>
                                  {/* Status Indicator */}
                                  <div className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                                    isLocked
                                      ? 'bg-red-500/15 text-red-300 border-red-400/30'
                                      : playerCount > 0
                                      ? 'bg-yellow-500/15 text-yellow-300 border-yellow-400/30'
                                      : 'bg-emerald-600/15 text-emerald-300 border-emerald-400/30'
                                  }`}>
                                    {isLocked
                                      ? (lobby.status !== 'open' ? 'IN GAME' : 'FULL')
                                      : (playerCount > 0 ? 'ACTIVE' : 'OPEN')}
                                  </div>
                                </div>
                                {/* Capacity Progress */}
                                <div className="mb-3 lg:mb-4">
                                  <div className="h-2 rounded bg-white/10 overflow-hidden">
                                    <div className={`${lobby.highRoller ? 'bg-red-400' : 'bg-white/80'} h-full`} style={{ width: `${fillPercent}%` }} />
                                  </div>
                                  <div className="mt-1 text-[11px] text-white/70 text-right">{fillPercent}% filled</div>
                                </div>
                                {/* Removed AI autofill note for tutorial */}
                              </>
                            );
                          })()}
                          
                        {/* Actions: Join and Spectate */}
                        {!lobby.isComingSoon && (
                          <div className="mt-auto grid grid-cols-1 gap-2">
                            <Button
                              className={`w-full font-bold py-2.5 px-3 lg:px-4 rounded-lg transition-all duration-300 border text-sm md:text-base flex items-center justify-center gap-2
                                ${isLocked ? 'bg-white/5 text-white/50 border-white/10 cursor-not-allowed' : 'bg-white/10 hover:bg-white/15 text-white border-white/20 shadow-inner'}`}
                              onClick={(e) => { e.stopPropagation(); if (!isJoining && !isLocked) handleJoinLobby(lobby); }}
                              disabled={isJoining === lobby.id || isLocked}
                            >
                              {isJoining === lobby.id 
                                  ? <><Loader2 className="h-4 w-4 animate-spin"/> Joining...</>
                                  : joinedLobby?.id === lobby.id
                                  ? '✓ JOINED'
                                  : (isLocked ? (lobby.status !== 'open' ? 'IN GAME' : 'FULL') : <>JOIN <ChevronRight className="h-5 w-5"/></>)}
                            </Button>
                          </div>
                        )}
                          {lobby.isComingSoon && (
                            <Button
                              className="mt-auto w-full font-bold py-1.5 px-2 lg:px-3 rounded-lg border text-xs md:text-sm bg-white/10 text-white border-white/20 opacity-90 cursor-not-allowed"
                              disabled
                            >
                              COMING SOON
                            </Button>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                  </>
                )}
              </div>
            </div>

            {/* Spectate sidebar removed per request */}

            {/* Lobby Room Details - Full overlay on mobile, fixed sidebar on desktop */}
            {inLobbyRoom && joinedLobby && (
              <motion.div
                initial={{ x: 300, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 300, opacity: 0 }}
                transition={{ type: "spring", damping: 25 }}
                className="fixed top-0 left-0 right-0 bottom-0 z-50 bg-gray-900/80 backdrop-blur-sm flex flex-col pointer-events-auto
                           lg:relative lg:z-50 lg:static lg:w-[400px] lg:flex-shrink-0 lg:bg-gray-900/50 lg:border-l lg:border-gray-700/50 
                           safe-area-inset overflow-auto"
              >
                <div className="p-2 sm:p-3 border-b border-gray-700/50 flex-shrink-0">
                  <div className="flex items-center justify-between mb-1">
                    <h2 className="text-base sm:text-lg lg:text-xl font-bold text-yellow-400 pixel-font">MATCH ROOM</h2>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={leaveCurrentLobby}
                      className="bg-red-600/20 border-red-600 text-red-400 hover:bg-red-600/30 h-8 w-8 p-0 flex items-center justify-center"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-gray-400">
                    {joinedLobby.amount === 0 ? '🆓 Free Practice' : `💰 ${joinedLobby.amount} ${joinedLobby.currency} Wager`}
                  </p>
                </div>
                
                <div className="flex-1 min-h-0 overflow-hidden" style={{ display: 'flex', flexDirection: 'column' }}>
                  <LobbyRoom
                    lobby={joinedLobby}
                    playerIdentifier={guestId || (publicKey as any)?.toBase58?.() || (publicKey as any)?.toString?.() || undefined}
                    onLeaveLobby={leaveCurrentLobby}
                    onStartMatch={() => {
                      setInLobbyRoom(false);
                      // Always go through the confirmation queue screen
                      joinQueue();
                      // Capture match meta for post-game display
                      try {
                        const humans = (joinedLobby.players || []).filter(p => !p.isAi).length || 0;
                        setMatchMeta({ amount: joinedLobby.amount || 0, currency: joinedLobby.currency || (isBsc() ? 'BNB' : 'SOL'), matchType: joinedLobby.matchType || 'tutorial', humanCount: humans });
                      } catch {}
                    }}
                  />
                </div>
              </motion.div>
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

        {/* Floating Chat (lobby/queue only - never in live battle) */}
        {(gameState === "lobby" || gameState === "queue") && (
        <div className="fixed bottom-4 left-4 z-[10050]">
          {chatOpen && (
            <div className="pointer-events-auto w-[340px] h-[480px] bg-black/40 backdrop-blur-xl border-2 border-yellow-500/30 rounded-2xl shadow-2xl mb-3 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-yellow-900/30 to-orange-900/30 backdrop-blur-md border-b-2 border-yellow-500/30">
                <div className="text-sm font-bold text-yellow-400 pixel-font flex items-center gap-2">
                  💬 ARENA CHAT
                </div>
                <div className="flex items-center gap-2">
                  {!xConnected && (
                    <button
                      onClick={() => { try { window.location.href = '/api/auth/x/login' } catch {} }}
                      className="px-3 py-1 rounded-md bg-[#1DA1F2] hover:bg-[#1a8cd8] text-white text-xs font-bold pixel-font shadow-md transition-all"
                    >
                      🔗 X
                    </button>
                  )}
                  <button onClick={() => setChatOpen(false)} className="px-2 py-1 text-xs text-yellow-300 hover:text-yellow-400 font-bold pixel-font">−</button>
                </div>
              </div>
              <div className="h-[calc(480px-52px)]">
                <SpectatorChat matchId={activeMatchId} canSend={xConnected} />
              </div>
            </div>
          )}
          {!chatOpen && (
            <button
              onClick={() => setChatOpen(true)}
              className="pointer-events-auto rounded-full bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-black font-bold shadow-2xl px-5 py-3 pixel-font border-2 border-yellow-600/50 backdrop-blur-sm transition-all transform hover:scale-105"
              aria-label="Open chat"
            >
              💬 CHAT
            </button>
          )}
        </div>
        )}

        {gameState === "battle" && (
          <div className="flex-1 w-full h-full relative overflow-hidden">
            {/* Rotate notice on mobile portrait */}
            {isPortrait && (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 z-50 bg-black/60 text-white text-xs px-3 py-1 rounded-full border border-white/10 backdrop-blur-sm">
                For the best experience, rotate your device to landscape
              </div>
            )}
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
              winner={isVictorious ? (playerChicken as any || null) : null}
              humanPlayer={playerChicken as any || null}
              onExit={() => {
                // Reset everything and return to lobby selection
                setInLobbyRoom(false);
                setJoinedLobby(null);
                exitBattle();
              }}
            />
          </div>
        )}
        
        {gameState === "winner" && (
          <div className="flex-1 w-full h-full relative overflow-hidden">
            <div className="absolute inset-0 w-full h-full">
              <EnhancedArenaScene 
                gameState={gameState}
                playerChicken={playerChicken}
                onExit={() => {
                  setInLobbyRoom(false);
                  setJoinedLobby(null);
                  exitBattle();
                }}
                onPlayerDamage={handlePlayerDamage}
                onDrumstickCollected={handleDrumstickCollected}
                playSound={playSound}
                players={players}
              />
            </div>
            
            {/* Show winner celebration screen */}
            <WinnerCelebration 
              onExit={() => {
                setInLobbyRoom(false);
                setJoinedLobby(null);
                exitBattle();
              }}
            />
          </div>
        )}
      </main>

      {gameState !== "battle" && gameState !== "gameOver" && gameState !== "winner" && (
        <footer className="relative z-10 p-2 bg-black/20 border-t border-white/10 text-white text-center text-xs flex-shrink-0">
          <p> {new Date().getFullYear()} Cock Combat • Powered by BNB Chain</p>
        </footer>
      )}
    </div>
  )
}
