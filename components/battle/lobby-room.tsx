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
  // Client no longer maintains its own lobby snapshot; rely on server events only
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
      // Do not fallback to cached guest id; only use explicit playerIdentifier
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
      try { (window as any).currentLobbyId = lobby.id } catch {}
      
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
      
      // Tutorial-only: request ghost pruning on join to clear stale guest entries
      try { if (lobby.matchType === 'tutorial') socket.emit('prune_ghosts', lobby.id) } catch {}

      // No client snapshots; rely on server-driven roster_full/roster_diff events

      const cleanup = () => {
        // no snapshot timers to clear
        // If we already transitioned to queue (second check), keep room membership during handoff
        if (!transitionedToQueueRef.current) {
          console.log(`🚪 Leaving lobby room: ${lobby.id}`);
          socket.emit('leave_lobby_room', lobby.id);
        } else {
          console.log(`⏸️ Preserving lobby room membership during queue transition: ${lobby.id}`);
        }
        try { if ((window as any).currentLobbyId === lobby.id) (window as any).currentLobbyId = undefined } catch {}
      };
      window.addEventListener('beforeunload', cleanup)
      return () => {
        window.removeEventListener('beforeunload', cleanup)
        cleanup()
      };
    }
  }, [socket, isConnected, lobby.id]);

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
      // Always prefer server-provided username; do not fallback to wallet when a username exists
      if (p.isAi) return (p.username && p.username.trim()) || 'AI'
      if (p.username && p.username.trim()) return p.username
      const idStr = String(p.playerId || '')
      const isGuest = idStr.startsWith('guest_')
      return isGuest ? idStr : (idStr ? idStr.slice(0, 8) + '...' : 'Player')
    }

    const getChickenName = (p: any) => p.chickenId || p.chickenName || 'Default'

    // Removed snapshot-based lobby update handling; server events are authoritative
    const handleLobbyUpdate = (updatedLobby: any) => {
      console.log('🔄 Lobby updated:', updatedLobby);
      console.log('Current playerIdentifier:', playerIdentifier || publicKey?.toString());
      // Ignore snapshots not meant for this lobby (safety against cross-room races)
      try { if (updatedLobby && updatedLobby.id && updatedLobby.id !== lobby.id) return } catch {}
      setPlayers((updatedLobby?.players || []).map((p: any) => ({
        playerId: String(p.playerId || '').toLowerCase(),
        username: (p.username && p.username.trim()) || (String(p.playerId || '').slice(0,8)+'...'),
        chickenName: p.chickenId || p.chickenName || 'Default',
        isReady: p.isAi ? true : Boolean(p.isReady),
        isAi: !!p.isAi,
      })))
    };

    // Lightweight join/leave handlers (no snapshots)
    const handlePlayerJoined = (_data: { playerId: string }) => {
      console.log('👋 Player joined');
    };

    const handlePlayerLeft = (_data: { playerId: string }) => {
      console.log('👋 Player left');
    };

    const handlePlayerReady = (data: any) => {
      console.log('✅ Player ready status:', data);
      // Reflect local state if it's about me
      try {
        // Guard by lobby
        const eventLobbyId = String((data && (data as any).lobbyId) || '')
        if (eventLobbyId && eventLobbyId !== lobby.id) return
        const me = getCurrentPlayerId();
        const meNorm = me ? String(me).toLowerCase() : ''
        const pid = String(data.playerId || '').toLowerCase()
        if (me && pid === meNorm) {
          setIsReady(Boolean(data.isReady));
        }
        // Apply immediate badge update for the affected player while waiting for full snapshot
        setPlayers(prev => prev.map(p => p.playerId === pid ? { ...p, isReady: Boolean(data.isReady) } : p))
      } catch {}
    };

    const handleMatchStarting = (data: { countdown: number }) => {
      console.log('🚀 Match starting in:', data.countdown);
      setCountdown(data.countdown);
    };

    const handleMatchStarted = () => {
      console.log('🎮 Match started!');
      transitionedToQueueRef.current = true;
      // Reset local wager/ready flags at round start; next round requires new wager
      try { setHasWagered(false); } catch {}
      try { setIsReady(false); } catch {}
      onStartMatch();
    };

    // No snapshot listeners; server roster events are authoritative
    const onRosterFull = (payload: any) => {
      try {
        if (!payload || payload.lobbyId !== lobby.id) return
        const players: LobbyPlayer[] = (payload.players || []).map((p: any) => ({
          playerId: String(p.playerId || '').toLowerCase(),
          username: p.username || (String(p.playerId||'').slice(0,8)+'...'),
          chickenName: p.chickenName || 'Default',
          isReady: !!p.isReady,
          isAi: !!p.isAi,
        }))
        // Stable sort
        players.sort((a,b)=> (a.isAi!==b.isAi? (a.isAi?1:-1) : a.playerId.localeCompare(b.playerId)))
        setPlayers(players)
      } catch {}
    }
    const onRosterDiff = (payload: any) => {
      try {
        if (!payload || payload.lobbyId !== lobby.id) return
        const { action, player } = payload
        const pid = String(player?.playerId || '').toLowerCase()
        // If this diff is about me, sync local hasWagered flag from server
        try {
          const me = getCurrentPlayerId()
          if (me && pid === String(me).toLowerCase()) {
            setHasWagered(Boolean(player?.hasWagered))
            setIsReady(Boolean(player?.isReady))
          }
        } catch {}
        setPlayers(prev => {
          const map = new Map(prev.map(p=>[p.playerId,p]))
          if (action === 'remove') {
            map.delete(pid)
          } else {
            map.set(pid, {
              playerId: pid,
              username: player?.username || (pid ? pid.slice(0,8)+'...' : 'Player'),
              chickenName: player?.chickenName || 'Default',
              isReady: !!player?.isReady,
              isAi: !!player?.isAi,
            })
          }
          const arr = Array.from(map.values())
          arr.sort((a,b)=> (a.isAi!==b.isAi? (a.isAi?1:-1) : a.playerId.localeCompare(b.playerId)))
          return arr
        })
      } catch {}
    }
    socket.on('roster_full', onRosterFull)
    socket.on('roster_diff', onRosterDiff)
    socket.on('player_joined_lobby', handlePlayerJoined);
    socket.on('player_left_lobby', handlePlayerLeft);
    socket.on('player_ready_status', handlePlayerReady);
    socket.on('match_starting', handleMatchStarting);
    socket.on('match_started', handleMatchStarted);
    socket.on('round_start', handleMatchStarted);
    // no refresh_lobby_state listener

    return () => {
      // no snapshot handlers to remove
      socket.off('roster_full', onRosterFull)
      socket.off('roster_diff', onRosterDiff)
      socket.off('player_joined_lobby', handlePlayerJoined);
      socket.off('player_left_lobby', handlePlayerLeft);
      socket.off('player_ready_status', handlePlayerReady);
      socket.off('match_starting', handleMatchStarting);
      socket.off('match_started', handleMatchStarted);
      socket.off('round_start', handleMatchStarted);
      // no refresh timer
    };
  }, [socket, onStartMatch]);

  // Removed snapshot-based HTTP fallbacks and initial snapshot; server events are authoritative

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

  // Derive my local ready state from authoritative server snapshot
  useEffect(() => {
    try {
      const id = getCurrentPlayerId()
      if (!id) return
      const meNorm = String(id).toLowerCase()
      const mine = players.find(p => p.playerId === meNorm)
      setIsReady(Boolean(mine?.isReady))
    } catch {}
  }, [players])

  useEffect(() => {
    if (!socket) return
    const onGrace = (payload: { seconds: number }) => setMajoritySeconds(payload.seconds)
    socket.on('majority_grace', onGrace)
    const onLobbyCounts = (payload: any) => {
      try {
        if (!payload || payload.id !== lobby.id) return
        const humans = Math.max(0, Number(payload?.liveHumans) || 0)
        const fallback = (() => { try { return (playersRef.current || []).filter(p => !p.isAi).length } catch { return humans } })()
        setActiveHumans(humans > 0 ? humans : fallback)
      } catch {}
    }
    socket.on('lobby_counts', onLobbyCounts)
    const onCountsSnapshot = (payload: any) => {
      try {
        const map = (payload && payload.counts) || {}
        const rec = map && map[lobby.id]
        const humans = Math.max(0, Number(rec?.liveHumans) || 0)
        const fallback = (() => { try { return (playersRef.current || []).filter(p => !p.isAi).length } catch { return humans } })()
        setActiveHumans(humans > 0 ? humans : fallback)
      } catch {}
    }
    socket.on('lobby_counts_snapshot', onCountsSnapshot)
    try { socket.emit('get_lobby_counts') } catch {}
    return () => { socket.off('majority_grace', onGrace); socket.off('lobby_counts', onLobbyCounts); socket.off('lobby_counts_snapshot', onCountsSnapshot) }
  }, [socket])

  const handleReadyToggle = async () => {
    if (!socket) return;
    const id = (() => { const raw = getCurrentPlayerId(); return raw ? String(raw).toLowerCase() : raw; })();
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

    // Desired ready state; server remains authoritative (no optimistic flip)
    const newReadyState = !isReady;
    console.log(`🎯 Requesting ready state ${newReadyState} for player ${id}`);

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
        const gas: string | undefined = data.gas; // optional hex
        const gasPrice: string | undefined = data.gasPrice; // optional hex

        const eth = (typeof window !== 'undefined') ? (window as any).ethereum : null;
        if (!eth) throw new Error('No EVM provider');
        // Ensure wallet connected and on BSC
        try { await eth.request({ method: 'eth_requestAccounts' }); } catch {}
        let chainId: string | undefined;
        try { chainId = await eth.request({ method: 'eth_chainId' }); } catch {}
        if (chainId && chainId.toLowerCase() !== '0x38') {
          try {
            await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x38' }] });
          } catch (e: any) {
            if (e && (e.code === 4902 || e.code === -32603)) {
              try {
                await eth.request({ method: 'wallet_addEthereumChain', params: [{ chainId: '0x38', chainName: 'BNB Smart Chain', nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 }, rpcUrls: ['https://bsc-dataseed.binance.org/'], blockExplorerUrls: ['https://bscscan.com'] }] });
              } catch {}
            }
          }
        }
        const accts: string[] = await eth.request({ method: 'eth_requestAccounts' });
        const from = (accts && accts[0]) ? accts[0] : publicKey.toString();
        const txParams: Record<string, string> = { from, to, value };
        // Gas/gasPrice fallbacks for wallets that require explicit fields
        let gasToUse = gas;
        let gasPriceToUse = gasPrice;
        if (!gasToUse) {
          try { gasToUse = await eth.request({ method: 'eth_estimateGas', params: [{ from, to, value }] }); } catch {}
        }
        if (!gasPriceToUse) {
          try { gasPriceToUse = await eth.request({ method: 'eth_gasPrice' }); } catch {}
        }
        if (!gasToUse) gasToUse = '0x5208'; // 21000 fallback for simple transfer
        if (gasToUse) txParams.gas = gasToUse;
        if (gasPriceToUse) txParams.gasPrice = gasPriceToUse;
        const txHash: string = await eth.request({
          method: 'eth_sendTransaction',
          params: [txParams],
        });

        const confirmPayload = { lobbyId: lobby.id, signature: txHash, playerPublicKey: String(from || '').toLowerCase() };
        const tryConfirm = async (url: string) => {
          const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(confirmPayload) });
          return res;
        };
        let confirmRes = await tryConfirm('/api/wager/confirm');
        if (!confirmRes.ok) {
          // Retry once after short delay (chain receipt race)
          await new Promise(r => setTimeout(r, 1800));
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

  // Countdown is driven by server; no client nudges

  return (
    <div ref={rootRef} className="relative h-full w-full flex flex-col bg-gray-900/50 pointer-events-auto" style={{ minHeight: '100dvh' }}>
      {/* Countdown Overlay - restored retro minimal style */}
      <AnimatePresence>
        {countdown !== null && countdown > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/80 flex items-center justify-center z-50"
          >
            <div className="flex flex-col items-center">
              <div className="text-base sm:text-xl md:text-2xl font-extrabold text-white pixel-font drop-shadow-[4px_4px_0_rgba(0,0,0,0.85)] whitespace-nowrap text-center mb-1">
                MATCH STARTING
              </div>
              <motion.div
                key={countdown}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 1.1, opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="text-7xl sm:text-9xl font-bold text-yellow-400 pixel-font drop-shadow-[4px_4px_0_rgba(0,0,0,0.8)]"
              >
                {countdown}
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
          
          {/* Placeholder slots up to capacity (max 8) */}
          {Array.from({ length: Math.max(0, Math.min(lobby.capacity || 8, 8) - players.length) }).map((_, i) => (
            <div key={`slot-${i}`} className="flex items-center justify-between p-2 rounded border border-dashed border-gray-600/50 bg-gray-800/20">
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold bg-gray-600">?
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-semibold truncate text-gray-400">Empty Slot</span>
                  </div>
                  <p className="text-[10px] text-gray-500 truncate">Waiting for player...</p>
                </div>
              </div>
              <div className="flex-shrink-0">
                <Badge variant="outline" className="border-gray-600 text-gray-500 text-[10px] px-1.5 py-0.5">
                  <Clock className="mr-0.5 h-2.5 w-2.5" />
                  Open
                </Badge>
              </div>
            </div>
          ))}
          
          {/* No AI placeholders */}
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