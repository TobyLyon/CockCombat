"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useSocket } from "@/hooks/use-socket"
import { useWallet } from "@solana/wallet-adapter-react"
import { Users, Clock, Crown, ArrowLeft, Check, X, Loader2 } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { Lobby } from "@/app/api/lobbies/route"
import { Transaction, Connection, clusterApiUrl } from "@solana/web3.js"
import { toast } from "sonner"

interface LobbyPlayer {
  playerId: string
  username: string
  chickenName?: string
  isReady: boolean
  isAi: boolean
  avatar?: string
}

interface LobbyRoomProps {
  lobby: Lobby
  onLeaveLobby: () => void
  onStartMatch: () => void
  playerIdentifier?: string
}

export default function LobbyRoom({ lobby, onLeaveLobby, onStartMatch, playerIdentifier }: LobbyRoomProps) {
  const { socket, isConnected } = useSocket()
  const { publicKey, sendTransaction } = useWallet()
  const [players, setPlayers] = useState<LobbyPlayer[]>([])
  const [isReady, setIsReady] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [lobbyData, setLobbyData] = useState<Lobby>(lobby)
  const [isProcessingWager, setIsProcessingWager] = useState(false)
  const [hasWagered, setHasWagered] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const barRef = useRef<HTMLDivElement | null>(null)

  // Debug: log layout to find why the ready bar might be off-screen
  useEffect(() => {
    const logLayout = (reason: string) => {
      try {
        const root = rootRef.current
        const bar = barRef.current
        if (!root || !bar) {
          console.log('[LobbyRoom][layout]', reason, { rootExists: !!root, barExists: !!bar })
          return
        }
        const rootStyle = getComputedStyle(root)
        const barStyle = getComputedStyle(bar)
        const rootRect = root.getBoundingClientRect()
        const barRect = bar.getBoundingClientRect()
        const parent = root.parentElement
        const pStyle = parent ? getComputedStyle(parent) : null
        const pRect = parent ? parent.getBoundingClientRect() : null

        const info = {
          reason,
          window: { w: window.innerWidth, h: window.innerHeight },
          rootRect, barRect, pRect,
          rootOverflow: { overflow: rootStyle.overflow, overflowY: rootStyle.overflowY },
          parentOverflow: pStyle ? { overflow: pStyle.overflow, overflowY: pStyle.overflowY } : null,
          barDisplay: barStyle.display,
          barPosition: barStyle.position,
          barZ: barStyle.zIndex,
          classes: { root: root.className, bar: bar.className },
          outOfViewportPx: Math.max(0, barRect.bottom - window.innerHeight)
        }
        console.log('[LobbyRoom][layout]', info)
      } catch (e) {
        console.log('[LobbyRoom][layout] measurement error', e)
      }
    }

    const onResize = () => logLayout('resize')
    logLayout('mount')
    window.addEventListener('resize', onResize)
    const id = window.setTimeout(() => logLayout('post-mount-200ms'), 200)
    return () => {
      window.removeEventListener('resize', onResize)
      window.clearTimeout(id)
    }
  }, [])

  // Join lobby room on mount
  useEffect(() => {
    const id = playerIdentifier || publicKey?.toString()
    if (socket && isConnected && id) {
      console.log(`🏟️ Joining lobby room: ${lobby.id}`);
      
      // Register the player identifier (wallet or guest id) with the socket
      socket.emit('register_wallet', id);
      
      // Then join the lobby room
      socket.emit('join_lobby_room', lobby.id);
      
      // Request current lobby state after joining
      const requestLobbyState = () => {
        console.log(`📋 Requesting lobby state for: ${lobby.id}`);
        socket.emit('get_lobby_state', lobby.id);
      };
      
      // Request immediately and after a delay to ensure join is complete
      requestLobbyState();
      const stateTimer = setTimeout(requestLobbyState, 200);
      
      // Also set a periodic refresh every 5 seconds to keep lobby in sync
      const refreshInterval = setInterval(requestLobbyState, 5000);

      return () => {
        clearTimeout(stateTimer);
        clearInterval(refreshInterval);
        console.log(`🚪 Leaving lobby room: ${lobby.id}`);
        socket.emit('leave_lobby_room', lobby.id);
      };
    }
  }, [socket, isConnected, lobby.id, publicKey, playerIdentifier]);

  // Set up socket listeners
  useEffect(() => {
    if (!socket) return;

    const handleLobbyUpdate = (updatedLobby: any) => {
      console.log('🔄 Lobby updated:', updatedLobby);
      console.log('Current playerIdentifier:', playerIdentifier || publicKey?.toString());
      setLobbyData(updatedLobby);
      
      // Update players list with the lobby data
      if (updatedLobby.players) {
        console.log('Setting players:', updatedLobby.players);
        setPlayers(updatedLobby.players);
      }
    };

    const handlePlayerJoined = (data: { playerId: string, username: string, chickenName?: string, isReady: boolean, isAi: boolean }) => {
      console.log('👋 Player joined:', data);
      setPlayers(prev => {
        // Remove existing player if any, then add new one
        const filtered = prev.filter(p => p.playerId !== data.playerId);
        return [...filtered, {
          playerId: data.playerId,
          username: data.username,
          chickenName: data.chickenName,
          isReady: data.isReady,
          isAi: data.isAi
        }];
      });
    };

    const handlePlayerLeft = (data: { playerId: string }) => {
      console.log('👋 Player left:', data.playerId);
      setPlayers(prev => prev.filter(p => p.playerId !== data.playerId));
    };

    const handlePlayerReady = (data: { playerId: string, isReady: boolean }) => {
      console.log('✅ Player ready status:', data);
      setPlayers(prev => prev.map(p => 
        p.playerId === data.playerId ? { ...p, isReady: data.isReady } : p
      ));
    };

    const handleMatchStarting = (data: { countdown: number }) => {
      console.log('🚀 Match starting in:', data.countdown);
      setCountdown(data.countdown);
    };

    const handleMatchStarted = () => {
      console.log('🎮 Match started!');
      onStartMatch();
    };

    const handleRefreshLobbyState = () => {
      console.log('🔄 Refreshing lobby state...');
      socket.emit('get_lobby_state', lobby.id);
    };

    socket.on('lobby_updated', handleLobbyUpdate);
    socket.on('player_joined_lobby', handlePlayerJoined);
    socket.on('player_left_lobby', handlePlayerLeft);
    socket.on('player_ready_status', handlePlayerReady);
    socket.on('match_starting', handleMatchStarting);
    socket.on('match_started', handleMatchStarted);
    socket.on('refresh_lobby_state', handleRefreshLobbyState);

    return () => {
      socket.off('lobby_updated', handleLobbyUpdate);
      socket.off('player_joined_lobby', handlePlayerJoined);
      socket.off('player_left_lobby', handlePlayerLeft);
      socket.off('player_ready_status', handlePlayerReady);
      socket.off('match_starting', handleMatchStarting);
      socket.off('match_started', handleMatchStarted);
      socket.off('refresh_lobby_state', handleRefreshLobbyState);
    };
  }, [socket, onStartMatch]);

  // Initial lobby data setup - ensure current player is included
  useEffect(() => {
    const id = playerIdentifier || publicKey?.toString();
    if (id && lobbyData.players) {
      const currentPlayerInLobby = lobbyData.players.find(p => p.playerId === id);
      
      if (currentPlayerInLobby) {
        // Convert lobby players to display format, ensuring current player is included
        const displayPlayers = lobbyData.players.map(player => ({
          playerId: player.playerId,
          username: player.username || player.playerId.slice(0, 8) + '...',
          chickenName: player.chickenId || 'Default',
          isReady: false,
          isAi: player.isAi || false
        }));
        
        setPlayers(displayPlayers);
        console.log('🎯 Set initial players from lobby data:', displayPlayers);
      }
    }
  }, [publicKey, lobbyData, playerIdentifier]);

  // Countdown effect
  useEffect(() => {
    if (countdown !== null && countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(countdown - 1)
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [countdown])

  const handleReadyToggle = async () => {
    if (!socket) return;
    const id = playerIdentifier || publicKey?.toString();
    if (!id) return;

    // If trying to ready up and this is a paid lobby, need to process wager first
    const isPaidLobby = lobby.amount > 0 && lobby.matchType !== 'tutorial';
    
    if (!isReady && isPaidLobby && !hasWagered) {
      await handleWagerTransaction();
      return;
    }

    // Toggle ready state
    const newReadyState = !isReady;
    console.log(`🎯 Setting ready state to ${newReadyState} for player ${publicKey.toString()}`);
    setIsReady(newReadyState);
    socket.emit('player_ready', {
      lobbyId: lobby.id,
      playerId: id,
      isReady: newReadyState
    });
  }

  const handleWagerTransaction = async () => {
    if (!sendTransaction || !publicKey) {
      toast.error("Wallet does not support transactions");
      return;
    }

    setIsProcessingWager(true);

    try {
      // Create the wager transaction
      const wagerResponse = await fetch('/api/wager', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lobbyId: lobby.id,
          playerPublicKey: publicKey.toBase58(),
        }),
      });

      if (!wagerResponse.ok) {
        const errorData = await wagerResponse.json();
        throw new Error(errorData.error || 'Failed to create wager transaction');
      }

      const { transaction: serializedTransaction } = await wagerResponse.json();
      const transaction = Transaction.from(Buffer.from(serializedTransaction, 'base64'));
      
      // Send and confirm the transaction
      const connection = new Connection(clusterApiUrl('devnet'));
      const signature = await sendTransaction(transaction, connection);
      await connection.confirmTransaction(signature, 'confirmed');

      console.log('Wager transaction successful with signature:', signature);
      toast.success("Wager submitted successfully!");
      
      setHasWagered(true);
      
      // Now ready up automatically
      setIsReady(true);
      if (socket) {
        socket.emit('player_ready', {
          lobbyId: lobby.id,
          playerId: publicKey.toString(),
          isReady: true
        });
      }

    } catch (error: any) {
      console.error("❌ Failed to process wager:", error);
      toast.error(`Failed to submit wager: ${error.message}`);
    } finally {
      setIsProcessingWager(false);
    }
  }

  const allPlayersReady = players.length >= (lobby.matchType === 'tutorial' ? 2 : 4) && 
                          players.every(p => p.isReady)
  const currentPlayer = players.find(p => p.playerId === (playerIdentifier || publicKey?.toString()))

  return (
    <div ref={rootRef} className="h-full w-full grid bg-gray-900/50 pointer-events-auto" style={{ gridTemplateRows: 'auto 1fr auto auto' }}>
      {/* Countdown Overlay */}
      <AnimatePresence>
        {countdown !== null && countdown > 0 && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            className="absolute inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50"
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
                MATCH STARTING...
              </motion.p>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="flex items-center justify-center gap-2 text-base text-yellow-400"
              >
                <Clock className="h-5 w-5 animate-pulse" />
                <span>Get ready to fight!</span>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ready Status Banner - Show when all players are ready */}
      <AnimatePresence>
        {allPlayersReady && countdown === null && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="absolute top-0 left-0 right-0 bg-green-600/90 backdrop-blur-sm p-3 z-40"
          >
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 text-white">
                <Check className="h-5 w-5" />
                <span className="text-base font-bold pixel-font">ALL PLAYERS READY!</span>
              </div>
              <p className="text-xs text-green-100 mt-1">Waiting for match to start...</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Match Details - Ultra Compact */}
      <div className="p-1.5 bg-gray-800/50 border-b border-gray-700/50">
        <div className="space-y-1 text-[10px]">
          <div className="flex justify-between">
            <span className="text-gray-400">Entry:</span>
            <span className="font-bold text-yellow-400">
              {lobby.amount === 0 ? 'FREE' : `${lobby.amount} ${lobby.currency}`}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Prize:</span>
            <span className="font-bold text-green-400">
              {lobby.amount === 0 ? 'Practice' : `${lobby.amount * players.length} ${lobby.currency}`}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Players:</span>
            <span className="font-bold">
              {players.length} / {lobby.capacity}
            </span>
          </div>
        </div>
      </div>

      {/* Players List - Scrollable */}
      <div className="overflow-y-auto overflow-x-hidden p-1.5 pointer-events-auto" style={{ minHeight: 0 }}>
        <div className="space-y-1.5">
          {players.map((player, index) => (
            <motion.div
              key={player.playerId}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className={`flex items-center justify-between p-2 rounded border transition-colors ${
                player.isReady 
                  ? 'bg-green-900/30 border-green-600/50' 
                  : 'bg-gray-700/30 border-gray-600/50'
              }`}
            >
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  player.isAi ? 'bg-purple-600' : 'bg-blue-600'
                }`}>
                  {player.isAi ? 'AI' : (index + 1)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-semibold truncate">
                      {player.username || `Player ${index + 1}`}
                    </span>
                    {player.isAi && (
                      <Badge variant="secondary" className="text-[9px] px-1 py-0">
                        AI
                      </Badge>
                    )}
                  </div>
                  <p className="text-[10px] text-gray-400 truncate">
                    🐔 {player.chickenName || 'Random'}
                  </p>
                </div>
              </div>
              
              <div className="flex-shrink-0">
                {player.isReady ? (
                  <Badge className="bg-green-600 text-white text-[10px] px-1.5 py-0.5">
                    <Check className="mr-0.5 h-2.5 w-2.5" />
                    Ready
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-gray-500 text-gray-400 text-[10px] px-1.5 py-0.5">
                    <Clock className="mr-0.5 h-2.5 w-2.5" />
                    Wait
                  </Badge>
                )}
              </div>
            </motion.div>
          ))}
          
          {/* Empty slots - Ultra Compact */}
          {Array.from({ length: lobby.capacity - players.length }).map((_, index) => (
            <div
              key={`empty-${index}`}
              className="flex items-center gap-1.5 p-2 rounded border border-dashed border-gray-600/50 bg-gray-800/20"
            >
              <div className="w-6 h-6 rounded-full border border-dashed border-gray-600 flex items-center justify-center">
                <Users className="h-3 w-3 text-gray-500" />
              </div>
              <span className="text-xs text-gray-500">Waiting...</span>
            </div>
          ))}
        </div>
      </div>

      {/* Requirements Notice */}
      {lobby.matchType !== 'tutorial' && (
        <div className="px-2 py-1 bg-yellow-900/20 border-t border-yellow-600/30">
          <p className="text-[9px] text-yellow-400 text-center">
            Min. 4 players for ranked
          </p>
        </div>
      )}

      {/* Ready Button Section */}
      <div ref={barRef} className="px-2 py-1.5 bg-gray-800 border-t border-yellow-500 w-full">
        <div className="w-full">
        <Button
          onClick={handleReadyToggle}
          disabled={isProcessingWager}
          className={`w-full h-10 text-sm font-bold pixel-font transition-all ${
            isReady
              ? 'bg-red-600 hover:bg-red-500 text-white'
              : 'bg-green-600 hover:bg-green-500 text-white'
          } disabled:bg-gray-600 disabled:cursor-not-allowed`}
        >
          {isProcessingWager ? (
            <>
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              PROCESSING...
            </>
          ) : isReady ? (
            <>
              <X className="mr-1.5 h-4 w-4" />
              CANCEL
            </>
          ) : (
            <>
              {lobby.amount > 0 && lobby.matchType !== 'tutorial' && !hasWagered ? (
                <>
                  <Check className="mr-1.5 h-4 w-4" />
                  WAGER & READY
                </>
              ) : (
                <>
                  <Check className="mr-1.5 h-4 w-4" />
                  READY UP
                </>
              )}
            </>
          )}
        </Button>
        
        {/* Wager Status - Ultra Compact */}
        {lobby.amount > 0 && lobby.matchType !== 'tutorial' && (
          <div className="mt-0.5 text-center">
            {hasWagered ? (
              <div className="flex items-center justify-center gap-0.5 text-green-400">
                <Check className="h-2.5 w-2.5" />
                <span className="text-[10px]">Wager submitted</span>
              </div>
            ) : (
              <p className="text-[10px] text-yellow-400">
                Submit {lobby.amount} {lobby.currency} to ready
              </p>
            )}
          </div>
        )}

        {/* All Ready Status */}
        {allPlayersReady && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-1 text-center p-1 bg-green-900/30 border border-green-600/50 rounded"
          >
            <p className="text-green-400 font-bold text-[10px]">
              All ready! Starting soon...
            </p>
          </motion.div>
        )}
        </div>
      </div>

      {/* Match Info Footer */}
      <div className="px-2 py-1.5 bg-gray-900/80 border-t border-gray-700/30">
        <div className="space-y-1.5 text-[10px]">
          {/* Prize Pool */}
          <div className="flex items-center justify-between px-2 py-1 bg-gray-800/50 rounded border border-gray-700/30">
            <span className="text-gray-400 flex items-center gap-1">
              <Crown className="h-3 w-3 text-yellow-500" />
              Prize Pool
            </span>
            <span className="font-bold text-yellow-400">
              {lobby.amount === 0 ? 'Practice Match' : `${lobby.amount * Math.max(players.length, lobby.matchType === 'tutorial' ? 2 : 4)} ${lobby.currency}`}
            </span>
          </div>

          {/* Match Type & Rules */}
          <div className="flex items-center justify-between text-gray-400 px-2">
            <span>Match Type:</span>
            <span className="text-gray-300 font-semibold">
              {lobby.matchType === 'tutorial' ? 'Tutorial' : 'Ranked'}
            </span>
          </div>

          {/* Quick Tip */}
          <div className="px-2 py-1 bg-blue-900/20 border border-blue-700/30 rounded">
            <p className="text-blue-300 text-center text-[9px]">
              💡 {lobby.matchType === 'tutorial' 
                ? 'Practice your skills against AI opponents!' 
                : 'Last chicken standing wins the full prize pool!'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
} 