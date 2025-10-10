"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useSocket } from "@/hooks/use-socket"
import { useWallet } from "@/hooks/use-wallet"
import { isBsc } from "@/lib/chain"
import { Users, Clock, Crown, ArrowLeft, Check, X, Loader2 } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { Lobby } from "@/lib/lobbies"
// Solana tx helpers removed in EVM-only build
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
  const playersRef = useRef<LobbyPlayer[]>([])
  const [isReady, setIsReady] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [lobbyData, setLobbyData] = useState<Lobby>(lobby)
  const [isProcessingWager, setIsProcessingWager] = useState(false)
  const [hasWagered, setHasWagered] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const barRef = useRef<HTMLDivElement | null>(null)
  const bottomActionsRef = useRef<HTMLDivElement | null>(null)
  const [bottomPadding, setBottomPadding] = useState<number>(56)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [scrollMaxHeight, setScrollMaxHeight] = useState<number>(0)
  const httpPollRef = useRef<number | null>(null)
  // Track that we've transitioned to the queue after the first check
  const transitionedToQueueRef = useRef<boolean>(false)

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

  const getCurrentPlayerId = () => {
    try {
      if (playerIdentifier) return playerIdentifier
      if (typeof window !== 'undefined' && publicKey && typeof (publicKey as any).toBase58 === 'function') return (publicKey as any).toBase58()
      if (typeof window !== 'undefined') return localStorage.getItem('guest_id') || undefined
    } catch {}
    return undefined
  }

  // Join lobby room on mount, leave on unmount/navigation/refresh
  useEffect(() => {
    const id = getCurrentPlayerId()
    if (socket && isConnected && id) {
      console.log(`🏟️ Joining lobby room: ${lobby.id}`);
      
      // Register the player identifier (wallet or guest id) with the socket
      socket.emit('register_wallet', id);
      
      // Wait for wallet_registered ACK before joining room (prevents race)
      const tryJoin = () => socket.emit('join_lobby_room', lobby.id);
      const acked = (typeof window !== 'undefined') && (window as any).__socket_wallet_registered;
      if (acked) {
        tryJoin();
      } else {
        const ackListener = () => { tryJoin(); socket.off?.('wallet_registered', ackListener as any) }
        socket.on?.('wallet_registered', ackListener as any)
        // Safety timeout (500ms) to proceed even if ACK missed
        setTimeout(() => { tryJoin(); socket.off?.('wallet_registered', ackListener as any) }, 500)
      }
      
      // Request current lobby state after joining
      const requestLobbyState = () => {
        console.log(`📋 Requesting lobby state for: ${lobby.id}`);
        socket.emit('get_lobby_state', lobby.id);
      };
      
      // Request immediately and after small delays to ensure join is complete
      requestLobbyState();
      const stateTimer = setTimeout(requestLobbyState, 300);
      const stateTimer2 = setTimeout(requestLobbyState, 900);
      
      // Also set a periodic refresh every 5 seconds to keep lobby in sync
      const refreshInterval = setInterval(requestLobbyState, 5000);

      const cleanup = () => {
        clearTimeout(stateTimer);
        clearTimeout(stateTimer2);
        clearInterval(refreshInterval);
        // If we already transitioned to queue (second check), keep room membership during handoff
        if (!transitionedToQueueRef.current) {
          console.log(`🚪 Leaving lobby room: ${lobby.id}`);
          socket.emit('leave_lobby_room', lobby.id);
        } else {
          console.log(`⏸️ Preserving lobby room membership during queue transition: ${lobby.id}`);
        }
      };
      window.addEventListener('beforeunload', cleanup)
      document.addEventListener('visibilitychange', () => { if (document.hidden) cleanup() })
      return () => {
        window.removeEventListener('beforeunload', cleanup)
        document.removeEventListener('visibilitychange', () => { if (document.hidden) cleanup() })
        cleanup()
      };
    }
  }, [socket, isConnected, lobby.id, publicKey, playerIdentifier]);

  // Ensure scroll area never hides the bottom actions and fits viewport
  useEffect(() => {
    const measure = () => {
      try {
        const bottomH = bottomActionsRef.current?.offsetHeight || 56
        const scrollTop = scrollRef.current?.getBoundingClientRect().top || 0
        const avail = window.innerHeight - scrollTop - bottomH - 8
        setBottomPadding(Math.max(bottomH + 12, 96))
        setScrollMaxHeight(Math.max(260, avail))
      } catch {}
    }
    measure()
    window.addEventListener('resize', measure)
    const id = window.setInterval(measure, 500)
    return () => {
      window.removeEventListener('resize', measure)
      window.clearInterval(id)
    }
  }, [])

  // Set up socket listeners
  useEffect(() => {
    if (!socket) return;

    const getDisplayUsername = (p: { playerId?: string; username?: string; isAi?: boolean }) => {
      const idStr = String(p.playerId || '')
      const isGuest = idStr.startsWith('guest_')
      if (p.isAi) return (p.username && p.username.trim()) || 'AI'
      if (p.username && p.username.trim()) return p.username
      return isGuest ? idStr : (idStr ? idStr.slice(0, 8) + '...' : 'Player')
    }

    const getChickenName = (p: any) => p.chickenId || p.chickenName || 'Default'

    // Track latest version to ignore out-of-order snapshots
    const latestVersionRef = (window as any).__lobby_version_ref || { v: 0 };
    ;(window as any).__lobby_version_ref = latestVersionRef;
    const handleLobbyUpdate = (updatedLobby: any) => {
      console.log('🔄 Lobby updated:', updatedLobby);
      console.log('Current playerIdentifier:', playerIdentifier || publicKey?.toString());
      const incomingV = Number((updatedLobby as any)?.version || 0)
      if (incomingV && incomingV < latestVersionRef.v) {
        console.log('↪️ Ignoring stale lobby update version', incomingV, 'latest is', latestVersionRef.v)
        return
      }
      if (!incomingV && latestVersionRef.v > 0) {
        console.log('↪️ Ignoring unversioned lobby update after versioned snapshots exist')
        return
      }
      if (incomingV) latestVersionRef.v = incomingV
      setLobbyData(updatedLobby);
      
      // Update players list with the lobby data
      if (updatedLobby.players) {
        console.log('Setting players:', updatedLobby.players);
        // Map and dedupe to display format (consistent across sources)
        const seen = new Set<string>()
        const mapped: LobbyPlayer[] = []
        for (const p of updatedLobby.players as any[]) {
          const pid = String(p.playerId || '').toLowerCase()
          if (seen.has(pid)) continue
          seen.add(pid)
          mapped.push({
            playerId: pid,
            username: getDisplayUsername(p),
            chickenName: getChickenName(p),
            isReady: p.isAi ? true : Boolean(p.isReady),
            isAi: !!p.isAi,
          })
        }
        // Stable sort: humans first, then AIs; then by playerId for determinism
        mapped.sort((a, b) => {
          if (a.isAi !== b.isAi) return a.isAi ? 1 : -1
          return a.playerId.localeCompare(b.playerId)
        })
        setPlayers(mapped)
      }
    };

    // Debounced snapshot refresh to avoid roster races
    let refreshTimer: number | null = null
    const requestSnapshotDebounced = () => {
      if (refreshTimer) window.clearTimeout(refreshTimer)
      refreshTimer = window.setTimeout(() => {
        try { socket.emit('get_lobby_state', lobby.id) } catch {}
      }, 200)
    }

    const handlePlayerJoined = (_data: { playerId: string }) => {
      console.log('👋 Player joined (snapshot refresh)');
      requestSnapshotDebounced()
    };

    const handlePlayerLeft = (_data: { playerId: string }) => {
      console.log('👋 Player left (snapshot refresh)');
      requestSnapshotDebounced()
    };

    const handlePlayerReady = (data: { playerId: string, isReady: boolean }) => {
      console.log('✅ Player ready status (snapshot refresh):', data);
      // Reflect local state if it's about me, then request authoritative snapshot
      try {
        const me = getCurrentPlayerId();
        const meNorm = me ? String(me).toLowerCase() : ''
        const pid = String(data.playerId || '').toLowerCase()
        if (me && pid === meNorm && data.isReady) {
          setHasWagered(true);
          setIsReady(true);
        }
      } catch {}
      requestSnapshotDebounced()
    };

    const handleMatchStarting = (data: { countdown: number }) => {
      console.log('🚀 Match starting in:', data.countdown);
      setCountdown(data.countdown);
    };

    const handleMatchStarted = () => {
      console.log('🎮 Match started!');
      transitionedToQueueRef.current = true;
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
    socket.on('round_start', handleMatchStarted);
    socket.on('refresh_lobby_state', handleRefreshLobbyState);

    return () => {
      socket.off('lobby_updated', handleLobbyUpdate);
      socket.off('player_joined_lobby', handlePlayerJoined);
      socket.off('player_left_lobby', handlePlayerLeft);
      socket.off('player_ready_status', handlePlayerReady);
      socket.off('match_starting', handleMatchStarting);
      socket.off('match_started', handleMatchStarted);
      socket.off('round_start', handleMatchStarted);
      socket.off('refresh_lobby_state', handleRefreshLobbyState);
      if (refreshTimer) window.clearTimeout(refreshTimer)
    };
  }, [socket, onStartMatch]);

  // HTTP fallback polling when sockets are unavailable (dev/CORS etc.)
  useEffect(() => {
    const fetchLobbyHttp = async () => {
      try {
        const res = await fetch('/api/lobbies')
        if (!res.ok) return
        const data = await res.json()
        const lobbyFromApi = Array.isArray(data) ? data.find((l: any) => l.id === lobby.id) : null
        if (lobbyFromApi) {
          setLobbyData(lobbyFromApi)
          const mapped = (lobbyFromApi.players || []).map((p: any) => ({
            playerId: p.playerId,
            username: p.username || p.playerId.slice(0, 8) + '...',
            chickenName: p.chickenId || 'Default',
            isReady: p.isAi ? true : false,
            isAi: !!p.isAi,
          }))
          setPlayers(mapped)
        }
      } catch {}
    }

    if (!isConnected) {
      // Start HTTP polling
      fetchLobbyHttp()
      httpPollRef.current = window.setInterval(fetchLobbyHttp, 3000)
      return () => { if (httpPollRef.current) window.clearInterval(httpPollRef.current) }
    } else {
      // If connected, stop fallback polling
      if (httpPollRef.current) window.clearInterval(httpPollRef.current)
    }
  }, [isConnected, lobby.id])

  // Initial lobby data setup - trust server list and dedupe by playerId
  useEffect(() => {
    const id = getCurrentPlayerId();
    if (id && lobbyData.players) {
      if (lobbyData.players.length) {
        // Convert and deduplicate
        const seen = new Set<string>();
        const displayPlayers = lobbyData.players.reduce((acc: LobbyPlayer[], player: any) => {
          const pid = String(player.playerId || '').toLowerCase();
          if (!seen.has(pid)) {
            seen.add(pid);
            acc.push({
              playerId: pid,
              username: player.username || pid.slice(0, 8) + '...',
              chickenName: player.chickenId || 'Default',
              isReady: player.isAi ? true : Boolean((player as any).isReady),
              isAi: !!player.isAi,
            });
          }
          return acc;
        }, []);

        setPlayers(displayPlayers);
        console.log('🎯 Set initial players from lobby data (deduped):', displayPlayers);
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

  // Majority grace seconds left (server-driven)
  const [majoritySeconds, setMajoritySeconds] = useState<number | null>(null)
  const [activeHumans, setActiveHumans] = useState<number>(0)

  // Keep a ref of latest players for cross-effect consistency
  useEffect(() => {
    playersRef.current = players
  }, [players])

  useEffect(() => {
    if (!socket) return
    const onGrace = (payload: { seconds: number }) => setMajoritySeconds(payload.seconds)
    socket.on('majority_grace', onGrace)
    const onActive = (p: any) => {
      try {
        const count = Math.max(0, Number(p?.humans) || 0)
        setActiveHumans(count)
        // If we detect more active humans than currently rendered players, request a fresh lobby snapshot
        if (count > (playersRef.current?.length || 0)) {
          try { socket.emit('get_lobby_state', lobby.id) } catch {}
        }
      } catch {}
    }
    socket.on('active_players', onActive)
    try { socket.emit('get_active_players') } catch {}
    const id = window.setInterval(() => { try { socket.emit('get_active_players') } catch {} }, 5000)
    return () => { socket.off('majority_grace', onGrace); socket.off('active_players', onActive); window.clearInterval(id) }
  }, [socket])

  const handleReadyToggle = async () => {
    if (!socket) return;
    const id = getCurrentPlayerId();
    if (!id) return;

    // If trying to ready up and this is a paid lobby, need to process wager first
    const isPaidLobby = lobby.amount > 0 && lobby.matchType !== 'tutorial';
    
    if (!isReady && isPaidLobby && !hasWagered) {
      // Proactively ensure wallet connected on BSC
      try {
        const eth = (typeof window !== 'undefined') ? (window as any).ethereum : null;
        if (!eth) throw new Error('No EVM provider');
        // Ensure an account is available
        const accts: string[] = await eth.request({ method: 'eth_requestAccounts' });
        if (!accts || !accts[0]) throw new Error('Wallet not connected');
      } catch (e: any) {
        toast.error('Connect your wallet (MetaMask) to ready in ranked');
        return;
      }
      await handleWagerTransaction();
      return;
    }

    // Toggle ready state
    const newReadyState = !isReady;
    console.log(`🎯 Setting ready state to ${newReadyState} for player ${id}`);
    setIsReady(newReadyState);
    // Optimistic update current player in UI list
    const idNorm = String(id).toLowerCase()
    setPlayers(prev => prev.map(p => p.playerId === idNorm ? { ...p, isReady: newReadyState } : p));

    // Try socket first; if not connected, fallback to HTTP PUT
    if (isConnected) {
      socket.emit('player_ready', {
        lobbyId: lobby.id,
        playerId: id,
        isReady: newReadyState
      });
    } else {
      try {
        await fetch('/api/lobbies', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lobbyId: lobby.id, playerId: id, isReady: newReadyState })
        })
      } catch {}
    }
  }

  const handleWagerTransaction = async () => {
    if (!publicKey) {
      toast.error("Connect your wallet first");
      return;
    }

    setIsProcessingWager(true);

    try {
      const wagerResponse = await fetch('/api/wager', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lobbyId: lobby.id,
          playerPublicKey: publicKey.toString(),
        }),
      });

      if (!wagerResponse.ok) {
        const errorData = await wagerResponse.json();
        throw new Error(errorData.error || 'Failed to create wager transaction');
      }

      if (isBsc()) {
        const data = await wagerResponse.json();
        const to: string = data.to;
        const value: string = data.value; // hex-encoded wei

        const eth = (typeof window !== 'undefined') ? (window as any).ethereum : null;
        if (!eth) throw new Error('No EVM provider');
        const from = publicKey.toString();
        const txHash: string = await eth.request({
          method: 'eth_sendTransaction',
          params: [{ from, to, value }],
        });

        const confirmPayload = { lobbyId: lobby.id, signature: txHash, playerPublicKey: from };
        const tryConfirm = async (url: string) => {
          const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(confirmPayload) });
          return res;
        };
        let confirmRes = await tryConfirm('/api/wager/confirm');
        if (!confirmRes.ok) {
          // Retry once after short delay (chain receipt race)
          await new Promise(r => setTimeout(r, 900));
          confirmRes = await tryConfirm('/api/wager/confirm');
        }
        if (!confirmRes.ok) {
          // Absolute URL fallback in case relative /api path is misrouted by CDN
          const absUrl = 'https://www.cockcombat.xyz/api/wager/confirm';
          confirmRes = await tryConfirm(absUrl);
        }
        if (!confirmRes.ok) {
          const err = await confirmRes.json().catch(() => ({} as any));
          throw new Error(err.error || 'Wager confirmation failed');
        }
      } else {
        if (!sendTransaction) throw new Error('Wallet does not support Solana transactions');
        const { transaction: serializedTransaction } = await wagerResponse.json();
        const transaction = Transaction.from(Buffer.from(serializedTransaction, 'base64'));
        const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet';
        const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl(network as 'devnet' | 'testnet' | 'mainnet-beta');
        const connection = new Connection(rpcUrl);
        const signature = await sendTransaction(transaction, connection);
        await connection.confirmTransaction(signature, 'confirmed');

        const confirmRes = await fetch('/api/wager/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lobbyId: lobby.id, signature, playerPublicKey: publicKey.toString() })
        });
        if (!confirmRes.ok) {
          const err = await confirmRes.json();
          throw new Error(err.error || 'Wager confirmation failed');
        }
      }

      toast.success("Wager submitted successfully!");
      setHasWagered(true);
      setIsReady(true);
      // Ensure server connection readiness is updated for countdown logic
      try {
        const me = getCurrentPlayerId();
        if (socket && isConnected && me) {
          socket.emit('player_ready', { lobbyId: lobby.id, playerId: me, isReady: true });
        }
      } catch {}
    } catch (error: any) {
      console.error("❌ Failed to process wager:", error);
      toast.error(`Failed to submit wager: ${error.message}`);
    } finally {
      setIsProcessingWager(false);
    }
  }

  const minRequired = lobby.matchType === 'tutorial' ? 2 : ((lobby.id === 'lobby-0p005' || lobby.id === 'lobby-0.005') ? 2 : 2)
  const paidPlayers = players.filter(p => p.isReady || p.isAi).length
  const allPlayersReady = players.length >= minRequired && players.every(p => p.isReady || p.isAi)
  const currentPlayer = (() => { try { const id = getCurrentPlayerId(); return players.find(p => p.playerId === String(id || '').toLowerCase()) } catch { return undefined } })()

  // Countdown is driven by server 'match_starting' events; no client auto-advance

  return (
    <div ref={rootRef} className="relative h-full w-full flex flex-col bg-gray-900/50 pointer-events-auto" style={{ minHeight: '100dvh' }}>
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

      {/* Majority-ready grace small notice (non-blocking) */}
      {typeof majoritySeconds === 'number' && majoritySeconds > 0 && (
        <div className="absolute top-2 right-2 z-40">
          <div className="px-3 py-1 rounded-md bg-yellow-600/90 text-black text-xs font-bold shadow">
            Majority ready — auto-start in {majoritySeconds}s
          </div>
        </div>
      )}

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

      {/* Majority Grace Notice */}
      <AnimatePresence>
        {majoritySeconds !== null && majoritySeconds > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="absolute top-0 left-0 right-0 bg-yellow-600/90 backdrop-blur-sm p-3 z-40"
          >
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 text-white">
                <Crown className="h-5 w-5" />
                <span className="text-base font-bold pixel-font">MAJORITY READY!</span>
              </div>
              <p className="text-xs text-yellow-100 mt-1">
                Majority players are ready. You have {majoritySeconds} seconds to ready up.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Match Details - Ultra Compact */}
      <div className="flex-shrink-0 p-1.5 bg-gray-800/50 border-b border-gray-700/50">
        <div className="space-y-1 text-[10px]">
          <div className="flex justify-between">
            <span className="text-gray-400">Entry:</span>
            <span className="font-bold text-yellow-400">
              {lobby.amount === 0 ? 'FREE' : `${lobby.amount} ${lobby.currency}`}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Active players:</span>
            <span className="font-bold text-emerald-400">{activeHumans}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Prize:</span>
            <span className="font-bold text-green-400">
              {lobby.amount === 0 ? 'Practice' : `${(lobby.amount * Math.max(paidPlayers, minRequired)).toFixed(2)} ${lobby.currency}`}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Players:</span>
            <span className="font-bold">
              {paidPlayers} paid / {players.length} joined / {lobby.capacity} cap
            </span>
          </div>
        </div>
      </div>

      {/* Players List - Scrollable (pad for bottom bar) */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden p-1.5 pointer-events-auto min-h-0" style={{ paddingBottom: Math.max(bottomPadding, 96), maxHeight: scrollMaxHeight }}>
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

      {/* Bottom Actions - Fixed to bottom to remain visible */}
      <div ref={bottomActionsRef} className="flex-shrink-0 sticky bottom-0 z-10 space-y-1 p-2 bg-gray-900/95 border-t border-gray-700/50">
        {lobby.matchType !== 'tutorial' && (
          <div className="px-2 py-0.5 bg-yellow-900/20 border border-yellow-600/30 rounded-md">
            <p className="text-[9px] text-yellow-400 text-center">Min. 2 players for ranked</p>
          </div>
        )}

        {/* Ready Button Section */}
        <div ref={barRef} className="w-full">
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
          <div className="mt-1 text-center">
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
         {/* Expanded Details - between Ready and Leave buttons */}
         <div className="mt-2 p-2 bg-gray-900/70 border border-gray-700/50 rounded">
           <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-white/80">
             <div>Current Pool</div>
             <div className="text-right font-bold">
               {lobby.amount === 0 ? (
                 <span className="text-gray-300">Practice</span>
               ) : (
                 <span className="text-green-400">{(lobby.amount * Math.max(paidPlayers, minRequired)).toFixed(2)} {lobby.currency}</span>
               )}
             </div>
             <div>Potential Payout</div>
             <div className="text-right font-bold">
               {lobby.amount === 0 ? (
                 <span className="text-gray-300">—</span>
               ) : (
                 <span className="text-yellow-300">{(lobby.amount * Math.max(paidPlayers, minRequired)).toFixed(2)} {lobby.currency}</span>
               )}
             </div>
             <div>Your Status</div>
             <div className="text-right">
               {currentPlayer ? (
                 <>
                   {currentPlayer.isReady ? (
                     <span className="text-green-400 font-semibold">Ready</span>
                   ) : (
                     <span className="text-red-400 font-semibold">Not Ready</span>
                   )}
                   {lobby.amount > 0 && lobby.matchType !== 'tutorial' && (
                     <span className="ml-1 text-[9px] text-white/60">{hasWagered ? '(Wagered)' : '(No Wager)'}</span>
                   )}
                 </>
               ) : (
                 <span className="text-white/60">Not Joined</span>
               )}
             </div>
             {lobby.amount > 0 && (
               <>
                 <div>Escrow</div>
                 <div className="text-right">
                   {(lobby as any)?.escrowWalletId ? (
                     <span className="text-emerald-400">Assigned</span>
                   ) : (
                     <span className="text-white/60">Pending</span>
                   )}
                 </div>
               </>
             )}
             <div>Min Players</div>
             <div className="text-right">{minRequired}</div>
             <div>Capacity</div>
             <div className="text-right">{lobby.capacity}</div>
           </div>
         </div>
          </div>
        </div>

        {/* Leave Lobby Button */}
        <Button
          onClick={onLeaveLobby}
          variant="outline"
          className="w-full h-8 text-xs font-semibold border-2 border-red-500 text-red-400 hover:bg-red-900/30 hover:text-red-300 transition-all pixel-font mt-1"
        >
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
          LEAVE LOBBY
        </Button>
      </div>
    </div>
  )
} 