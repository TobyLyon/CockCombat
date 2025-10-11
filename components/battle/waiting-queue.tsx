"use client"

import { useState, useEffect, useRef } from "react"
import { useWallet } from "@/hooks/use-wallet"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Avatar } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Users, Trophy, AlertCircle, Loader2, Check, Clock } from "lucide-react"
import { truncateAddress, getRandomColor, getRandomChickenName } from "@/lib/utils"
import { Lobby } from "@/lib/lobbies"
import { useSocket } from "@/hooks/use-socket"
import { useGameState } from "@/contexts/GameStateContext"

interface WaitingQueueProps {
  lobby: Lobby;
  onLeaveQueue: () => void;
  onStartBattle: (overrideRoster?: Array<{ playerId: string; username: string; isAi: boolean }>) => void;
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
  const { socket, isConnected } = useSocket()
  const [currentLobby, setCurrentLobby] = useState<Lobby>(lobby);
  // No countdown on the secondary confirmation screen
  const [countdown] = useState<number | null>(null);
  const [allPlayersReady, setAllPlayersReady] = useState(false);
  const { syncLobbyPlayers } = useGameState()
  // Track stable full-roster to auto-advance without asking users to ready again
  const lastCountRef = useRef<number>(0)
  const stableTicksRef = useRef<number>(0)
  // Track match session and a scheduled start to avoid missing socket events during view transition
  const matchSessionIdRef = useRef<string | null>(null)
  const scheduledStartRef = useRef<number | null>(null)
  const startTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const assetsReadyRef = useRef<boolean>(false)
  const lastAssetsAckMsIdRef = useRef<string | null>(null)
  const finalizeFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Cache the most recent roster from queue_begin/arena_lock for reliable start
  const latestRosterRef = useRef<Array<{ wallet: string; isAi?: boolean; username?: string; chickenName?: string }>>([])
  // Expected participants captured at entry (humans + any AIs present at start)
  // For tutorial: expect full capacity (AI will backfill).
  // For ranked: expect at least min humans or the current lobby size at entry.
  const expectedCountRef = useRef<number>(
    lobby.matchType === 'tutorial'
      ? 2
      : Math.max(2, Array.isArray(lobby.players) ? lobby.players.length : 0)
  )

  useEffect(() => {
    // If sockets are connected, rely on realtime updates and skip HTTP polling
    return;
  }, [isConnected, lobby.id, lobby.matchType, onStartBattle, playSound]);

  // No countdown ticking on this screen

  // Listen for queue phase events; advance on round_start (no local countdown display)
  useEffect(() => {
    if (!socket) return
    const onQueueBegin = (payload: any) => {
      // Use provided usernames; guest_* stays literal, wallets are shortened
      const expected = Array.isArray(payload?.expectedRoster) ? payload.expectedRoster : []
      latestRosterRef.current = expected
      try { (window as any).__latest_roster_override = expected.map((p: any) => ({ playerId: p.wallet, username: p.username, isAi: p.isAi })) } catch {}
      try { syncLobbyPlayers(expected.map((p: any) => {
        const idStr = String(p.wallet || '')
        const isGuest = idStr.startsWith('guest_')
        const username = p.isAi ? (p.username || 'AI') : (p.username || (isGuest ? idStr : (idStr ? idStr.slice(0,8)+"..." : '')))
        return { playerId: p.wallet, username, isAi: false }
      })) } catch {}
      // Track session id for subsequent acks/timing
      const prevMsid = matchSessionIdRef.current
      matchSessionIdRef.current = payload?.matchSessionId || null
      try { (window as any).__last_match_session_id = matchSessionIdRef.current } catch {}
      if (matchSessionIdRef.current && matchSessionIdRef.current !== prevMsid) {
        // Reset asset readiness when a new session begins
        assetsReadyRef.current = false
      }
      // Ack presence immediately; defer assets ack until we prefetch essentials
      try {
        const id = (publicKey as any)?.toBase58?.() || (publicKey as any)?.toString?.() || null
        const msid = matchSessionIdRef.current
        if (id && msid) {
          socket.emit('queue_presence', { matchSessionId: msid, wallet: id, latencyMs: 0 })
          // Prefetch minimal arena assets, then send assets_loaded (guarded by current msid)
          const prefetch = async () => {
            const img = (src: string) => new Promise<void>((resolve) => { const i = new Image(); i.onload = () => resolve(); i.onerror = () => resolve(); i.src = src })
            const aud = (src: string) => new Promise<void>((resolve) => { try { const a = new Audio(); a.preload = 'auto'; a.src = src; a.oncanplaythrough = () => resolve(); a.onerror = () => resolve(); } catch { resolve() } })
            const wait = (ms: number) => new Promise(r => setTimeout(r, ms))
            const localMsid = msid
            try {
              await Promise.race([
                Promise.all([
                  img('/images/cock-token.png'),
                  img('/textures/grass/Grass005_1K-PNG_Color.png'),
                  img('/textures/ground/Ground085_1K-PNG_Color.png'),
                ]).then(() => Promise.all([
                  aud('/sounds/arena.mp3'),
                  aud('/sounds/punch.mp3'),
                  aud('/sounds/strong_punch.mp3'),
                  aud('/sounds/jump.mp3'),
                  aud('/sounds/click.mp3'),
                ])),
                wait(4000)
              ])
            } catch {}
            // Only ack for the active session
            if (matchSessionIdRef.current !== localMsid) return
            assetsReadyRef.current = true
            if (lastAssetsAckMsIdRef.current !== localMsid) {
              lastAssetsAckMsIdRef.current = localMsid
              try { socket.emit('assets_loaded', { matchSessionId: localMsid, wallet: id }) } catch {}
            }
          }
          prefetch()
        }
      } catch {}

      // Schedule finalize fallback a bit past ack deadline
      try { if (finalizeFallbackRef.current) { clearTimeout(finalizeFallbackRef.current); finalizeFallbackRef.current = null } } catch {}
    }
    const onArenaLock = (payload: any) => {
      console.log('[WaitingQueue] arena_lock_roster', payload)
      // Replace roster with locked list and keep provided names with guest rule
      const finalR = Array.isArray(payload?.finalRoster) ? payload.finalRoster : []
      latestRosterRef.current = finalR
      try { (window as any).__latest_roster_override = finalR.map((p: any) => ({ playerId: p.wallet, username: p.username, isAi: p.isAi })) } catch {}
    try { syncLobbyPlayers(finalR.map((p: any) => {
        const idStr = String(p.wallet || '')
        const isGuest = idStr.startsWith('guest_')
        const username = p.isAi ? (p.username || 'AI') : (p.username || (isGuest ? idStr : (idStr ? idStr.slice(0,8)+"..." : '')))
      return { playerId: p.wallet, username, isAi: false }
      })) } catch {}
      // Schedule a local start aligned to the server-provided epoch to avoid missing 'match_started' during screen transition
      try {
        if (startTimerRef.current) { clearTimeout(startTimerRef.current); startTimerRef.current = null }
        const startAt = Number(payload?.roundStartAtEpochMs) || 0
        try { if (startAt > 0) (window as any).__last_round_start_at = startAt } catch {}
        if (startAt > 0) {
          const delay = Math.max(0, startAt - Date.now() + 100)
          scheduledStartRef.current = Date.now() + delay
          startTimerRef.current = setTimeout(() => {
            try { playSound('button') } catch {}
            onStartBattle()
          }, delay)
        }
        if (finalizeFallbackRef.current) { clearTimeout(finalizeFallbackRef.current); finalizeFallbackRef.current = null }
      } catch {}
    }
    const onStarted = (payload?: any) => {
      console.log('[WaitingQueue] round_start/match_started received')
      try {
        const fr = Array.isArray((payload as any)?.finalRoster) ? (payload as any).finalRoster : []
        if (fr.length > 0) {
          latestRosterRef.current = fr
          try { (window as any).__latest_roster_override = fr.map((p: any) => ({ playerId: p.wallet, username: p.username, isAi: p.isAi })) } catch {}
          try { syncLobbyPlayers(fr.map((p: any) => ({ playerId: p.wallet, username: p.username, isAi: p.isAi }))) } catch {}
        }
      } catch {}
      try { playSound('button') } catch {}
      // Ensure we have a roster before starting
      try {
        const cached = latestRosterRef.current || []
        if ((!Array.isArray(players) || players.length === 0) && cached.length > 0) {
          try { syncLobbyPlayers(cached.map((p: any) => ({ playerId: p.wallet, username: p.username, isAi: p.isAi }))) } catch {}
        } else if ((!Array.isArray(players) || players.length === 0) && Array.isArray(currentLobby?.players) && currentLobby.players.length > 0) {
          try { syncLobbyPlayers(currentLobby.players.map((p: any) => ({ playerId: p.playerId, username: p.username, isAi: p.isAi }))) } catch {}
        }
      } catch {}
      // Cancel any scheduled start if server event arrives
      if (startTimerRef.current) { clearTimeout(startTimerRef.current); startTimerRef.current = null }
      if (finalizeFallbackRef.current) { clearTimeout(finalizeFallbackRef.current); finalizeFallbackRef.current = null }
      // Slight delay to allow any sync above to apply; if still empty, retry fetching up to 1.5s
      const startWithOverride = () => {
        try {
          const cached = Array.isArray(latestRosterRef.current) ? latestRosterRef.current : []
          const override = (cached.length > 0
            ? cached.map((p: any) => ({ playerId: p.wallet, username: p.username, isAi: p.isAi }))
            : (Array.isArray(currentLobby?.players) ? currentLobby.players.map((p: any) => ({ playerId: p.playerId, username: p.username, isAi: p.isAi })) : []))
          onStartBattle(override)
        } catch {
          onStartBattle()
        }
      }
      startWithOverride()
    }
    socket.on('queue_begin', onQueueBegin)
    socket.on('arena_lock_roster', onArenaLock)
    socket.on('round_start', onStarted)
    socket.on('match_started', onStarted)
    // no secondary countdown overlay here; arena scene shows the countdown
    // Join the match room for realtime sync using session id
    // Ensure we join the match room on both queue_begin and arena_lock_roster to avoid missing start on one device
    const onQueueBeginJoin = (payload: any) => {
      try {
        const msid = payload?.matchSessionId
        if (msid) socket.emit('join_match_room', { matchSessionId: msid })
      } catch {}
    }
    const onArenaLockJoinRoom = (payload: any) => {
      try {
        const msid = payload?.matchSessionId
        if (msid) socket.emit('join_match_room', { matchSessionId: msid })
      } catch {}
    }
    socket.on('queue_begin', onQueueBeginJoin)
    socket.on('arena_lock_roster', onArenaLockJoinRoom)
    const onDebug = (p: any) => console.log('[MATCH][DEBUG]', p)
    socket.on('debug_trace', onDebug)
    return () => {
      socket.off('queue_begin', onQueueBegin)
      socket.off('queue_begin', onQueueBeginJoin)
      socket.off('arena_lock_roster', onArenaLockJoinRoom)
      socket.off('arena_lock_roster', onArenaLock)
      socket.off('round_start', onStarted)
      socket.off('match_started', onStarted)
      socket.off('debug_trace', onDebug)
      if (startTimerRef.current) { clearTimeout(startTimerRef.current); startTimerRef.current = null }
      if (finalizeFallbackRef.current) { clearTimeout(finalizeFallbackRef.current); finalizeFallbackRef.current = null }
    }
  }, [socket, isConnected, onStartBattle, playSound])

  // Listen for lobby roster updates over socket (server truth), with refresh requests
  useEffect(() => {
    if (!socket || !isConnected) return

    const onLobbyUpdated = (payload: any) => {
      console.log('[WaitingQueue] lobby_updated received:', payload)
      if (!payload || payload.id !== lobby.id) {
        console.log('[WaitingQueue] Ignoring lobby_updated - wrong lobby or no payload', { payloadId: payload?.id, expectedId: lobby.id })
        return
      }
      // Merge only the fields we expect; keep existing fields like highRoller/status
      let mergedPlayersLocal: any[] = []
      setCurrentLobby(prev => {
        const nextPlayers = Array.isArray(payload.players) ? payload.players : prev.players;
        // Prevent regressions (e.g., falling back to HTTP with smaller list overwriting socket state)
        // Merge by playerId to avoid disappearing entries on quick-ready updates
        const byId = new Map<string, any>(Array.isArray(prev.players) ? prev.players.map((p:any) => [String(p.playerId), p]) : [])
        for (const p of (Array.isArray(nextPlayers) ? nextPlayers : [])) {
          byId.set(String(p.playerId), { ...(byId.get(String(p.playerId))||{}), ...p })
        }
        const mergedPlayers = Array.from(byId.values())
        mergedPlayersLocal = mergedPlayers
        return {
          ...prev,
          players: mergedPlayers,
          capacity: typeof payload.capacity === 'number' ? payload.capacity : prev.capacity,
          amount: typeof payload.amount === 'number' ? payload.amount : prev.amount,
          currency: typeof payload.currency === 'string' ? payload.currency : prev.currency,
          matchType: (payload.matchType as any) || prev.matchType,
        } as Lobby;
      })
      // Sync roster to game state for spawning (connected-only semantics)
      try { syncLobbyPlayers((mergedPlayersLocal || []).map((p: any) => ({ playerId: p.playerId, username: p.username, chickenName: p.chickenName, isAi: p.isAi }))) } catch {}
      console.log('[WaitingQueue] Updated currentLobby players:', (payload.players || []).length || 0)
    }

    const onLobbySync = (_payload: any) => {}

    // no refresh_lobby_state hooks

    socket.on('lobby_updated', onLobbyUpdated)
    socket.on('lobby_synced', onLobbySync)
    // no refresh_lobby_state hooks

    return () => {
      socket.off('lobby_updated', onLobbyUpdated)
      socket.off('lobby_synced', onLobbySync)
      // no refresh_lobby_state cleanup
    }
  }, [socket, isConnected, lobby.id, lobby.matchType, currentLobby.players])

  // Ensure we are in the lobby room while on the waiting screen
  useEffect(() => {
    if (!socket || !isConnected) return
    // register wallet only (no cached guest id fallback)
    try {
      const id = (publicKey as any)?.toBase58?.() || (publicKey as any)?.toString?.() || null
      if (id) socket.emit('register_wallet', id)
    } catch {}
    socket.emit('join_lobby_room', lobby.id)
    try { (window as any).currentLobbyId = lobby.id } catch {}
    return () => {
      socket.emit('leave_lobby_room', lobby.id)
      try { if ((window as any).currentLobbyId === lobby.id) (window as any).currentLobbyId = undefined } catch {}
    }
  }, [socket, isConnected, lobby.id, publicKey])

  // The backend now provides the full player list, so we can use it directly.
  const players = currentLobby.players;
  
  // Remove immediate local start; rely on arena_lock_roster schedule or server round_start
  
  return (
    <div className="bg-[#333333] border-4 border-[#222222] rounded-lg p-4 lg:p-6 max-w-6xl w-full mx-auto max-h-full overflow-hidden relative">
      {/* No countdown overlay on this screen; arena handles countdown */}

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
                 <span>2 players minimum to start.</span>
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
