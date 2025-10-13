const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');

// Validate environment variables on startup
try {
  const { printEnvironmentStatus, checkForSecurityIssues } = require('./lib/env-validator.ts');
  printEnvironmentStatus();
  
  const securityIssues = checkForSecurityIssues();
  if (securityIssues.length > 0) {
    console.error('🚨 SECURITY ISSUES DETECTED:\n');
    securityIssues.forEach(issue => console.error(`   ❌ ${issue}`));
    console.error('\n');
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  }
} catch (error) {
  console.warn('⚠️  Could not validate environment:', error.message);
}

const socketOnly = process.env.SOCKET_ONLY === 'true';
const dev = socketOnly ? true : process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = process.env.PORT || 3000;

// Create request handler (Next.js in normal mode; stub in SOCKET_ONLY mode)
let handle;
let preparePromise;
if (socketOnly) {
  handle = async (req, res) => {
    try {
      // Minimal OK for health checks; real API is on Vercel
      res.statusCode = 200;
      res.end('ok');
    } catch (e) {
      res.statusCode = 500;
      res.end('internal server error');
    }
  };
  preparePromise = Promise.resolve();
} else {
  const app = next({ dev, hostname, port });
  handle = app.getRequestHandler();
  preparePromise = app.prepare();
}

// Active connections and game rooms
const activeConnections = new Map();
const gameRooms = new Map();

// Make gameRooms globally accessible for API routes
global.gameRooms = gameRooms;

// Username cache to reduce database queries
const usernameCache = new Map();
async function getUsernameForWallet(wallet) {
  try {
    const key = String(wallet || '');
    if (!key) return '';
    const cached = usernameCache.get(key);
    if (cached && (Date.now() - cached.ts) < CACHE_TTL) return cached.name;
                const baseUrl = `http://localhost:${port}`;
    const res = await fetch(`${baseUrl}/api/profile/${encodeURIComponent(key)}`).catch(() => null);
    let name = null;
    if (res && res.ok) {
      try { const data = await res.json(); name = (data && data.username) ? String(data.username) : null; } catch {}
    }
    if (!name) name = `${key.slice(0,8)}...`;
    usernameCache.set(key, { name, ts: Date.now() });
    return name;
  } catch {
    try {
      const key = String(wallet || '');
      const fallback = key ? `${key.slice(0,8)}...` : '';
      usernameCache.set(key, { name: fallback, ts: Date.now() });
      return fallback;
    } catch { return ''; }
  }
}
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

preparePromise.then(() => {
  const httpServer = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  });

  // Initialize Socket.io
  const io = new Server(httpServer, {
    path: '/api/socketio',
    addTrailingSlash: false,
    cors: {
      origin: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    // Performance optimizations
    pingTimeout: 60000,        // 60 seconds before considering connection dead
    pingInterval: 25000,       // Ping every 25 seconds to keep connection alive
    upgradeTimeout: 10000,     // 10 seconds for WebSocket upgrade
    maxHttpBufferSize: 1e6,    // 1MB max message size
    transports: ['websocket', 'polling'],
    perMessageDeflate: false,  // Disable compression to save CPU
  });

  // Store the socket instance globally so API routes can access it
  global.socketIo = io;

  console.log('🚀 Socket.io server initialized');
  // Print loaded escrow wallets (if any)
  try {
    const evm = require('./lib/evm-escrow-service.ts');
    const svc = evm && (evm.evmEscrowService || evm.default);
    const list = svc && svc.getWallet ? ['A','B','C'].map(id => svc.getWallet(id)).filter(Boolean) : [];
    if (Array.isArray(list) && list.length > 0) {
      console.log('🔐 Loaded EVM escrow wallets (runtime):', list.map(w => `${w.id}:${String(w.address).slice(0,6)}…${String(w.address).slice(-4)}`).join(', '));
    } else {
      console.warn('⚠️ No EVM escrow wallets available at runtime');
    }
  } catch {}

  // --- Payout Reconciliation Job ---
  // Periodically find completed matches without processed payouts and trigger server-side payout
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const payoutSecret = process.env.PAYOUT_SERVER_SECRET;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${port}`;
    if (supabaseUrl && supabaseServiceKey && payoutSecret) {
      const { createClient } = require('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      const reconcile = async () => {
        try {
          const { data: rows } = await supabase
            .from('match_results')
            .select('id,winner_wallet,total_prize_pool,payout_processed,status')
            .eq('status', 'completed')
            .eq('payout_processed', false)
            .limit(20);
          if (Array.isArray(rows) && rows.length > 0) {
            for (const r of rows) {
              try {
                const resp = await fetch(`${baseUrl}/api/payout`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${payoutSecret}` },
                  body: JSON.stringify({ winnerAddress: r.winner_wallet, prizePool: r.total_prize_pool, matchId: r.id }),
                }).catch(() => null);
                if (resp && resp.ok) {
                  console.log('🧾 reconciled_payout', { matchId: r.id });
                } else {
                  const txt = resp ? await resp.text().catch(() => '') : 'no response';
                  console.warn('⚠️ reconcile_failed', { matchId: r.id, details: txt });
                }
              } catch (e) {
                console.warn('reconcile error', r?.id, e?.message || e);
              }
            }
          }
        } catch (e) {
          console.warn('reconcile query error', e?.message || e);
        }
      };
      // Run soon after startup and periodically
      setTimeout(reconcile, 5000);
      setInterval(reconcile, 60 * 1000);
    }
  } catch {}

  // Initialize global readyTimers map used by tutorial lobby countdowns
  if (!global.readyTimers) {
    global.readyTimers = Object.create(null);
  }

  // Pre-countdown visibility timers and active countdown flags
  if (!global.preCountdownTimers) {
    global.preCountdownTimers = Object.create(null);
  }
  if (!global.countdownActive) {
    global.countdownActive = Object.create(null);
  }

  // Presence map: lobbyId -> Set of wallet addresses currently in the socket room
  if (!global.lobbyPresence) {
    global.lobbyPresence = new Map();
  }
  // Proactively clear any stale caches for the low-paid lobby on boot
  try { global.lobbyPresence.delete && global.lobbyPresence.delete('lobby-0.005'); global.lobbyPresence.delete && global.lobbyPresence.delete('lobby-0p005'); } catch {}
  // Helper: compute live counts from activeConnections (authoritative)
  function getLobbyCounts(lobbyId) {
    try {
      const seenWallets = new Set();
      let humans = 0;
      let total = 0;
      for (const [, conn] of activeConnections.entries()) {
        if (!conn) continue;
        // Must be in the logical lobby and actually joined to the Socket.IO room
        const inLobby = conn.currentLobby === lobbyId;
        const inRoom = (() => { try { return conn.socket && conn.socket.rooms && conn.socket.rooms.has && conn.socket.rooms.has(lobbyId); } catch { return false; } })();
        if (!inLobby || !inRoom) continue;
        const addrRaw = String(conn.walletAddress || '').trim();
        if (!addrRaw) continue;
        const addr = addrRaw.toLowerCase();
        if (seenWallets.has(addr)) continue; // dedupe multiple tabs for same wallet
        seenWallets.add(addr);
        total += 1;
        if (!addr.startsWith('ai-')) humans += 1;
      }
      return { humans, total };
    } catch { return { humans: 0, total: 0 }; }
  }
  // Helper: compute global active humans (browsing/queued/in lobbies)
  function getGlobalActiveHumans() {
    try {
      const seenWallets = new Set();
      let humans = 0;
      for (const [, conn] of activeConnections.entries()) {
        if (!conn) continue;
        const addrRaw = String(conn.walletAddress || '').trim();
        if (!addrRaw) continue;
        const addr = addrRaw.toLowerCase();
        if (addr.startsWith('ai-')) continue;
        if (seenWallets.has(addr)) continue;
        // Count anyone connected who is not spectating
        if (conn.socket && conn.socket.connected && !conn.isSpectator) {
          humans += 1;
          seenWallets.add(addr);
        }
      }
      return humans;
    } catch { return 0; }
  }
  // Queue session tracking: matchSessionId -> session data
  if (!global.queueSessions) {
    global.queueSessions = new Map();
  }
  if (!global.activeQueueForLobby) {
    global.activeQueueForLobby = new Map();
  }
  if (!global.queueLocks) {
    global.queueLocks = new Map();
  }
  if (!global.lobbyVersions) {
    global.lobbyVersions = new Map();
  }
  // Authoritative roster per lobby (socket-only)
  if (!global.lobbyRoster) {
    global.lobbyRoster = new Map(); // lobbyId -> Map<walletLower, entry>
  }
  // Helper to consistently bump and retrieve lobby version for snapshots
  function nextLobbyVersion(lobbyId) {
    try {
      const cur = (global.lobbyVersions.get(lobbyId) || 0) + 1;
      global.lobbyVersions.set(lobbyId, cur);
      return cur;
    } catch {
      return 1;
    }
  }

  // Build an authoritative lobby snapshot with stable readiness and usernames
  async function buildLobbySnapshot(lobbyId) {
    try {
      const lobby = lobbies.find(l => l && l.id === lobbyId);
      if (!lobby) return null;

      // Presence set for fast lookup
      const present = new Set();
      try {
        for (const [, c] of activeConnections.entries()) {
          if (c && c.currentLobby === lobbyId && c.walletAddress) {
            present.add(String(c.walletAddress).toLowerCase());
          }
        }
      } catch {}

      const isTutorial = lobby.matchType === 'tutorial';
      const result = [];
      for (const p of (lobby.players || [])) {
        const pid = String(p.playerId || '');
        if (!pid) continue;
        const pidNorm = pid.toLowerCase();
        const human = !p.isAi;
        const inPresence = present.has(pidNorm);

        // Ranked: include humans only if present or have wagered (prevents stale ghosts); AI always included
        if (!isTutorial && human && !(inPresence || Boolean(p.hasWagered))) {
          continue;
        }

        // Username hydration (cache backed)
        let name = (p.username && p.username.trim().length > 0) ? p.username : await getUsernameForWallet(pid);
        try { if (!p.username || p.username !== name) p.username = name } catch {}

        // Readiness policy
        let isReady = false;
        if (p.isAi) {
          isReady = true;
        } else if (!isTutorial) {
          isReady = Boolean(p.hasWagered);
        } else {
          // tutorial: rely on connection readiness when available
          try {
            for (const [, c] of activeConnections.entries()) {
              if (c && c.currentLobby === lobbyId && String(c.walletAddress || '').toLowerCase() === pidNorm) { isReady = !!c.isReady; break }
            }
          } catch {}
        }

        result.push({
          playerId: pid,
          username: name,
          chickenName: p.chickenId || 'Default',
          isReady,
          isAi: !!p.isAi,
        });
      }

      // Merge presence extras not yet reflected in API list (prevents empty UI when API lags)
      try {
        const existing = new Set(result.map(r => String(r.playerId || '').toLowerCase()));
        for (const addrRaw of present.values()) {
          const addr = String(addrRaw || '').toLowerCase();
          if (!addr || existing.has(addr)) continue;
          let name = await getUsernameForWallet(addr).catch(() => null);
          if (!name || !String(name).trim()) name = addr.slice(0, 8) + '...';
          let ready = false;
          if (isTutorial) {
            try {
              for (const [, c] of activeConnections.entries()) {
                if (c && c.currentLobby === lobbyId && String(c.walletAddress || '').toLowerCase() === addr) { ready = !!c.isReady; break }
              }
            } catch {}
          } else {
            // Non-tutorial: include present humans as not-ready until API marks wagered
            ready = false;
          }
          result.push({
            playerId: addr,
            username: name,
            chickenName: 'Default',
            isReady: ready,
            isAi: false,
          });
        }
      } catch {}

      return {
        id: lobbyId,
        players: result,
        capacity: lobby.capacity,
        amount: lobby.amount,
        currency: lobby.currency,
        matchType: lobby.matchType,
      };
    } catch {
      return null;
    }
  }

  // Expose helpers for API routes
  try { (global).__buildLobbySnapshot = buildLobbySnapshot } catch {}

  function getRosterMap(lobbyId) {
    let map = global.lobbyRoster.get(lobbyId);
    if (!map) { map = new Map(); global.lobbyRoster.set(lobbyId, map); }
    return map;
  }
  async function upsertRoster(lobbyId, wallet, patch) {
    const map = getRosterMap(lobbyId);
    const key = String(wallet || '').toLowerCase();
    const current = map.get(key) || { playerId: wallet, username: (wallet ? String(wallet).slice(0,8)+'...' : 'Player'), chickenName: 'Default', isAi: false, hasWagered: false, isReady: false };
    const entry = { ...current, ...patch, playerId: String(wallet) };
    // Rank readiness policy: if ranked and human, prefer hasWagered
    try {
      const lobby = lobbies.find(l => l && l.id === lobbyId);
      if (lobby && lobby.matchType !== 'tutorial' && !entry.isAi) {
        entry.isReady = Boolean(entry.hasWagered);
      }
    } catch {}
    map.set(key, entry);
    return entry;
  }
  function removeFromRoster(lobbyId, wallet) {
    const map = getRosterMap(lobbyId);
    const key = String(wallet || '').toLowerCase();
    map.delete(key);
  }
  function emitRosterDiff(io, lobbyId, action, entry) {
    try { io.to(lobbyId).emit('roster_diff', { lobbyId, action, player: entry }); } catch {}
  }
  try { global.activeQueueForLobby.delete && global.activeQueueForLobby.delete('lobby-0.005'); global.activeQueueForLobby.delete && global.activeQueueForLobby.delete('lobby-0p005'); } catch {}
  try { global.lobbyVersions.delete && global.lobbyVersions.delete('lobby-0.005'); global.lobbyVersions.delete && global.lobbyVersions.delete('lobby-0p005'); } catch {}

  // Socket.io connection handling
  io.on('connection', (socket) => {
    console.log(`✅ Client connected: ${socket.id}`);
    activeConnections.set(socket.id, { 
      socket, 
      status: 'idle',
      joinedAt: Date.now(),
      lastLobbyActivity: Date.now()
    });

    // Handle registration of wallet address to socket connection
    socket.on('register_wallet', (walletAddress) => {
      // Normalize to lowercase for consistent identity matching
      const normalized = (walletAddress && typeof walletAddress === 'string') ? walletAddress.toLowerCase() : walletAddress;
      // Suppress rapid duplicate logs/updates from the same socket
      try {
        const now = Date.now();
        if (!global.__lastWalletRegisterTs) global.__lastWalletRegisterTs = Object.create(null);
        const lastTs = global.__lastWalletRegisterTs[socket.id] || 0;
        if (now - lastTs < 250) {
          return;
        }
        global.__lastWalletRegisterTs[socket.id] = now;
      } catch {}
      console.log(`🔗 Linking wallet ${normalized} to socket ${socket.id}`);
      
      const connection = activeConnections.get(socket.id);
      if (connection) {
        connection.walletAddress = normalized;
        console.log(`✅ Wallet ${normalized} registered to socket ${socket.id}`);
        try { socket.emit('wallet_registered', { walletAddress: normalized }); } catch {}

        // If this socket had already joined a lobby before registering wallet, refresh counts
        try {
          if (connection.currentLobby) {
            const c = getLobbyCounts(connection.currentLobby);
            io.emit('lobby_counts', { id: connection.currentLobby, liveHumans: c.humans, liveTotal: c.total });
          }
        } catch {}

        // Guard: if there is an older socket with the same wallet, clean it up to avoid ghost presence
        try {
          for (const [otherId, otherConn] of activeConnections.entries()) {
            if (otherId !== socket.id && (otherConn.walletAddress || '').toLowerCase() === normalized) {
              const oldLobby = otherConn.currentLobby;
              console.log(`🧹 Cleaning prior socket ${otherId} for wallet ${normalized}${oldLobby ? ` (lobby ${oldLobby})` : ''}`);
              // Disconnect the old socket to prevent duplicate ghosts; disconnect handler will decide lobby removal
              try { otherConn.socket?.disconnect?.(true); } catch {}
              activeConnections.delete(otherId);
            }
          }
        } catch {}
      }
    });

    // Simple in-memory rate limiting helper per socket
    const rateLimitMap = new Map();
    function checkRateLimit(action, maxPerMinute = 10) {
      const key = `${socket.id}:${action}`;
      const now = Date.now();
      let rec = rateLimitMap.get(key);
      if (!rec) { rec = { count: 0, resetAt: now + 60000 }; rateLimitMap.set(key, rec); }
      if (now > rec.resetAt) { rec.count = 0; rec.resetAt = now + 60000; }
      if (rec.count >= maxPerMinute) return false;
      rec.count++;
      return true;
    }

    // Handle lobby room joining
    socket.on('join_lobby_room', async (lobbyId) => {
      if (!checkRateLimit('join_lobby_room', 10)) {
        console.warn(`⚠️ Rate limit exceeded for join_lobby_room: ${socket.id}`);
        return;
      }
      if (lobbyId) {
        // Block joining lobby room when countdown has begun
        try {
          if (global.countdownActive && global.countdownActive[lobbyId]) {
            try { socket.emit('join_blocked', { lobbyId, reason: 'countdown_active' }); } catch {}
            console.log(`🚫 Blocked lobby room join during countdown for ${lobbyId} (socket ${socket.id})`);
            return;
          }
        } catch {}
        // Check if already in this lobby to prevent duplicate joins
        const connection = activeConnections.get(socket.id);
        if (connection && connection.currentLobby === lobbyId) {
          console.log(`🏟️ Client ${socket.id} already in lobby room: ${lobbyId}`);
          return;
        }
        
        console.log(`🏟️ Client ${socket.id} joining lobby room: ${lobbyId}`);
        socket.join(lobbyId);
        // If a new client joins before countdown starts, cancel any pre-countdown delay
        try {
          if (global.preCountdownTimers && global.preCountdownTimers[lobbyId]) {
            clearTimeout(global.preCountdownTimers[lobbyId]);
            delete global.preCountdownTimers[lobbyId];
            console.log(`⏹️ Pre-countdown cancelled for lobby ${lobbyId} due to new join`);
          }
          if (global.countdownActive && global.countdownActive[lobbyId]) {
            // Do not fully cancel active countdown; but re-emit a fresh 'lobby_updated' snapshot immediately for the joiner
            setTimeout(async () => {
              try {
                const baseUrl = `http://localhost:${port}`;
                const response = await fetch(`${baseUrl}/api/lobbies`).catch(() => null)
                const all = response ? await response.json().catch(() => []) : []
                const lob = Array.isArray(all) ? all.find(l => l && l.id === lobbyId) : null
                if (lob) {
                  const mapped = (lob.players || []).map(p => ({ playerId: p.playerId, username: p.username || String(p.playerId).slice(0,8)+'...', chickenName: p.chickenId || 'Default', isReady: !!p.isReady, isAi: !!p.isAi }))
                  const cur = (global.lobbyVersions.get(lobbyId) || 0); global.lobbyVersions.set(lobbyId, cur + 1);
                  const version = global.lobbyVersions.get(lobbyId) || 1
                  socket.emit('lobby_updated', { id: lobbyId, players: mapped, capacity: lob.capacity, amount: lob.amount, currency: lob.currency, matchType: lob.matchType, version })
                }
              } catch {}
            }, 50)
          }
        } catch {}
        
        // Update connection data for this lobby
        if (connection) {
          connection.lastLobbyActivity = Date.now();
          // If this wallet was in a different lobby, proactively remove from that room and presence
          if (connection.currentLobby && connection.currentLobby !== lobbyId && connection.walletAddress) {
            try {
              io.to(connection.currentLobby).emit('player_left_lobby', { playerId: connection.walletAddress, timestamp: Date.now() });
              if (global.lobbyPresence?.has(connection.currentLobby)) {
                global.lobbyPresence.get(connection.currentLobby).delete(connection.walletAddress);
              }
              socket.leave(connection.currentLobby);
            } catch {}
          }
          connection.currentLobby = lobbyId;
          // Preserve previous ready state; secondary confirmation should not reset readiness
          connection.isReady = Boolean(connection.isReady);
          // Track presence
          if (connection.walletAddress) {
            if (!global.lobbyPresence.has(lobbyId)) {
              global.lobbyPresence.set(lobbyId, new Set());
            }
            // Ensure wallet string is lowercase to avoid duplicate variants
            const addr = String(connection.walletAddress).toLowerCase();
            global.lobbyPresence.get(lobbyId).add(addr);
          }
        }

        // Broadcast updated counts (room + global) derived from active connections
        try {
          const c = getLobbyCounts(lobbyId);
          // Per room
          io.to(lobbyId).emit('lobby_counts', { id: lobbyId, liveHumans: c.humans, liveTotal: c.total });
          // Global snapshot for lobby cards
          io.emit('lobby_counts', { id: lobbyId, liveHumans: c.humans, liveTotal: c.total });
        } catch {}
        
        // Socket-only roster: upsert and emit diffs
        try {
          const wallet = (activeConnections.get(socket.id)?.walletAddress) || socket.id;
          const name = await getUsernameForWallet(wallet);
          const entry = await upsertRoster(lobbyId, wallet, { username: name });
          // Ensure roster reflects authoritative readiness for existing players in the lobby (late-join sync)
          try {
            const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${port}`;
            const res = await fetch(`${baseUrl}/api/lobbies`).catch(() => null);
            const all = res ? await res.json().catch(() => []) : [];
            const liveLobby = Array.isArray(all) ? all.find(l => l && l.id === lobbyId) : null;
            if (liveLobby) {
              for (const p of (liveLobby.players || [])) {
                const pid = String(p.playerId || '');
                if (!pid) continue;
                const patch = {
                  username: p.username || undefined,
                  chickenName: p.chickenId || 'Default',
                  isAi: !!p.isAi,
                  hasWagered: Boolean(p.hasWagered),
                  // Ranked humans: readiness mirrors hasWagered; AI always ready; tutorial uses per-connection readiness elsewhere
                  isReady: (liveLobby.matchType !== 'tutorial' && !p.isAi) ? Boolean(p.hasWagered) : (p.isAi ? true : false),
                };
                await upsertRoster(lobbyId, pid, patch);
              }
            }
          } catch {}
          // Send full roster to the joiner only
          try {
            const map = getRosterMap(lobbyId);
            const players = Array.from(map.values());
            socket.emit('roster_full', { lobbyId, players });
          } catch {}
          // Notify others with a diff
          emitRosterDiff(io, lobbyId, 'upsert', entry);
        } catch {}
      }
    });

    // Handle lobby room leaving
    socket.on('leave_lobby_room', async (lobbyId) => {
      if (!checkRateLimit('leave_lobby_room', 20)) {
        console.warn(`⚠️ Rate limit exceeded for leave_lobby_room: ${socket.id}`);
        return;
      }
      if (lobbyId) {
        console.log(`🚪 Client ${socket.id} leaving lobby room: ${lobbyId}`);
        socket.leave(lobbyId);
        
        // Clear lobby data
        const connection = activeConnections.get(socket.id);
        if (connection) {
          connection.currentLobby = null;
          connection.isReady = false;
          // Remove from presence
          if (connection.walletAddress && global.lobbyPresence && global.lobbyPresence.has(lobbyId)) {
            global.lobbyPresence.get(lobbyId).delete(connection.walletAddress);
          }
        }

        // Best-effort refund for ranked lobbies if the leaving player had already wagered and countdown/queue hasn't started
        try {
          const wallet = connection && connection.walletAddress ? String(connection.walletAddress).toLowerCase() : null;
          if (wallet) {
            const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${port}`;
            const res = await fetch(`${baseUrl}/api/lobbies`).catch(() => null);
            const all = res ? await res.json().catch(() => []) : [];
            const lobby = Array.isArray(all) ? all.find(l => l && l.id === lobbyId) : null;
            const isPaidRanked = !!(lobby && lobby.matchType !== 'tutorial' && (lobby.amount || 0) > 0);
            // Check roster map and API snapshot for wager evidence
            let hasWagered = false;
            try {
              const map = global.lobbyRoster && global.lobbyRoster.get ? global.lobbyRoster.get(lobbyId) : null;
              const prior = map && map.get ? map.get(wallet) : null;
              hasWagered = !!(prior && prior.hasWagered);
            } catch {}
            if (!hasWagered && lobby) {
              const me = (lobby.players || []).find(p => String(p.playerId || '').toLowerCase() === wallet);
              hasWagered = !!(me && me.hasWagered);
            }
            const isCountdownActive = !!(global.countdownActive && global.countdownActive[lobbyId]);
            const hasQueueSession = !!(global.activeQueueForLobby && global.activeQueueForLobby.get(lobbyId));
            if (isPaidRanked && hasWagered && !isCountdownActive && !hasQueueSession) {
              try {
                const { processRefundServerOnly } = require('./app/api/wager/refund/route.ts');
                await processRefundServerOnly({ lobbyId, playerPublicKey: wallet, reason: 'left_before_countdown' });
              } catch (err) {
                console.warn('Refund on socket leave failed (non-fatal):', (err && err.message) || err);
              }
            }
          }
        } catch {}
        
        // Clean up ready timer if this was the last player in a free lobby
        if (lobbyId.includes('tutorial') && global.readyTimers && global.readyTimers[lobbyId]) {
          // Check if any other players are still in the lobby
          let playersInLobby = 0;
          for (const [id, conn] of activeConnections.entries()) {
            if (conn.currentLobby === lobbyId) {
              playersInLobby++;
            }
          }
          
          // If no players left, clear the timer
          if (playersInLobby === 0) {
            console.log(`🧹 Clearing ready timer for empty lobby ${lobbyId}`);
            clearTimeout(global.readyTimers[lobbyId]);
            delete global.readyTimers[lobbyId];
          }
        }
        
        // Socket-only roster removal and diff
        try {
          const leftPlayerId = connection?.walletAddress || socket.id;
          removeFromRoster(lobbyId, leftPlayerId);
          emitRosterDiff(io, lobbyId, 'remove', { playerId: leftPlayerId });
        } catch {}

        // Also broadcast updated live counts for the lobby (global)
        try {
          const c = getLobbyCounts(lobbyId);
          io.emit('lobby_counts', { id: lobbyId, liveHumans: c.humans, liveTotal: c.total });
        } catch {}

        // Emit an updated lobby roster immediately
        try {
          const baseUrl = `http://localhost:${port}`;
          const res = await fetch(`${baseUrl}/api/lobbies`, { cache: 'no-store' }).catch(() => null);
          const all = res ? await res.json().catch(() => []) : [];
          const lobby = Array.isArray(all) ? all.find(l => l && l.id === lobbyId) : null;
          if (lobby) {
            let lobbyPlayers = [];
            for (const player of lobby.players) {
              let isReady = false;
              for (const [, c] of activeConnections.entries()) {
                if (c.currentLobby === lobbyId && c.walletAddress === player.playerId) { isReady = !!c.isReady; break; }
              }
              const displayName = player.username && player.username.trim().length > 0
                ? player.username
                : await getUsernameForWallet(player.playerId);
              try { if (!player.username || player.username !== displayName) player.username = displayName } catch {}
              lobbyPlayers.push({
                playerId: player.playerId,
                username: displayName,
                chickenName: player.chickenId || 'Default',
                isReady: (lobby.matchType === 'tutorial' && player.isAi) ? true : isReady,
                isAi: player.isAi || false
              });
            }
            const version = nextLobbyVersion(lobbyId);
            io.to(lobbyId).emit('lobby_updated', {
              id: lobbyId,
              players: lobbyPlayers,
              capacity: lobby.capacity,
              amount: lobby.amount,
              currency: lobby.currency,
              matchType: lobby.matchType,
              version
            });
          }
        } catch {}

        // If someone leaves before countdown starts, cancel any pre-countdown delay
        try {
          if (global.preCountdownTimers && global.preCountdownTimers[lobbyId]) {
            clearTimeout(global.preCountdownTimers[lobbyId]);
            delete global.preCountdownTimers[lobbyId];
            console.log(`⏹️ Pre-countdown cancelled for lobby ${lobbyId} due to leave`);
          }
        } catch {}
      }
    });

    // Handle matchmaking queue
    socket.on('join_queue', (playerData) => {
      console.log(`🎯 Player ${socket.id} joining queue:`, playerData);
      
      const connection = activeConnections.get(socket.id);
      if (connection) {
        connection.status = 'queued';
        connection.playerData = playerData;
        connection.joinedAt = Date.now();
        // Persist wallet address if provided by client so we can map winners -> wallets
        if (playerData && typeof playerData.walletAddress === 'string' && playerData.walletAddress.length > 0) {
          connection.walletAddress = playerData.walletAddress;
        }
        activeConnections.set(socket.id, connection);
      }

      // Try to match players
      matchPlayers(io);
    });

    // Handle leaving queue
    socket.on('leave_queue', () => {
      console.log(`❌ Player ${socket.id} leaving queue`);
      
      const connection = activeConnections.get(socket.id);
      if (connection) {
        connection.status = 'idle';
        delete connection.playerData;
        activeConnections.set(socket.id, connection);
      }
    });

    // Handle player ready status
    socket.on('player_ready', async (data) => {
      if (!checkRateLimit('player_ready', 5)) {
        console.warn(`⚠️ Rate limit exceeded for player_ready: ${socket.id}`);
        return;
      }
      const { lobbyId, playerId, isReady } = data || {};
      if (!lobbyId || !playerId) return;
      // Normalize identity values for consistent matching
      const normalizedPlayerId = String(playerId).toLowerCase();
      console.log(`🎯 Player ${normalizedPlayerId} ready status: ${isReady} in lobby ${lobbyId}`);
      
      const connection = activeConnections.get(socket.id);
      if (connection) {
        // Enforce ranked readiness: only allow ready=true if hasWagered for paid lobbies
        let finalReady = !!isReady;
        try {
          const baseUrl = `http://localhost:${port}`;
          const res = await fetch(`${baseUrl}/api/lobbies`).catch(() => null);
          const all = res ? await res.json().catch(() => []) : [];
          const liveLobby = Array.isArray(all) ? all.find(l => l && l.id === lobbyId) : null;
          if (liveLobby && liveLobby.matchType !== 'tutorial' && (liveLobby.amount || 0) > 0) {
            const me = (liveLobby.players || []).find(p => String(p.playerId || '').toLowerCase() === normalizedPlayerId);
            let hasWagered = !!(me && me.hasWagered);
            // Fallback to in-memory roster if API snapshot hasn't updated yet
            if (!hasWagered) {
              try {
                const map = global.lobbyRoster && global.lobbyRoster.get ? global.lobbyRoster.get(lobbyId) : null;
                const prior = map && map.get ? map.get(normalizedPlayerId) : null;
                hasWagered = !!(prior && prior.hasWagered);
              } catch {}
            }
            // Only allow ready=true if wagered; otherwise force false
            finalReady = finalReady && hasWagered;
          }
        } catch {}

        connection.isReady = finalReady;
        connection.lastLobbyActivity = Date.now();
        // Ensure wallet and lobby are linked immediately to avoid first-join races
        try {
          if (!connection.walletAddress && typeof playerId === 'string') {
            connection.walletAddress = normalizedPlayerId;
          }
          if (!connection.currentLobby && typeof lobbyId === 'string') {
            connection.currentLobby = lobbyId;
          }
          if (connection.walletAddress && typeof lobbyId === 'string') {
            if (!global.lobbyPresence.has(lobbyId)) global.lobbyPresence.set(lobbyId, new Set());
            global.lobbyPresence.get(lobbyId).add(String(connection.walletAddress).toLowerCase());
          }
        } catch {}
        
        // Update socket-level roster and flip connection readiness
        try {
          // Derive hasWagered from live lobby (already read above) to persist in roster
          let hasWagered = false;
          try {
            const baseUrl = `http://localhost:${port}`;
            const res = await fetch(`${baseUrl}/api/lobbies`).catch(() => null);
            const all = res ? await res.json().catch(() => []) : [];
            const liveLobby = Array.isArray(all) ? all.find(l => l && l.id === lobbyId) : null;
            if (liveLobby) {
              const me = (liveLobby.players || []).find(p => String(p.playerId || '').toLowerCase() === normalizedPlayerId);
              hasWagered = !!(me && me.hasWagered);
            }
          } catch {}
          // Fallback to in-memory roster
          try {
            if (!hasWagered && global.lobbyRoster && global.lobbyRoster.get) {
              const map = global.lobbyRoster.get(lobbyId);
              const prior = map && map.get ? map.get(normalizedPlayerId) : null;
              if (prior && prior.hasWagered) hasWagered = true;
            }
          } catch {}
          const entry = await upsertRoster(lobbyId, normalizedPlayerId, { hasWagered, isReady: finalReady });
          try { const conn2 = activeConnections.get(socket.id); if (conn2) conn2.isReady = finalReady; } catch {}
          emitRosterDiff(io, lobbyId, 'upsert', entry);
        } catch {}

        // Broadcast ready status and also send a lobby_synced snapshot for late joiners
        // Debounce room refresh to avoid thundering herd when multiple players toggle
        io.to(lobbyId).emit('player_ready_status', {
          lobbyId,
          playerId: normalizedPlayerId,
          isReady: connection.isReady
        });
        try {
          if (!global.__refreshDebounce) global.__refreshDebounce = Object.create(null);
          if (!global.__refreshDebounce[lobbyId]) {
            global.__refreshDebounce[lobbyId] = true;
            setTimeout(() => {
              try { io.to(lobbyId).emit('refresh_lobby_state'); } catch {}
              try { delete global.__refreshDebounce[lobbyId]; } catch {}
            }, 120);
          }
        } catch {}
        try {
          const baseUrl = `http://localhost:${port}`;
          const resSnap = await fetch(`${baseUrl}/api/lobbies`, { cache: 'no-store' }).catch(() => null);
          const allSnap = resSnap ? await resSnap.json().catch(() => []) : [];
          const lobbySnap = Array.isArray(allSnap) ? allSnap.find(l => l && l.id === lobbyId) : null;
          if (lobbySnap) {
            // Build presence set for readiness
            const presence = (global.lobbyPresence && global.lobbyPresence.get(lobbyId)) || new Set();
            const map = global.lobbyRoster && global.lobbyRoster.get ? global.lobbyRoster.get(lobbyId) : null;
            const players = (lobbySnap.players || []).map(p => {
              const pid = String(p.playerId || '');
              const pidLower = pid.toLowerCase();
              let ready = false;
              if (lobbySnap.matchType !== 'tutorial' && !p.isAi) {
                // Ranked: treat wagered as ready (authoritative), fallback to roster map
                ready = Boolean(p.hasWagered);
                if (!ready) {
                  try { const cur = map && map.get ? map.get(pidLower) : null; ready = !!(cur && cur.hasWagered); } catch {}
                }
              } else if (p.isAi) {
                ready = true;
              } else {
                // Tutorial/free: use connection state when present
                if (presence && presence.has(pidLower)) {
                  for (const [, c] of activeConnections.entries()) {
                    if (c.currentLobby === lobbyId && String(c.walletAddress || '').toLowerCase() === pidLower) { ready = !!c.isReady; break; }
                  }
                }
              }
              return {
                playerId: pid,
                username: p.username || (pid ? pid.slice(0,8)+'...' : 'Player'),
                chickenName: p.chickenId || 'Default',
                isReady: ready,
                isAi: !!p.isAi
              };
            });
            io.to(lobbyId).emit('lobby_synced', { id: lobbyId, players, capacity: lobbySnap.capacity, amount: lobbySnap.amount, currency: lobbySnap.currency, matchType: lobbySnap.matchType });
          }
        } catch {}
        
        // Persist readiness and trigger AI backfill for tutorial lobbies via HTTP PUT
        try {
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${port}`;
          await fetch(`${baseUrl}/api/lobbies`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lobbyId, playerId, isReady })
          }).catch(() => {});
        } catch {}

        // Re-evaluate ready status and then ask clients to refresh state after persistence
        // Before checking ready, ensure tutorial doesn't overfill with AI when humans present
        try {
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${port}`;
          const res = await fetch(`${baseUrl}/api/lobbies`).catch(() => null);
          const all = res ? await res.json().catch(() => []) : [];
          const liveLobby = Array.isArray(all) ? all.find(l => l && l.id === lobbyId) : null;
          if (liveLobby && liveLobby.matchType === 'tutorial') {
            const humans = (liveLobby.players || []).filter(p => !p.isAi);
            if (humans.length > 0 && (liveLobby.players || []).length > liveLobby.capacity) {
              // Trim extra AI by asking API to re-join this human (API will remove AI beyond capacity)
              await fetch(`${baseUrl}/api/lobbies`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lobbyId, playerId, chickenId: 'default-chicken' })
              }).catch(() => {});
            }
          }
        } catch {}

        await checkLobbyReadyStatus(lobbyId, io);
        setTimeout(() => {
          io.to(lobbyId).emit('refresh_lobby_state');
        }, 50);
        // If a queue session exists, nudge finalize so clients that acks are counted
        try {
          const msid = global.activeQueueForLobby && global.activeQueueForLobby.get(lobbyId);
          if (msid) {
            const session = global.queueSessions && global.queueSessions.get(msid);
            if (session && typeof session.presenceAcks?.set === 'function' && typeof session.assetsAcks?.set === 'function') {
              session.presenceAcks.set(String(playerId), Date.now());
              session.assetsAcks.set(String(playerId), Date.now());
            }
          }
        } catch {}
      }
    });

    // Handle get lobby state request
    // Coalesce get_lobby_state bursts to one in-flight request per lobby
    if (!global.__lobbyStateInflight) global.__lobbyStateInflight = Object.create(null);
    socket.on('get_lobby_state', async (lobbyId) => {
      if (!checkRateLimit('get_lobby_state', 20)) {
        console.warn(`⚠️ Rate limit exceeded for get_lobby_state: ${socket.id}`);
        return;
      }
      try {
        // If a fetch is already in-flight for this lobby, attach to its completion
        if (global.__lobbyStateInflight[lobbyId]) {
          await global.__lobbyStateInflight[lobbyId];
          return;
        }
      } catch {}
      try {
        // Fetch lobby data from API to get real usernames and player list
        const baseUrl = `http://localhost:${port}`;
        const inflight = fetch(`${baseUrl}/api/lobbies`).then(r => r.json()).finally(() => { try { delete global.__lobbyStateInflight[lobbyId] } catch {} });
        global.__lobbyStateInflight[lobbyId] = inflight;
        const lobbies = await inflight;
        const lobby = lobbies.find(l => l.id === lobbyId);
        
        if (lobby) {
          // Merge API lobby players with socket ready status
          let lobbyPlayers = [];
          for (const player of lobby.players) {
            const pid = String(player.playerId || '').toLowerCase();
            let isReady = false;
            // Ranked authority: if paid lobby, derive readiness from hasWagered for humans; tutorial uses connection state
            if (lobby.matchType !== 'tutorial' && (lobby.amount || 0) > 0 && !player.isAi) {
              isReady = !!player.hasWagered;
            } else {
              for (const [, connection] of activeConnections.entries()) {
                if (connection.currentLobby === lobbyId && String(connection.walletAddress || '').toLowerCase() === pid) {
                  isReady = !!connection.isReady;
                  break;
                }
              }
            }
            const displayName = player.username && player.username.trim().length > 0
              ? player.username
              : await getUsernameForWallet(player.playerId);
            try { if (!player.username || player.username !== displayName) player.username = displayName } catch {}
            lobbyPlayers.push({
              playerId: player.playerId,
              username: displayName,
              chickenName: player.chickenId || 'Default',
              isReady: (lobby.matchType === 'tutorial' && player.isAi) ? true : isReady,
              isAi: player.isAi || false
            });
          }

          // Presence-based fallback if API is empty
          try {
            const presence = global.lobbyPresence?.get(lobbyId) || new Set();
            if (lobbyPlayers.length === 0 && presence.size > 0) {
              lobbyPlayers = [];
              for (const addr of presence.values()) {
                let ready = false;
                for (const [, c] of activeConnections.entries()) {
                  if (c.currentLobby === lobbyId && String(c.walletAddress || '').toLowerCase() === String(addr).toLowerCase()) { ready = !!c.isReady; break; }
                }
                lobbyPlayers.push({
                  playerId: addr,
                  username: addr.slice(0, 8) + '...',
                  chickenName: 'Default',
                  isReady: ready,
                  isAi: false,
                });
              }
            }
          } catch {}
          
          // Increment version for this on-demand snapshot
          let version = 1;
          try { const cur = (global.lobbyVersions.get(lobbyId) || 0) + 1; global.lobbyVersions.set(lobbyId, cur); version = cur; } catch {}
          console.log(`📋 Sending lobby state for ${lobbyId} v${version}:`, lobbyPlayers);
          
          try {
            const snap = await buildLobbySnapshot(lobbyId);
            if (snap) socket.emit('lobby_updated', { ...snap, version });
          } catch {}
        } else {
          console.log(`⚠️ Lobby ${lobbyId} not found in API, using fallback`);
          // Fallback to socket-only method
          let version = 1; try { const cur = (global.lobbyVersions.get(lobbyId) || 0) + 1; global.lobbyVersions.set(lobbyId, cur); version = cur; } catch {}
          const lobbyPlayers = [];
          
          for (const [id, connection] of activeConnections.entries()) {
            if (connection.currentLobby === lobbyId) {
              const randomChickens = ['Warrior', 'Ninja', 'Berserker', 'Mage', 'Tank', 'Assassin', 'Paladin', 'Archer'];
              const randomChicken = randomChickens[Math.floor(Math.random() * randomChickens.length)];
              
              lobbyPlayers.push({
                playerId: id,
                username: `Player_${id.slice(0, 6)}`,
                chickenName: randomChicken,
                isReady: connection.isReady || false,
                isAi: false
              });
            }
          }
          
          try { const snap = await buildLobbySnapshot(lobbyId); if (snap) socket.emit('lobby_updated', { ...snap, version }); } catch {}
        }
      } catch (error) {
        console.error('❌ Error fetching lobby state:', error);
        // Fallback to socket-only method
        let version = 1; try { const cur = (global.lobbyVersions.get(lobbyId) || 0) + 1; global.lobbyVersions.set(lobbyId, cur); version = cur; } catch {}
        const lobbyPlayers = [];
        
        for (const [id, connection] of activeConnections.entries()) {
          if (connection.currentLobby === lobbyId) {
            const randomChickens = ['Warrior', 'Ninja', 'Berserker', 'Mage', 'Tank', 'Assassin', 'Paladin', 'Archer'];
            const randomChicken = randomChickens[Math.floor(Math.random() * randomChickens.length)];
            
            lobbyPlayers.push({
              playerId: String(connection.walletAddress || id),
              username: `Player_${String(connection.walletAddress || id).slice(0, 6)}`,
              chickenName: randomChicken,
              isReady: connection.isReady || false,
              isAi: false
            });
          }
        }
        
        try { const snap = await buildLobbySnapshot(lobbyId); if (snap) socket.emit('lobby_updated', { ...snap, version }); } catch {}
      }
    });

    // Client nudge: ensure queue moves forward by finalizing or starting queue phase
    socket.on('ensure_queue_progress', async (lobbyId) => {
      if (!checkRateLimit('ensure_queue_progress', 5)) {
        console.warn(`⚠️ Rate limit exceeded for ensure_queue_progress: ${socket.id}`);
        return;
      }
      try {
        const msId = (global.activeQueueForLobby && global.activeQueueForLobby.get(lobbyId)) || null;
        if (msId) {
          console.log(`🧭 ensure_queue_progress: finalizing active queue session ${msId} for ${lobbyId}`)
          await finalizeQueueSession(msId, io);
        } else {
          console.log(`🧭 ensure_queue_progress: starting queue phase for ${lobbyId}`)
          await startQueuePhase(lobbyId, io);
        }
      } catch (e) {
        console.warn('ensure_queue_progress failed:', e?.message || e);
      }
    });

    // Provide a snapshot of lobby counts for all lobbies
    socket.on('get_lobby_counts', async () => {
      if (!checkRateLimit('get_lobby_counts', 10)) {
        console.warn(`⚠️ Rate limit exceeded for get_lobby_counts: ${socket.id}`);
        return;
      }
      try {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${port}`;
        const res = await fetch(`${baseUrl}/api/lobbies`).catch(() => null);
        const all = res ? await res.json().catch(() => []) : [];
        const counts = {};
        for (const l of Array.isArray(all) ? all : []) {
          const lid = l && l.id ? l.id : null;
          if (!lid) continue;
          const c = getLobbyCounts(lid);
          counts[lid] = { liveHumans: c.humans, liveTotal: c.total };
        }
        socket.emit('lobby_counts_snapshot', { counts });
      } catch (e) {
        socket.emit('lobby_counts_snapshot', { counts: {} });
      }
    });

    // Active players snapshot
    socket.on('get_active_players', () => {
      if (!checkRateLimit('get_active_players', 10)) return;
      try { socket.emit('active_players', { humans: getGlobalActiveHumans(), ts: Date.now() }); } catch {}
    });

    // Prune tutorial lobby ghosts: remove humans not present in live socket presence
    socket.on('prune_ghosts', async (lobbyId) => {
      if (!checkRateLimit('prune_ghosts', 5)) return;
      try {
        if (!lobbyId) return;
        const lob = lobbies.find(l => l && l.id === lobbyId);
        if (!lob || lob.matchType !== 'tutorial') return;
        const presence = (global.lobbyPresence && global.lobbyPresence.get(lobbyId)) || new Set();
        const beforeCount = Array.isArray(lob.players) ? lob.players.length : 0;
        if (!Array.isArray(lob.players)) lob.players = [];
        lob.players = lob.players.filter(p => p.isAi || presence.has(String(p.playerId || '').toLowerCase()));
        const afterCount = lob.players.length;
        if (afterCount !== beforeCount) {
          // Broadcast pruned roster
          const lobbyPlayers = lob.players.map(p => ({
            playerId: p.playerId,
            username: p.username || (p.playerId ? String(p.playerId).slice(0,8)+'...' : 'Player'),
            chickenName: p.chickenId || 'Default',
            isReady: p.isAi ? true : Boolean(p.isReady),
            isAi: !!p.isAi,
          }));
          const version = nextLobbyVersion(lobbyId);
          io.to(lobbyId).emit('lobby_updated', {
            id: lobbyId,
            players: lobbyPlayers,
            capacity: lob.capacity,
            amount: lob.amount,
            currency: lob.currency,
            matchType: lob.matchType,
            version,
          });
        }
      } catch {}
    });

    // Broadcast active players to all clients on connect/disconnect churn (throttled)
    try {
      if (!global.__activePlayersBroadcast) global.__activePlayersBroadcast = { last: 0 };
      const maybeBroadcast = () => {
        try {
          const now = Date.now();
          if (now - global.__activePlayersBroadcast.last < 1000) return; // 1s throttle
          global.__activePlayersBroadcast.last = now;
          const humans = getGlobalActiveHumans();
          io.emit('active_players', { humans, ts: now });
        } catch {}
      };
      // initial
      maybeBroadcast();
      // after short delay to capture wallet registration
      setTimeout(maybeBroadcast, 600);
    } catch {}

    // Periodic idle-kick for unready players lingering in lobby rooms
    try {
      if (!global.__idleKickInterval) {
        global.__idleKickInterval = setInterval(async () => {
          try {
            const now = Date.now();
            const idleMs = 3 * 60 * 1000; // 3 minutes
            for (const [id, conn] of activeConnections.entries()) {
              try {
                const lobbyId = conn.currentLobby;
                if (!lobbyId) continue;
                const last = Number(conn.lastLobbyActivity || 0);
                const isReady = Boolean(conn.isReady);
                if (!isReady && last > 0 && (now - last) > idleMs) {
                  // Boot: remove from lobby via API and from socket room
                  const baseUrl = `http://localhost:${port}`;
                  try {
                    await fetch(`${baseUrl}/api/lobbies`, {
                      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ lobbyId, playerId: conn.walletAddress || id })
                    }).catch(() => {});
                  } catch {}
                  try { conn.socket?.leave?.(lobbyId); } catch {}
                  delete conn.currentLobby;
                  conn.isReady = false;
                  // Broadcast latest counts
                  try { const c = getLobbyCounts(lobbyId); io.emit('lobby_counts', { id: lobbyId, liveHumans: c.humans, liveTotal: c.total }); } catch {}
                }
              } catch {}
            }
          } catch {}
        }, 30000); // scan every 30s
      }
    } catch {}

    // Debug: dump queue state for a lobby to the requesting client
    socket.on('debug_queue_state', (lobbyId) => {
      if (!checkRateLimit('debug_queue_state', 10)) {
        console.warn(`⚠️ Rate limit exceeded for debug_queue_state: ${socket.id}`);
        return;
      }
      try {
        const msId = (global.activeQueueForLobby && global.activeQueueForLobby.get(lobbyId)) || null;
        const session = msId && global.queueSessions ? global.queueSessions.get(msId) : null;
        const snapshot = session ? {
          matchSessionId: session.id,
          lobbyId: session.lobbyId,
          expectedRosterCount: Array.isArray(session.expectedRoster) ? session.expectedRoster.length : 0,
          expectedRoster: Array.isArray(session.expectedRoster) ? session.expectedRoster.map(p => ({ wallet: p.wallet, isAi: !!p.isAi })) : [],
          presenceAckCount: session.presenceAcks ? session.presenceAcks.size : 0,
          presenceAcks: session.presenceAcks ? Array.from(session.presenceAcks.keys()) : [],
          assetsAckCount: session.assetsAcks ? session.assetsAcks.size : 0,
          assetsAcks: session.assetsAcks ? Array.from(session.assetsAcks.keys()) : [],
          createdAt: session.createdAt,
          ackDeadlineMs: session.ackDeadlineMs,
          now: Date.now(),
        } : { matchSessionId: null, lobbyId, note: 'no active session' };
        socket.emit('queue_state_dump', snapshot);
      } catch (e) {
        socket.emit('queue_state_dump', { lobbyId, error: e?.message || String(e) });
      }
    });

    // Handle battle actions
    socket.on('battle_action', async (actionData) => {
      if (!checkRateLimit('battle_action', 30)) {
        console.warn(`⚠️ Rate limit exceeded for battle_action: ${socket.id}`);
        return;
      }
      const { roomId, action, targetPosition } = actionData;
      console.log(`⚔️ Action from ${socket.id} in room ${roomId}: ${action}`);
      
      const room = gameRooms.get(roomId);
      if (room) {
        // Process the action and broadcast result
        const result = processAction(room, socket.id, action, targetPosition);
        
        // Broadcast to all players in the room
        io.to(roomId).emit('action_result', result);

        // Killstreak: when the same attacker kills 3 in a row, trigger lobby-wide sound
        try {
          if (result.battleOver) {
            // Idempotency guard: avoid duplicate winner emissions and payouts
            if (room._endEmitted) return;
            room._endEmitted = true;
            room._winner = result.winner;
            room.killLog = room.killLog || [];
            room.killLog.push({ killer: socket.id, ts: Date.now() });
            const recent = room.killLog.slice(-3);
            if (recent.length === 3 && recent.every(k => k.killer === socket.id)) {
              io.to(roomId).emit('chat_message', {
                id: `ks-${Date.now()}`,
                user: { name: 'System', address: '0x000' },
                message: `🔥 CHICKEN SPREE!`,
                timestamp: new Date().toISOString(),
                isPrediction: true,
              });
              io.to(roomId).emit('play_sound', { key: 'killstreak' });
            }
          }
        } catch {}
        io.to(roomId).emit('game_state_update', room.gameState);

        // Broadcast battle event to spectators as chat message
        if (result.actionSuccess) {
          const isPlayer1 = room.player1Id === socket.id;
          const attackerName = isPlayer1 ? room.gameState.player1.name : room.gameState.player2.name;
          const targetName = isPlayer1 ? room.gameState.player2.name : room.gameState.player1.name;
          
          let eventMessage = '';
          if (action === 'attack' && result.damage > 0) {
            eventMessage = `${attackerName} attacked ${targetName} for ${result.damage} damage!`;
          } else if (action === 'special_attack' && result.damage > 0) {
            eventMessage = `${attackerName} used SPECIAL ATTACK on ${targetName} for ${result.damage} damage! 💥`;
          } else if (action === 'defend') {
            eventMessage = `${attackerName} is defending! 🛡️`;
          }
          
          if (eventMessage) {
            io.to(roomId).emit('chat_message', {
              id: `event-${Date.now()}`,
              user: {
                name: 'System',
                address: '0x000',
              },
              message: eventMessage,
              timestamp: new Date().toISOString(),
              isPrediction: true,
            });
          }
        }

        // Check if battle is over
        if (result.battleOver) {
          console.log(`🏆 Match ${roomId} ended. Winner: ${result.winner}`);
          
          // Broadcast victory message to spectators
          const winnerName = result.winner === room.player1Id 
            ? room.gameState.player1.name 
            : room.gameState.player2.name;
          
          io.to(roomId).emit('chat_message', {
            id: `victory-${Date.now()}`,
            user: {
              name: 'System',
              address: '0x000',
            },
            message: `🏆 ${winnerName} WINS THE MATCH! 🏆`,
            timestamp: new Date().toISOString(),
            isPrediction: true,
          });
          
          io.to(roomId).emit('match_ended', { 
            winner: result.winner,
            battleData: result 
          });
          try { io.to(roomId).emit('play_sound', { key: 'victory' }); } catch {}

          // Best-effort tutorial lobby cleanup so it doesn't appear full after match
        try {
          const baseUrl = `http://localhost:${port}`;
          const res = await fetch(`${baseUrl}/api/lobbies`).catch(() => null);
            const all = res ? await res.json().catch(() => []) : [];
            const tutorialLobbies = Array.isArray(all) ? all.filter(l => l && l.matchType === 'tutorial') : [];
            for (const tl of tutorialLobbies) {
              if (Array.isArray(tl.players) && tl.players.length > 0) {
                for (const p of tl.players) {
                  try {
                    await fetch(`${baseUrl}/api/lobbies`, {
                      method: 'DELETE',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ lobbyId: tl.id, playerId: p.playerId })
                    });
                  } catch {}
                }
              }
            }
          } catch (e) {
            console.warn('Tutorial lobby cleanup failed (non-fatal):', e?.message || e);
          }

          // Record match (best-effort) in Supabase for auditing/payout flows (idempotent)
          try {
            if (room._payoutTriggered) {
              // Already recorded/triggered payout for this room
              return;
            }
            // If we have a queue session meta for the winner, prefer that
            try {
              const winnerConn = activeConnections.get(result.winner);
              const winnerWallet = winnerConn?.walletAddress || null;
              const meta = (winnerWallet && global.recentMatchMetaByWallet) ? global.recentMatchMetaByWallet.get(String(winnerWallet).toLowerCase()) : null;
              // Global session guard: if a payout for this session+winner already triggered, skip
              try {
                if (!global.payoutTriggeredBySession) global.payoutTriggeredBySession = new Set();
                const msidGuard = meta && meta.matchSessionId ? String(meta.matchSessionId) : null;
                const winnerLowerGuard = String(winnerWallet || '').toLowerCase();
                if (msidGuard && global.payoutTriggeredBySession.has(`${msidGuard}:${winnerLowerGuard}`)) {
                  try { room._payoutTriggered = true; } catch {}
                  return;
                }
              } catch {}
              if (meta && (meta.amount > 0) && (meta.humansCount > 0)) {
                const baseUrl = `http://localhost:${port}`;
                const secret = process.env.PAYOUT_SERVER_SECRET;
                const prizePool = (meta.amount || 0) * (meta.humansCount || 0);
                if (secret && winnerWallet) {
                  // Insert into match_results early if not present to obtain an id
                  try {
                    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
                    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
                    if (supabaseUrl && supabaseServiceKey) {
                      const { createClient } = require('@supabase/supabase-js');
                      const supabase = createClient(supabaseUrl, supabaseServiceKey);
                      const participants = Array.isArray(meta.humans) ? meta.humans.map((w)=>({ wallet: w, wager_amount: meta.amount })) : [];
                      const { data: mrRow } = await supabase.from('match_results').insert({
                        lobby_id: meta.lobbyId || null,
                        escrow_wallet_id: meta.escrow || null,
                        match_started_at: room.startTime ? new Date(room.startTime).toISOString() : new Date().toISOString(),
                        match_ended_at: new Date().toISOString(),
                        winner_wallet: winnerWallet,
                        total_prize_pool: prizePool,
                        participants,
                        game_data: { roomId },
                        status: 'completed',
                        payout_processed: false,
                      }).select('id').single();
                      const matchId = mrRow?.id || null;
                      console.log('[PAYOUT][REQUEST][HTTP][FAST]', { matchId, winner: winnerWallet, prizePool });
                      const resp = await fetch(`${baseUrl}/api/payout`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${secret}` },
                        body: JSON.stringify({ winnerAddress: winnerWallet, prizePool, matchId, matchSessionId: (meta && meta.matchSessionId) ? meta.matchSessionId : undefined })
                      }).catch(() => null);
                      if (resp && resp.ok) {
                        console.log('💸 Ranked payout executed via HTTP (fast path)');
                        try { room._payoutTriggered = true; } catch {}
                        return;
                      } else {
                        const status = resp ? resp.status : 'no_response';
                        const txt = resp ? await resp.text().catch(() => '') : 'no response';
                        console.warn('⚠️ HTTP payout failed (fast path)', { matchId, status, details: txt });
                      }
                    }
                  } catch (fpErr) {
                    console.warn('Fast payout path error:', fpErr?.message || fpErr);
                  }
                }
              }
            } catch {}
            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
            const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
            if (supabaseUrl && supabaseServiceKey) {
              const { createClient } = require('@supabase/supabase-js');
              const supabase = createClient(supabaseUrl, supabaseServiceKey);

              const winnerConn = activeConnections.get(result.winner);
              const player1Conn = activeConnections.get(room.player1Id);
              const player2Conn = activeConnections.get(room.player2Id);

              const winnerWallet = winnerConn?.walletAddress || null;
              const player1Wallet = player1Conn?.walletAddress || null;
              const player2Wallet = player2Conn?.walletAddress || null;

              // Insert or upsert into legacy 'matches' table for compatibility
              // Insert base match row with additional details and capture matchId
              const matchDuration = (room.lastUpdateTime && room.startTime) ? Math.max(0, Math.round((room.lastUpdateTime - room.startTime) / 1000)) : 0;
              let matchIdBase = null;
              try {
                const { data: matchRow } = await supabase.from('matches').insert({
                  player1_wallet: player1Wallet,
                  player2_wallet: player2Wallet,
                  winner_wallet: winnerWallet,
                  player1_tokens_wagered: null, // filled below for ranked
                  player2_tokens_wagered: null,
                  duration_seconds: matchDuration,
                  metadata: {
                    source: 'socket_server',
                    roomId,
                    started_at: room.startTime || Date.now(),
                    ended_at: Date.now(),
                  },
                }).select('id').single();
                matchIdBase = matchRow?.id || null;
              } catch {}

              // Ranked payout orchestrator: prefer captured queue meta; fallback to polling only if missing
              try {
                const winnerLower = String(winnerWallet || '').toLowerCase();
                const meta = (global.recentMatchMetaByWallet && global.recentMatchMetaByWallet.get(winnerLower)) || null;
                let rankedAmount = meta && typeof meta.amount === 'number' ? meta.amount : 0;
                let humansCount = meta && typeof meta.humansCount === 'number' ? meta.humansCount : 0;
                let escrowIdVal = meta && meta.escrow ? meta.escrow : null;
                let rankedLobby = null;
                if (!(rankedAmount > 0 && humansCount > 0)) {
                  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${port}`;
                  const lobbyRes = await fetch(`${baseUrl}/api/lobbies`).catch(() => null);
                  const lobbyList = lobbyRes ? await lobbyRes.json().catch(() => []) : [];
                  rankedLobby = Array.isArray(lobbyList) ? lobbyList.find(l => l.amount > 0 && (l.players || []).some(p => p.playerId === player1Wallet || p.playerId === player2Wallet)) : null;
                  if (rankedLobby) {
                    rankedAmount = rankedLobby.amount || 0;
                    humansCount = (rankedLobby.players || []).filter(p => !p.isAi).length || 0;
                    escrowIdVal = rankedLobby.escrowWalletId || null;
                  }
                }
                if (rankedAmount > 0 && humansCount > 0) {
                  const prizePoolLamports = Math.round(rankedAmount * humansCount * 1_000_000_000);
                  console.log('[MATCH][WIN]', {
                    roomId,
                    lobbyId: meta?.lobbyId || (rankedLobby?.id || null),
                    matchSessionId: meta?.matchSessionId || null,
                    winnerWallet,
                    rankedAmount,
                    humansCount,
                    prizePoolBNB: (rankedAmount * humansCount),
                    escrowId: escrowIdVal || null,
                    participants
                  });

                  // Create match_results row
                  const participants = meta && Array.isArray(meta.humans)
                    ? meta.humans.map((w) => ({ wallet: w, wager_amount: rankedAmount }))
                    : ((Array.isArray(rankedLobby?.players) ? rankedLobby.players.filter((p) => !p.isAi) : [])
                        .map((p) => ({ wallet: p.playerId, wager_amount: rankedAmount })));
                  const { data: mr, error: mrErr } = await supabase.from('match_results').insert({
                    lobby_id: meta?.lobbyId || (rankedLobby?.id || null),
                    escrow_wallet_id: escrowIdVal || null,
                    match_started_at: new Date(room.startTime || Date.now()).toISOString(),
                    match_ended_at: new Date().toISOString(),
                    winner_wallet: winnerWallet,
                    total_prize_pool: (prizePoolLamports / 1_000_000_000),
                    participants,
                    game_data: { roomId },
                    status: 'completed',
                    payout_processed: false,
                  }).select('id').single();
                  if (!mrErr && mr?.id) {
                    // Also fill in wager amounts on the matches table for history
                    try {
                      await supabase.from('matches').update({
                        player1_tokens_wagered: rankedAmount,
                        player2_tokens_wagered: rankedAmount
                      }).eq('id', matchIdBase);
                    } catch {}
                    // Trigger payout via internal HTTP API to avoid TS/CJS import issues on server-only path
                    try {
                      const baseUrl = `http://localhost:${port}`;
                      const secret = process.env.PAYOUT_SERVER_SECRET;
                      if (secret) {
                        console.log('[PAYOUT][REQUEST][HTTP]', { matchId: mr.id, winner: winnerWallet, prizePool: (prizePoolLamports / 1_000_000_000) });
                        const resp = await fetch(`${baseUrl}/api/payout`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${secret}` },
                          body: JSON.stringify({ winnerAddress: winnerWallet, prizePool: (prizePoolLamports / 1_000_000_000), matchId: mr.id, matchSessionId: (meta && meta.matchSessionId) ? meta.matchSessionId : undefined })
                        }).catch(() => null);
                        if (resp && resp.ok) {
                          console.log('💸 Ranked payout executed via HTTP for match_result:', mr.id);
                          try { room._payoutTriggered = true; } catch {}
                          return;
                        } else {
                          const status = resp ? resp.status : 'no_response';
                          const txt = resp ? await resp.text().catch(() => '') : 'no response';
                          console.warn('⚠️ HTTP payout failed', { matchId: mr.id, status, details: txt });
                        }
                      } else {
                        console.warn('⚠️ PAYOUT_SERVER_SECRET not set; cannot execute payout');
                      }
                    } catch (eh) {
                      console.warn('HTTP payout error:', eh?.message || eh);
                    }
                  } else if (mrErr) {
                    console.error('❌ Failed to insert match_results:', mrErr);
                  }
                }
              } catch (orchestratorErr) {
                console.error('⚠️ Payout orchestrator error:', orchestratorErr);
              }
              // Server-side profile updates and transactions (best-effort)
              try {
                const houseCutPct = parseFloat(process.env.HOUSE_CUT_PERCENTAGE || '0.04');
                // Prefer queue meta for ledger entries
                const meta = (global.recentMatchMetaByWallet && global.recentMatchMetaByWallet.get(String(winnerWallet||'').toLowerCase())) || null;
                const isRanked = !!((meta && meta.amount > 0) || (typeof rankedLobby?.amount === 'number' && rankedLobby.amount > 0));
                const wager = isRanked ? Number((meta?.amount ?? rankedLobby?.amount) || 0) : 0;
                const humansCount = isRanked ? (meta?.humansCount ?? ((rankedLobby?.players || []).filter(p => !p.isAi).length || 0)) : 0;
                // Use integer math in wei to avoid float drift
                const poolWei = (wager > 0 && humansCount > 0) ? BigInt(Math.round(wager * 1_000_000_000)) * BigInt(humansCount) : 0n;
                const houseBps = Math.min(10000, Math.max(0, Math.round(houseCutPct * 10000)));
                const houseWei = (poolWei * BigInt(houseBps)) / 10000n;
                const winnerWei = poolWei - houseWei;
                const prizePool = Number(poolWei) / 1_000_000_000;
                const winnerCut = Number(winnerWei) / 1_000_000_000;
                const wWallet = winnerWallet;
                const lWallet = (wWallet && player1Wallet && player2Wallet) ? (wWallet === player1Wallet ? player2Wallet : player1Wallet) : null;
                // Record transactions (wagers) for both humans
                const txRows = [];
                if (wager > 0 && player1Wallet) txRows.push({ wallet_address: player1Wallet, transaction_type: 'wager', amount: -wager, description: 'Match wager' });
                if (wager > 0 && player2Wallet) txRows.push({ wallet_address: player2Wallet, transaction_type: 'wager', amount: -wager, description: 'Match wager' });
                if (winnerCut > 0 && wWallet) txRows.push({ wallet_address: wWallet, transaction_type: 'win', amount: winnerCut, description: 'Match winnings' });
                if (txRows.length > 0) {
                  try { await supabase.from('transactions').insert(txRows.map(r => ({ ...r, related_entity_id: matchIdBase || roomId }))); } catch {}
                }
                // Helper to read then update profile counters
                const bumpProfile = async (wallet, opts) => {
                  if (!wallet) return;
                  try {
                    const { data: prof } = await supabase.from('profiles').select('total_matches,wins,losses,win_streak,max_win_streak,total_tokens_won,total_tokens_lost,total_wagered,experience,level,next_level_xp').eq('wallet_address', wallet).maybeSingle();
                    const exists = !!prof;
                    const total_matches = (prof?.total_matches || 0) + 1;
                    const wins = (prof?.wins || 0) + (opts.win ? 1 : 0);
                    const losses = (prof?.losses || 0) + (opts.win ? 0 : 1);
                    const win_streak = opts.win ? ((prof?.win_streak || 0) + 1) : 0;
                    const max_win_streak = Math.max((prof?.max_win_streak || 0), win_streak);
                    const total_tokens_won = (prof?.total_tokens_won || 0) + (opts.win ? (winnerCut || 0) : 0);
                    const total_tokens_lost = (prof?.total_tokens_lost || 0) + (opts.win ? 0 : (wager || 0));
                    const total_wagered = (prof?.total_wagered || 0) + (wager || 0);
                    const xpGained = opts.win ? 100 : 25;
                    let experience = (prof?.experience || 0) + xpGained;
                    let level = prof?.level || 1;
                    let next_level_xp = prof?.next_level_xp || 100;
                    if (experience >= next_level_xp) {
                      level = level + 1;
                      next_level_xp = Math.floor(100 * Math.pow(1.5, Math.max(0, level - 1)));
                    }
                    if (exists) {
                      await supabase.from('profiles').update({ total_matches, wins, losses, win_streak, max_win_streak, total_tokens_won, total_tokens_lost, total_wagered, experience, level, next_level_xp, last_login: new Date().toISOString() }).eq('wallet_address', wallet);
                    } else {
                      await supabase.from('profiles').insert({ wallet_address: wallet, username: `Player_${String(wallet).slice(0,6)}`, total_matches, wins, losses, win_streak, max_win_streak, total_tokens_won, total_tokens_lost, total_wagered, experience, level, next_level_xp });
                    }
                    // Notify client to refresh profile if connected
                    try {
                      for (const [, c] of activeConnections.entries()) {
                        const w = String(c.walletAddress || '').toLowerCase();
                        if (w && w === String(wallet).toLowerCase()) { c.socket?.emit?.('profile_updated', { wallet, roomId, ts: Date.now() }); }
                      }
                    } catch {}
                  } catch {}
                };
                await bumpProfile(wWallet, { win: true });
                await bumpProfile(lWallet, { win: false });
              } catch (profileErr) {
                console.error('⚠️ Profile update after match failed:', profileErr);
              }
            }
          } catch (e) {
            console.error('⚠️ Failed to record match result:', e);
          }
          
          // Clean up room and reset player statuses
          const player1 = activeConnections.get(room.player1Id);
          const player2 = activeConnections.get(room.player2Id);
          if (player1) player1.status = 'idle';
          if (player2) player2.status = 'idle';
          gameRooms.delete(roomId);
        }
      }
    });

    // Join/leave match room for realtime arena sync
    socket.on('join_match_room', (payload) => {
      try {
        const matchSessionId = String(payload?.matchSessionId || '');
        if (!matchSessionId) return;
        if (!checkRateLimit('join_match_room', 20)) return;
        const conn = activeConnections.get(socket.id);
        if (!conn) return;
        // leave prior
        try { if (conn.currentMatch) socket.leave(conn.currentMatch); } catch {}
        socket.join(matchSessionId);
        conn.currentMatch = matchSessionId;
        activeConnections.set(socket.id, conn);
      } catch {}
    });
    socket.on('leave_match_room', () => {
      try {
        const conn = activeConnections.get(socket.id);
        if (!conn) return;
        if (conn.currentMatch) {
          try { socket.leave(conn.currentMatch); } catch {}
          delete conn.currentMatch;
          activeConnections.set(socket.id, conn);
        }
      } catch {}
    });

    // Realtime arena sync: receive local player transform and broadcast to lobby room
    socket.on('player_state', (payload) => {
      try {
        // Allow ~25 Hz per minute cap (slightly higher for smoother jumps)
        if (!checkRateLimit('player_state', 1800)) {
          return;
        }
        const connection = activeConnections.get(socket.id);
        if (!connection) return;
        const lobbyId = connection.currentLobby || String(payload?.lobbyId || '');
        const matchId = connection.currentMatch || String(payload?.matchSessionId || '');
        if (!lobbyId && !matchId) return;
        const wallet = connection.walletAddress || socket.id;
        // Sanitize payload
        const pos = Array.isArray(payload?.position) && payload.position.length >= 3
          ? payload.position
          : [0, 0.85, 0];
        const rotY = Number(payload?.rotationY);
        const isPecking = Boolean(payload?.isPecking);
        // For remote smoothing like jump, include peckAt when peck is active
        const peckAt = isPecking ? Date.now() : undefined;
        const isJumping = Boolean(payload?.isJumping);
        const targetRoom = matchId ? matchId : lobbyId;
        io.to(targetRoom).emit('player_state', {
          playerId: wallet,
          position: { x: Number(pos[0]) || 0, y: Number(pos[1]) || 0.85, z: Number(pos[2]) || 0 },
          rotationY: isFinite(rotY) ? rotY : 0,
          isPecking,
          isJumping,
          peckAt,
          ts: Date.now(),
        });
      } catch {}
    });

    // Realtime arena sync: damage application (tutorial trust model)
    // Simple de-dupe window per attacker->target and global per-attacker throttle (max 2 hits/sec)
    if (!global.__lastDamageMap) global.__lastDamageMap = Object.create(null);
    if (!global.__lastAttackerHitTs) global.__lastAttackerHitTs = Object.create(null);
    socket.on('player_damage', (payload) => {
      try {
        // Allow more frequent peck hits without throttling legitimate gameplay
        if (!checkRateLimit('player_damage', 420)) {
          return;
        }
        const connection = activeConnections.get(socket.id);
        if (!connection) return;
        const lobbyId = connection.currentLobby || String(payload?.lobbyId || '');
        const matchId = connection.currentMatch || String(payload?.matchSessionId || '');
        if (!lobbyId && !matchId) return;
        const wallet = connection.walletAddress || socket.id;
        const targetId = String(payload?.targetId || '');
        if (!targetId) return;
        const amount = Math.max(0, Math.min(3, Number(payload?.amount) || 1));
        // Global per-attacker throttle: <= 2 hits per second across all targets
        const now = Date.now();
        try {
          const lastGlobal = global.__lastAttackerHitTs[wallet] || 0;
          if (now - lastGlobal < 500) return; // enforce 500ms gap between any two hits by same attacker
          global.__lastAttackerHitTs[wallet] = now;
        } catch {}
        // Per attacker-target dedupe window (500ms)
        try {
          const key = wallet + '->' + targetId;
          const last = global.__lastDamageMap[key] || 0;
          if (now - last < 500) return; // 500ms window caps at 2/s per target
          global.__lastDamageMap[key] = now;
        } catch {}
        const targetRoom = matchId ? matchId : lobbyId;
        io.to(targetRoom).emit('player_damage', { targetId, amount, by: wallet, ts: Date.now() });
      } catch {}
    });

    // Queue presence and assets acks
    socket.on('queue_presence', (payload) => {
      try {
        const { matchSessionId, wallet, latencyMs } = payload || {};
        if (!matchSessionId || !wallet) return;
        const session = global.queueSessions && global.queueSessions.get(matchSessionId);
        if (!session) return;
        session.presenceAcks.set(wallet, Date.now());
        // Optional: broadcast presence update to lobby
        const lobbyId = session.lobbyId;
        try { io.to(lobbyId).emit('queue_presence_update', { wallet, latencyMs }); } catch {}
      } catch {}
    });

    // Lightweight ping/pong for measuring client RTT during secondary confirmation
    socket.on('queue_ping', (payload) => {
      try {
        const ts = (payload && payload.ts) ? Number(payload.ts) : Date.now();
        socket.emit('queue_pong', { ts });
      } catch {}
    });

    socket.on('assets_loaded', (payload) => {
      try {
        const { matchSessionId, wallet } = payload || {};
        if (!matchSessionId || !wallet) return;
        const session = global.queueSessions && global.queueSessions.get(matchSessionId);
        if (!session) return;
        session.assetsAcks.set(wallet, Date.now());
        // Broadcast asset readiness to lobby participants
        try {
          const lobbyId = session.lobbyId;
          io.to(lobbyId).emit('queue_assets_update', { wallet });
        } catch {}
      } catch {}
    });

    // Client-declared match end (fast path payout trigger using queued meta)
    socket.on('match_end', async (payload) => {
      try {
        const msid = String(payload?.matchSessionId || '');
        if (!msid) return;
        // Idempotency per session
        try { if (!global.payoutTriggeredBySession) global.payoutTriggeredBySession = new Set(); } catch {}
        try { if (!global.payoutInFlightBySession) global.payoutInFlightBySession = new Set(); } catch {}
        const winnerLowerKey = String((payload?.winnerWallet || '')).toLowerCase();
        const idempoKey = `${msid}:${winnerLowerKey}`;
        // Guard: if already completed or currently in-flight, skip duplicate trigger
        if ((global.payoutTriggeredBySession && global.payoutTriggeredBySession.has(idempoKey)) ||
            (global.payoutInFlightBySession && global.payoutInFlightBySession.has(idempoKey))) {
          return;
        }
        try { if (global.payoutInFlightBySession) global.payoutInFlightBySession.add(idempoKey); } catch {}

        const meta = global.recentMatchMetaBySession ? global.recentMatchMetaBySession.get(msid) : null;
        if (!meta) return;
        const amount = Number(meta.amount || 0);
        const humans = Array.isArray(meta.humans) ? meta.humans.slice() : [];
        const humansCount = Number(meta.humansCount || humans.length || 0);
        if (!(amount > 0 && humansCount > 0)) {
          // Free/tutorial: no payout required
          return;
        }

        // Determine winner wallet
        const fromPayload = String(payload?.winnerWallet || '');
        let winnerWallet = fromPayload && fromPayload.startsWith('0x') ? fromPayload : null;
        if (!winnerWallet) {
          const conn = activeConnections.get(socket.id);
          if (conn && conn.walletAddress) winnerWallet = conn.walletAddress;
        }
        if (!winnerWallet) return;
        const winnerLower = String(winnerWallet).toLowerCase();
        if (!humans.map((w) => String(w).toLowerCase()).includes(winnerLower)) {
          // Winner must be one of the expected humans
          return;
        }

                  const baseUrl = `http://localhost:${port}`;
        const secret = process.env.PAYOUT_SERVER_SECRET;
        if (!secret) {
          console.warn('⚠️ PAYOUT_SERVER_SECRET not set; cannot execute payout');
          return;
        }

        // Create a match_results row to obtain a matchId for payout validation
        let matchId = null;
        let selectedEscrow = (meta && meta.escrow) ? meta.escrow : null;
        try { if (!matchId && meta && meta.matchResultId) matchId = meta.matchResultId; } catch {}
        try {
          if (!global.cachedEscrowBySession) global.cachedEscrowBySession = new Map();
          if (!selectedEscrow) selectedEscrow = global.cachedEscrowBySession.get(msid) || null;
        } catch {}
        try {
          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
          const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
          if (supabaseUrl && supabaseServiceKey) {
            const { createClient } = require('@supabase/supabase-js');
            const supabase = createClient(supabaseUrl, supabaseServiceKey);
            const participants = humans.map((w) => ({ wallet: w, wager_amount: amount }));
            const { data: mrRow } = await supabase.from('match_results').insert({
              lobby_id: meta.lobbyId || null,
              escrow_wallet_id: selectedEscrow || null,
              match_started_at: meta.startAt ? new Date(meta.startAt).toISOString() : new Date().toISOString(),
              match_ended_at: new Date().toISOString(),
              winner_wallet: winnerWallet,
              total_prize_pool: (amount * humansCount),
              participants,
              game_data: { matchSessionId: msid },
              status: 'completed',
              payout_processed: false,
            }).select('id').single();
            matchId = mrRow?.id || null;
            try { if (!selectedEscrow && meta && meta.escrow) selectedEscrow = meta.escrow } catch {}
            try { if (selectedEscrow && global.cachedEscrowBySession) global.cachedEscrowBySession.set(msid, selectedEscrow); } catch {}
          }
        } catch (e) {
          console.warn('match_results insert (fast path) failed:', e?.message || e);
        }

        console.log('[PAYOUT][REQUEST][HTTP][CLIENT_END]', { matchId, matchSessionId: msid, winner: winnerWallet, prizePool: (amount * humansCount) });
        const resp = await fetch(`${baseUrl}/api/payout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${secret}` },
          body: JSON.stringify({ winnerAddress: winnerWallet, prizePool: (amount * humansCount), matchId: matchId || undefined, matchSessionId: msid, escrowWalletId: selectedEscrow || undefined })
        }).catch(() => null);
        if (resp && resp.ok) {
          console.log('💸 Ranked payout executed via HTTP (client-declared end)');
          try { if (global.payoutTriggeredBySession) global.payoutTriggeredBySession.add(idempoKey); } catch {}
        } else {
          const status = resp ? resp.status : 'no_response';
          const txt = resp ? await resp.text().catch(() => '') : 'no response';
          console.warn('⚠️ HTTP payout failed (client-declared end)', { matchId, status, details: txt });
        }
        try { if (global.payoutInFlightBySession) global.payoutInFlightBySession.delete(idempoKey); } catch {}
      } catch (err) {
        console.warn('match_end handler error:', err?.message || err);
        try { if (global.payoutInFlightBySession) global.payoutInFlightBySession.delete(`${String(payload?.matchSessionId||'')}:${String((payload?.winnerWallet||'')).toLowerCase()}`); } catch {}
      }
    });

    // Handle spectate match
    socket.on('spectate_match', ({ matchId }) => {
      console.log(`👁️ Spectator ${socket.id} joining match ${matchId}`);
      const room = gameRooms.get(matchId);
      if (room) {
        socket.join(matchId);
        
        // Mark as spectator
        const connection = activeConnections.get(socket.id);
        if (connection) {
          connection.isSpectator = true;
          connection.spectatingMatch = matchId;
        }
        
        // Send current game state
        socket.emit('game_state_update', room.gameState);
        
        // Send match metadata
        const now = Date.now();
        const elapsed = Math.floor((now - room.startTime) / 1000);
        socket.emit('match_metadata', {
          matchId,
          startedAt: new Date(room.startTime).toISOString(),
          elapsedSeconds: elapsed,
          spectatorCount: io.sockets.adapter.rooms.get(matchId)?.size - 2 || 0,
        });
        
        // Notify other spectators
        socket.to(matchId).emit('spectator_joined', {
          spectatorId: socket.id,
          spectatorCount: io.sockets.adapter.rooms.get(matchId)?.size - 2 || 0,
        });
      } else {
        socket.emit('spectate_error', { message: 'Match not found' });
      }
    });

    // Handle leaving spectator mode
    socket.on('leave_spectate', ({ matchId }) => {
      console.log(`👁️ Spectator ${socket.id} leaving match ${matchId}`);
      socket.leave(matchId);
      
      const connection = activeConnections.get(socket.id);
      if (connection) {
        connection.isSpectator = false;
        connection.spectatingMatch = null;
      }
      
      // Notify other spectators
      socket.to(matchId).emit('spectator_left', {
        spectatorId: socket.id,
        spectatorCount: io.sockets.adapter.rooms.get(matchId)?.size - 2 || 0,
      });
    });

    // Handle spectator chat messages
    socket.on('spectator_chat', ({ matchId, message, username }) => {
      if (!checkRateLimit('spectator_chat', 20)) {
        console.warn(`⚠️ Rate limit exceeded for spectator_chat: ${socket.id}`);
        return;
      }
      
      console.log(`💬 Spectator ${socket.id} sent message in match ${matchId}`);
      
      // Broadcast to all in the match room
      io.to(matchId).emit('chat_message', {
        id: `${socket.id}-${Date.now()}`,
        user: {
          id: socket.id,
          name: username || `Spectator_${socket.id.slice(0, 6)}`,
          address: socket.id.slice(0, 10),
        },
        message: message,
        timestamp: new Date().toISOString(),
        isSpectator: true,
      });
    });

    // Handle disconnect
    socket.on('disconnect', (reason) => {
      console.log(`❌ Client disconnected: ${socket.id}. Reason: ${reason}`);

      // Gracefully handle wallet handoff/reconnects: wait briefly before removing
      try {
        const connection = activeConnections.get(socket.id);
        const lobbyAtDisconnect = connection?.currentLobby;
        const walletAtDisconnect = connection?.walletAddress;

        const tryRemoveAfterGrace = async () => {
          try {
            if (!lobbyAtDisconnect || !walletAtDisconnect) return;
            // If any other socket with the same wallet is connected, skip removal
            for (const [id, conn] of activeConnections.entries()) {
              if (id !== socket.id && conn.walletAddress === walletAtDisconnect) {
                console.log(`↩️ Handoff detected for ${walletAtDisconnect}; skipping removal from ${lobbyAtDisconnect}`);
                // Still refresh presence-based snapshot so roster remains accurate across tabs
                try { if (global.lobbyPresence && global.lobbyPresence.has(lobbyAtDisconnect)) global.lobbyPresence.get(lobbyAtDisconnect).add(walletAtDisconnect); } catch {}
                return;
              }
            }

            // For guests in tutorial, force-remove if no active socket is present
            const isGuest = String(walletAtDisconnect || '').startsWith('guest_')
            if (isGuest) {
              try { if (global.lobbyPresence && global.lobbyPresence.has(lobbyAtDisconnect)) global.lobbyPresence.get(lobbyAtDisconnect).delete(walletAtDisconnect); } catch {}
            }

            const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${port}`;
            await fetch(`${baseUrl}/api/lobbies`, {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ lobbyId: lobbyAtDisconnect, playerId: walletAtDisconnect })
            }).catch(() => {});
            // Also update presence map
            if (global.lobbyPresence && global.lobbyPresence.has(lobbyAtDisconnect)) {
              global.lobbyPresence.get(lobbyAtDisconnect).delete(walletAtDisconnect);
            }
            // Notify others in lobby about leave
            try {
              io.to(lobbyAtDisconnect).emit('player_left_lobby', {
                playerId: walletAtDisconnect,
                timestamp: Date.now(),
              });
            } catch {}

            // Broadcast updated lobby roster immediately (and prune ghosts for tutorial)
            try {
              const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${port}`;
              const res = await fetch(`${baseUrl}/api/lobbies`).catch(() => null);
              const all = res ? await res.json().catch(() => []) : [];
              const lobby = Array.isArray(all) ? all.find(l => l && l.id === lobbyAtDisconnect) : null;
              if (lobby) {
                if (lobby.matchType === 'tutorial') {
                  const presence = (global.lobbyPresence && global.lobbyPresence.get(lobbyAtDisconnect)) || new Set();
                  lobby.players = lobby.players.filter((p) => p.isAi || presence.has(String(p.playerId || '').toLowerCase()))
                }
                let lobbyPlayers = lobby.players.map(player => {
                  let isReady = false;
                  for (const [, c] of activeConnections.entries()) {
                    if (c.currentLobby === lobbyAtDisconnect && c.walletAddress === player.playerId) { isReady = !!c.isReady; break; }
                  }
                  return {
                    playerId: player.playerId,
                    username: player.username || player.playerId.slice(0, 8) + '...',
                    chickenName: player.chickenId || 'Default',
                    // Apply tutorial-style caching to all lobbies: AI auto-ready in tutorial; otherwise preserve last known ready if present in presence map
                    isReady: (lobby.matchType === 'tutorial' && player.isAi) ? true : isReady,
                    isAi: player.isAi || false
                  };
                });
            const version = nextLobbyVersion(lobbyAtDisconnect);
            io.to(lobbyAtDisconnect).emit('lobby_updated', {
                  id: lobbyAtDisconnect,
                  players: lobbyPlayers,
                  capacity: lobby.capacity,
                  amount: lobby.amount,
                  currency: lobby.currency,
                  matchType: lobby.matchType,
                  version
                });
            // Broadcast updated counts derived from presence
            try {
              const presence = (global.lobbyPresence && global.lobbyPresence.get(lobbyAtDisconnect)) || new Set();
              const humans = Array.from(presence.values()).filter((w) => !(String(w).startsWith('ai-')));
              io.emit('lobby_counts', { id: lobbyAtDisconnect, liveHumans: humans.length, liveTotal: presence.size });
            } catch {}
              }
            } catch {}
          } catch {}
        };

        // Small grace period to allow immediate reconnection/handoff
        setTimeout(tryRemoveAfterGrace, 800);
      } catch {}

      // Always remove this socket from active connections immediately to avoid ghost counts
      try {
        const conn = activeConnections.get(socket.id);
        const lastLobby = conn?.currentLobby;
        activeConnections.delete(socket.id);
        // After removal, recompute counts for the last lobby this socket was in
        if (lastLobby) {
          try {
            const c = getLobbyCounts(lastLobby);
            io.emit('lobby_counts', { id: lastLobby, liveHumans: c.humans, liveTotal: c.total });
          } catch {}
        }
      } catch { activeConnections.delete(socket.id); }

      // Check if player was in a game room
      for (const [roomId, room] of gameRooms.entries()) {
        if (room.player1Id === socket.id || room.player2Id === socket.id) {
          console.log(`🔌 Player ${socket.id} disconnected from match ${roomId}`);
          
          const otherPlayerId = room.player1Id === socket.id ? room.player2Id : room.player1Id;
          const otherPlayer = activeConnections.get(otherPlayerId);
          
          if (otherPlayer?.socket) {
            otherPlayer.socket.emit('opponent_disconnected');
            otherPlayer.status = 'idle';
          }
          
          // End match due to disconnect
          io.to(roomId).emit('match_ended', { 
            winner: otherPlayerId, 
            byDisconnect: true 
          });
          
          gameRooms.delete(roomId);
          break;
        }
      }
    });
  });

  // Check if lobby is ready to start
  async function checkLobbyReadyStatus(lobbyId, io) {
    try {
      // Fetch lobby data from API to get the real player list (avoid stale cache)
      const baseUrl = `http://localhost:${port}`;
      const response = await fetch(`${baseUrl}/api/lobbies`, { cache: 'no-store' }).catch(() => null);
      const lobbies = response ? await response.json().catch(() => []) : [];
      const lobby = lobbies.find(l => l.id === lobbyId);
      
      if (lobby) {
        // Merge API lobby players with socket ready status
        let lobbyPlayers = lobby.players.map(player => {
          // Normalize identifiers for consistent matching
          const pid = String(player.playerId || '');
          const pidLower = pid.toLowerCase();
          let connectionReady = false;
          for (const [, connection] of activeConnections.entries()) {
            const connWallet = String(connection.walletAddress || '').toLowerCase();
            if (connection.currentLobby === lobbyId && connWallet === pidLower) {
              connectionReady = !!connection.isReady;
              break;
            }
          }
          // Ranked authority: consider a human ready if they have wagered, regardless of socket flag
          let isReady = connectionReady;
          if (lobby.matchType !== 'tutorial' && (lobby.amount || 0) > 0 && !player.isAi) {
            isReady = Boolean(player.hasWagered) || connectionReady;
          }
          
          return {
            playerId: player.playerId,
            username: player.username || player.playerId.slice(0, 8) + '...',
            chickenName: player.chickenId || 'Default',
            // AI auto-ready only in tutorial lobbies
            isReady: (lobby.matchType === 'tutorial' && player.isAi) ? true : isReady,
            isAi: player.isAi || false
          };
        });

        // Tutorial: if API roster is empty/stale, rebuild humans from live socket presence (no AI)
        try {
          if (lobby.matchType === 'tutorial') {
            const seen = new Set(lobbyPlayers.map(p => p.playerId));
            const presenceHumans = [];
            for (const [, connection] of activeConnections.entries()) {
              if (connection.currentLobby === lobbyId && connection.walletAddress) {
                presenceHumans.push({
                  playerId: connection.walletAddress,
                  username: connection.walletAddress.slice(0, 8) + '...',
                  chickenName: 'Default',
                  isReady: !!connection.isReady,
                  isAi: false,
                });
              }
            }
            // Prefer presence-only list to avoid mismatches with API during tutorial tests
            if (presenceHumans.length > 0) {
              lobbyPlayers = presenceHumans;
            }
          }
        } catch {}

        // Disabled tutorial AI backfill for now
        try { /* no-op */ } catch {}
        
        // Filter out ghost humans (present in API but no live socket presence)
        let presenceSet = new Set();
        try {
          for (const [, c] of activeConnections.entries()) {
            if (c && c.currentLobby === lobbyId && c.walletAddress) presenceSet.add(String(c.walletAddress).toLowerCase());
          }
        } catch {}
        let eligiblePlayers = lobbyPlayers.filter(p => p.isAi || presenceSet.has(String(p.playerId || '').toLowerCase()));
        if (eligiblePlayers.length !== lobbyPlayers.length) {
          console.log(`🧹 Filtered ${lobbyPlayers.length - eligiblePlayers.length} ghost player(s) from ${lobbyId} for readiness check`);
        }

        // Presence-based fallback when API list is empty/stale
        if (eligiblePlayers.length === 0 && presenceSet.size > 0) {
          try {
            const built = [];
            for (const addr of presenceSet.values()) {
              const idLower = String(addr || '').toLowerCase();
              let readyFlag = false;
              for (const [, c] of activeConnections.entries()) {
                if (c.currentLobby === lobbyId && String(c.walletAddress || '').toLowerCase() === idLower) { readyFlag = !!c.isReady; break; }
              }
              let hasWageredFlag = false;
              try {
                const map = global.lobbyRoster && global.lobbyRoster.get ? global.lobbyRoster.get(lobbyId) : null;
                const cur = map && map.get ? map.get(idLower) : null;
                hasWageredFlag = !!(cur && cur.hasWagered);
              } catch {}
              built.push({ playerId: addr, username: String(addr).slice(0,8)+'...', chickenName: 'Default', isReady: readyFlag, isAi: false, hasWagered: hasWageredFlag });
            }
            eligiblePlayers = built;
            console.log(`[READY][FALLBACK] Using presence-based roster for ${lobbyId}`, { count: eligiblePlayers.length });
          } catch {}
        }

        // Check if we have minimum players and all are ready (uniform policy)
        const minPlayers = lobbyId.includes('tutorial') ? 2 : 2;
        // In ranked, a human counts as ready if they have wagered (authoritative), even if socket flag is late
        const readyPlayers = eligiblePlayers.filter(p => {
          if (lobby.matchType !== 'tutorial' && (lobby.amount || 0) > 0 && !p.isAi) {
            // Avoid TS syntax in Node: check both props safely
            return Boolean(p.isReady) || Boolean((p && p.hasWagered));
          }
          return p.isReady || (lobby.matchType === 'tutorial' && p.isAi);
        });
        const hasHumanReady = lobbyId.includes('tutorial') ? eligiblePlayers.some(p => !p.isAi && p.isReady) : true;
        let allReady = eligiblePlayers.length >= minPlayers && 
                       readyPlayers.length === eligiblePlayers.length && hasHumanReady;

        // Ranked enforcement: require wagers; auto-assign escrow if missing (do not block countdown)
        if (!lobbyId.includes('tutorial')) {
          try {
            const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${port}`;
            const res = await fetch(`${baseUrl}/api/lobbies`, { cache: 'no-store' });
            const all = await res.json();
            const liveLobby = all.find(l => l.id === lobbyId);
            if (liveLobby && liveLobby.amount > 0) {
              const humans = (liveLobby.players || []).filter(p => !p.isAi && presenceSet.has(String(p.playerId || '').toLowerCase()));
              // Cross-check hasWagered with socket roster map to avoid API staleness
              let allWagered = false;
              try {
                const roster = (global.lobbyRoster && global.lobbyRoster.get(lobbyId)) || null;
                allWagered = humans.length > 0 && humans.every((p) => {
                  const key = String(p.playerId || '').toLowerCase();
                  const entry = roster && roster.get ? roster.get(key) : null;
                  return Boolean(p.hasWagered) || Boolean(entry && entry.hasWagered);
                });
              } catch {
                allWagered = humans.length > 0 && humans.every(p => Boolean(p.hasWagered));
              }
              // Ensure escrow is assigned if missing (best-effort)
              if (!liveLobby.escrowWalletId) {
                try {
                  const { evmEscrowService } = require('./lib/evm-escrow-service.ts');
                  const wallet = evmEscrowService.getNextWallet();
                  if (wallet && wallet.id) {
                    const mem = lobbies.find(l => l && l.id === lobbyId);
                    if (mem) mem.escrowWalletId = wallet.id;
                    liveLobby.escrowWalletId = wallet.id;
                    console.log(`🔐 Auto-assigned escrow ${wallet.id} to ${lobbyId} during ready check`);
                  }
                } catch {}
              }
              if (!allWagered) {
                // Debug which wallets are missing wager evidence (API vs roster)
                try {
                  const roster = (global.lobbyRoster && global.lobbyRoster.get(lobbyId)) || null;
                  const status = humans.map((p) => {
                    const key = String(p.playerId || '').toLowerCase();
                    const entry = roster && roster.get ? roster.get(key) : null;
                    return { wallet: key, apiHasWagered: !!p.hasWagered, rosterHasWagered: !!(entry && entry.hasWagered) };
                  });
                  const unpaid = status.filter(s => !s.apiHasWagered && !s.rosterHasWagered).map(s => s.wallet);
                  console.log(`[ENFORCE][RANKED] waiting for wagers in ${lobbyId}`, { presentHumans: humans.length, unpaid });
                } catch {}
                allReady = false;
                const version2 = nextLobbyVersion(lobbyId);
                try { const snap = await buildLobbySnapshot(lobbyId); if (snap) io.to(lobbyId).emit('lobby_updated', { ...snap, version: version2 }); } catch {}
                console.log(`⏸️ Ranked lobby ${lobbyId} waiting for wagers: allWagered=${allWagered}`);
              } else {
                // If all present humans are wagered, treat lobby as ready based on wager authority
                // This bypasses transient UI readiness lag on any single device
                allReady = humans.length >= minPlayers;
                if (allReady) {
                  console.log(`✅ Ranked lobby ${lobbyId} all humans have wagers; proceeding with countdown`);
                }
              }
            }
          } catch (e) {
            console.warn('⚠️ Enforcement check failed, deferring start:', e?.message || e);
            allReady = false;
          }
        }
        
        console.log(`🎯 Lobby ${lobbyId} status: ${readyPlayers.length}/${eligiblePlayers.length} ready (min: ${minPlayers})`);
        
        if (!allReady) {
          // If readiness dropped, cancel any scheduled pre-countdown
          try {
            if (global.preCountdownTimers && global.preCountdownTimers[lobbyId]) {
              clearTimeout(global.preCountdownTimers[lobbyId]);
              delete global.preCountdownTimers[lobbyId];
              console.log(`⏹️ Pre-countdown cancelled for lobby ${lobbyId} (not all ready anymore)`);
            }
          } catch {}
          // Majority-ready grace logic
          try {
            const humans = eligiblePlayers.filter(p => !p.isAi);
            const readyHumans = humans.filter(p => p.isReady);
            const totalHumans = humans.length;
            const majorityThreshold = Math.floor(totalHumans / 2) + 1;
            // Only allow majority logic when there are 3 or more humans (remove 2-human special-case)
            const hasMajorityReady = (totalHumans >= 3 && readyHumans.length >= majorityThreshold && eligiblePlayers.length >= minPlayers);

            if (!global.majorityGrace) global.majorityGrace = Object.create(null);

            if (hasMajorityReady) {
              if (!global.majorityGrace[lobbyId]) {
                const endsAt = Date.now() + 15000;
                console.log(`⏱️ Majority ready in ${lobbyId}. Starting 15s grace.`);
              // Immediately normalize readiness to avoid glitches:
              // - Tutorial: mark every player ready
              // - Ranked: mark paid humans ready; remove unpaid humans
              ;(async () => {
                try {
          const baseUrlLocal = `http://localhost:${port}`;
          const resLive = await fetch(`${baseUrlLocal}/api/lobbies`, { cache: 'no-store' }).catch(() => null);
                  const allLive = resLive ? await resLive.json().catch(() => []) : [];
                  const liveLobby = Array.isArray(allLive) ? allLive.find(l => l && l.id === lobbyId) : null;
                  if (!liveLobby) return;
                  const isTutorial = liveLobby.matchType === 'tutorial';
                  const roster = Array.isArray(liveLobby.players) ? liveLobby.players : [];
                  for (const p of roster) {
                    const playerId = String(p.playerId || '');
                    if (!playerId) continue;
                    if (isTutorial) {
                      // Push everyone ready
                      try { await fetch(`${baseUrlLocal}/api/lobbies`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lobbyId, playerId, isReady: true }) }).catch(() => {}); } catch {}
                    } else {
                      if (!p.isAi) {
                        const hasWagered = Boolean(p.hasWagered);
                        if (hasWagered) {
                          // Mark as ready
                          try { await fetch(`${baseUrlLocal}/api/lobbies`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lobbyId, playerId, isReady: true }) }).catch(() => {}); } catch {}
                        } else {
                          // Remove unpaid human from lobby to avoid bugs during start
                          try { await fetch(`${baseUrlLocal}/api/lobbies`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lobbyId, playerId }) }).catch(() => {}); } catch {}
                        }
                      }
                    }
                  }
                } catch (e) {
                  console.warn('majority readiness normalize failed:', e?.message || e);
                }
              })();
                const intervalId = setInterval(async () => {
                  const seconds = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
                  try { io.to(lobbyId).emit('majority_grace', { seconds }); } catch {}

                  if (seconds <= 0) {
                    clearInterval(intervalId);
                    try { delete global.majorityGrace[lobbyId]; } catch {}

                    // Rebuild current roster and filter to ready humans (and AIs for tutorial), ignoring ghosts
                    try {
          const resNow = await fetch(`${`http://localhost:${port}`}/api/lobbies`, { cache: 'no-store' }).catch(() => null);
                      const allNow = resNow ? await resNow.json().catch(() => []) : [];
                      const liveLobbyNow = Array.isArray(allNow) ? allNow.find(l => l && l.id === lobbyId) : null;
                      if (!liveLobbyNow) return;
                      // Merge with socket readiness
                      const mergedPlayers = (liveLobbyNow.players || []).reduce((acc, player) => {
                        const pid = String(player.playerId || '').toLowerCase();
                        const present = presenceSet.has(pid);
                        if (!player.isAi && !present) return acc; // ignore ghost humans
                        let isReady = false;
                        for (const [, connection] of activeConnections.entries()) {
                          if (connection.currentLobby === lobbyId && String(connection.walletAddress || '').toLowerCase() === pid) { isReady = !!connection.isReady; break; }
                        }
                        acc.push({ playerId: player.playerId, username: player.username, chickenName: player.chickenId, isAi: !!player.isAi, isReady });
                        return acc;
                      }, []);
                      const isTutorialNow = liveLobbyNow.matchType === 'tutorial';
                      const readyHumansNow = mergedPlayers.filter(p => !p.isAi && p.isReady);
                      let majorityRoster = readyHumansNow;
                      if (isTutorialNow) {
                        const aiPlayers = mergedPlayers.filter(p => p.isAi);
                        majorityRoster = [...readyHumansNow, ...aiPlayers];
                      }
                      if (majorityRoster.length === 0) return; // Nothing to start with

                      // Start the standard 5s countdown and then queue phase with override roster
                      try { if (!global.countdownActive) global.countdownActive = Object.create(null); } catch {}
                      if (global.countdownActive && global.countdownActive[lobbyId]) return;
                      global.countdownActive[lobbyId] = true;

                      console.log(`🚀 Majority grace elapsed for ${lobbyId}, starting 5s countdown with ${majorityRoster.length} players.`);
                      let countdown = 5;
                      const countdownInterval = setInterval(() => {
                        try { io.to(lobbyId).emit('match_starting', { countdown }); } catch {}
                        countdown--;
                        if (countdown < 0) {
                clearInterval(countdownInterval);
                try { io.to(lobbyId).emit('match_started'); } catch {}
                try { console.log(`[match] match_started`, { lobbyId }); } catch {}
                // Clear lobby association on all sockets so lobby counts drop immediately
                try {
                  for (const [, conn] of activeConnections.entries()) {
                    if (conn.currentLobby === lobbyId) {
                      delete conn.currentLobby;
                      conn.isReady = false;
                    }
                  }
                } catch {}
                // Broadcast recomputed counts after clearing associations
                try {
                  const c = getLobbyCounts(lobbyId);
                  io.emit('lobby_counts', { id: lobbyId, liveHumans: c.humans, liveTotal: c.total });
                } catch {}
                // Reset readiness and wagers for this lobby to avoid sticky UI state
                try {
                  // Reset socket-only roster entries
                  const map = getRosterMap(lobbyId);
                  for (const [k, v] of map.entries()) { map.set(k, { ...v, isReady: false, hasWagered: false }); }
                  // Reset in-memory API lobby players
                  const lob = lobbies.find(l => l && l.id === lobbyId);
                  if (lob && Array.isArray(lob.players)) {
                    lob.players = lob.players.map(p => ({ ...p, isReady: false, hasWagered: false }));
                  }
                  // Emit a fresh snapshot so lobby UIs clear ready states
                  const version = nextLobbyVersion(lobbyId);
                  buildLobbySnapshot(lobbyId).then((snap) => {
                    try { if (snap) io.to(lobbyId).emit('lobby_updated', { ...snap, version }); } catch {}
                  }).catch(() => {});
                } catch {}
                try { if (global.countdownActive) delete global.countdownActive[lobbyId]; } catch {}
                const overrideRoster = majorityRoster.map(p => ({ wallet: p.playerId, isAi: p.isAi, username: p.username || (p.playerId ? p.playerId.slice(0,8)+'...' : 'Player'), chickenName: p.chickenName || 'Default' }));
                try { startQueuePhase(lobbyId, io, overrideRoster).catch(() => {}); } catch {}
                        }
                      }, 1000);
                    } catch (e) {
                      console.warn('majority grace finalize failed:', e?.message || e);
                    }
                  }
                }, 1000);

                global.majorityGrace[lobbyId] = { endsAt, intervalId };
              }
            } else {
              // Cancel grace when no longer majority
              if (global.majorityGrace && global.majorityGrace[lobbyId]) {
                try { clearInterval(global.majorityGrace[lobbyId].intervalId); } catch {}
                delete global.majorityGrace[lobbyId];
                console.log(`⏹️ Majority grace cancelled for ${lobbyId} (majority lost)`);
              }
            }
          } catch (e) {
            console.warn('majority grace error:', e?.message || e);
          }
        }

        if (allReady) {
          // If countdown already running or scheduled, do nothing
          if (global.countdownActive && global.countdownActive[lobbyId]) {
            return;
          }
          if (global.preCountdownTimers && global.preCountdownTimers[lobbyId]) {
            return;
          }

          // Schedule a short pre-countdown delay so the roster is visible
          global.preCountdownTimers[lobbyId] = setTimeout(async () => {
            try {
              // Mark countdown active
              if (!global.countdownActive) global.countdownActive = Object.create(null);
              global.countdownActive[lobbyId] = true;
            } catch {}

            console.log(`🚀 Lobby ${lobbyId} starting countdown!`);
            let countdown = 5;
            const countdownInterval = setInterval(() => {
              try { io.to(lobbyId).emit('match_starting', { countdown }); } catch {}
              countdown--;
              if (countdown < 0) {
                clearInterval(countdownInterval);
                try { io.to(lobbyId).emit('match_started'); } catch {}
                try { console.log(`[match] match_started`, { lobbyId }); } catch {}
                // Clear lobby association on all sockets so lobby counts drop immediately
                try {
                  for (const [, conn] of activeConnections.entries()) {
                    if (conn.currentLobby === lobbyId) {
                      delete conn.currentLobby;
                      conn.isReady = false;
                    }
                  }
                } catch {}
                // Reset readiness and wagers for this lobby to avoid sticky UI state into the next round (ranked)
                try {
                  // Reset socket-only roster entries
                  const map = getRosterMap(lobbyId);
                  for (const [k, v] of map.entries()) { map.set(k, { ...v, isReady: false, hasWagered: false }); }
                  // Reset in-memory API lobby players
                  const lob = lobbies.find(l => l && l.id === lobbyId);
                  if (lob && Array.isArray(lob.players)) {
                    lob.players = lob.players.map(p => ({ ...p, isReady: false, hasWagered: false }));
                  }
                  // Emit a fresh snapshot so lobby UIs clear ready states
                  const version = nextLobbyVersion(lobbyId);
                  buildLobbySnapshot(lobbyId).then((snap) => {
                    try { if (snap) io.to(lobbyId).emit('lobby_updated', { ...snap, version }); } catch {}
                  }).catch(() => {});
                } catch {}
                // Clear active flag at the end
                try { if (global.countdownActive) delete global.countdownActive[lobbyId]; } catch {}
                // Begin server-side queue confirmation phase (fire-and-forget)
                try {
                  // For tutorial, pass a presence-derived override roster to avoid API dependency
                  let override = null;
                  if (lobby.matchType === 'tutorial') {
                    override = lobbyPlayers.filter(p => !p.isAi).map(p => ({
                      wallet: p.playerId,
                      isAi: false,
                      username: p.username || (p.playerId ? p.playerId.slice(0,8)+'...' : 'Player'),
                      chickenName: p.chickenName || 'Default',
                    }));
                  }
                  startQueuePhase(lobbyId, io, override || undefined).catch(() => {});
                } catch (e) { console.warn('queue begin failed (non-fatal):', e?.message || e); }
              }
            }, 1000);

            // Clear the pre-countdown timer reference
            try { if (global.preCountdownTimers) delete global.preCountdownTimers[lobbyId]; } catch {}
          }, 1500); // 1.5s visibility delay
        }
      } else {
        // Fallback to socket-only method
        console.log(`⚠️ Lobby ${lobbyId} not found in API, using socket-only ready check`);
        const lobbyPlayers = [];
        
        for (const [id, connection] of activeConnections.entries()) {
          if (connection.currentLobby === lobbyId) {
            const randomChickens = ['Warrior', 'Ninja', 'Berserker', 'Mage', 'Tank', 'Assassin', 'Paladin', 'Archer'];
            const randomChicken = randomChickens[Math.floor(Math.random() * randomChickens.length)];
            
            lobbyPlayers.push({
              playerId: id,
              username: `Player_${id.slice(0, 6)}`,
              chickenName: randomChicken,
              isReady: connection.isReady || false,
              isAi: false
            });
          }
        }
        
        // Check if we have minimum players and all are ready
        const minPlayers = lobbyId.includes('tutorial') ? 2 : 2;
        const hasHumanReady = lobbyId.includes('tutorial') ? lobbyPlayers.some(p => !p.isAi && p.isReady) : true;
        const allReady = lobbyPlayers.length >= minPlayers && 
                         lobbyPlayers.every(p => p.isReady || p.isAi) && hasHumanReady;
        
        if (allReady) {
          console.log(`🚀 Lobby ${lobbyId} is ready to start!`);
          
          // Start countdown
          let countdown = 5;
          const countdownInterval = setInterval(() => {
            io.to(lobbyId).emit('match_starting', { countdown });
            countdown--;
            
            if (countdown < 0) {
              clearInterval(countdownInterval);
              io.to(lobbyId).emit('match_started');
              try { console.log(`[match] match_started`, { lobbyId }); } catch {}
              // Clean up lobby connections (drop lobby association)
              try {
                for (const [id, connection] of activeConnections.entries()) {
                  if (connection.currentLobby === lobbyId) {
                    delete connection.currentLobby;
                    connection.isReady = false;
                  }
                }
              } catch {}
              // Broadcast recomputed counts
              try {
                const c = getLobbyCounts(lobbyId);
                io.emit('lobby_counts', { id: lobbyId, liveHumans: c.humans, liveTotal: c.total });
              } catch {}
            }
          }, 1000);
        }
      }
    } catch (error) {
      console.error('❌ Error checking lobby ready status:', error);
    }
  }

  // Begin queue confirmation phase for a lobby
  async function startQueuePhase(lobbyId, io, rosterOverride = null) {
    try {
      // Per-lobby lock to avoid concurrent queue sessions
      try {
        if (global.queueLocks && global.queueLocks.has(lobbyId)) {
          const heldAt = global.queueLocks.get(lobbyId);
          console.log(`[queue] lock held for ${lobbyId} since ${heldAt}; skipping startQueuePhase`);
          return;
        }
        global.queueLocks.set(lobbyId, Date.now());
      } catch {}

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${port}`;
      let expectedRoster;
      let isTutorial = false;
      let escrowIdVal = null;

      // Always fetch lobby metadata once for tutorial/escrow determination
      let lobbyMeta = null;
      try {
        const response = await fetch(`${baseUrl}/api/lobbies`).catch(() => null);
        const all = response ? await response.json().catch(() => []) : [];
        lobbyMeta = Array.isArray(all) ? all.find(l => l && l.id === lobbyId) : null;
      } catch {}

      if (Array.isArray(rosterOverride) && rosterOverride.length > 0) {
        expectedRoster = rosterOverride;
        isTutorial = lobbyMeta ? lobbyMeta.matchType === 'tutorial' : false;
        escrowIdVal = lobbyMeta && lobbyMeta.escrowWalletId ? lobbyMeta.escrowWalletId : null;
      } else {
        if (!lobbyMeta) return;
        // Build expected roster from API (tutorial may include AI; ranked is humans only)
        expectedRoster = (lobbyMeta.players || []).map(p => ({
          wallet: p.playerId,
          isAi: !!p.isAi,
          username: p.username || (p.playerId ? p.playerId.slice(0, 8) + '...' : 'Player'),
          chickenName: p.chickenId || 'Default'
        }));
        isTutorial = lobbyMeta.matchType === 'tutorial';
        if (!isTutorial) expectedRoster = expectedRoster.filter(e => !e.isAi);
        // Ensure tutorial expected roster includes AI backfill to capacity
        if (isTutorial) {
          const missing = Math.max(0, (lobbyMeta.capacity || 8) - expectedRoster.length);
          if (missing > 0) {
            const aiNames = ['ChickenBot', 'RoboRooster', 'CyberCluck', 'TechnoTender', 'ByteBird', 'PixelPecker', 'DataDrummer', 'CodeCock'];
            for (let i = 0; i < missing; i++) {
              const name = aiNames[Math.floor(Math.random() * aiNames.length)];
              expectedRoster.push({ wallet: `ai-${Date.now()}-${i}`, isAi: true, username: name, chickenName: 'default-ai-chicken' });
            }
          }
        }
        escrowIdVal = lobbyMeta && lobbyMeta.escrowWalletId ? lobbyMeta.escrowWalletId : null;
      }

      // Guard against duplicate sessions for the same lobby (secondary guard in addition to lock)
      try {
        const existingMs = global.activeQueueForLobby && global.activeQueueForLobby.get(lobbyId);
        if (existingMs) {
          console.log(`[queue] startQueuePhase: existing session ${existingMs} for ${lobbyId}, skipping new session`);
          return;
        }
      } catch {}

      const matchSessionId = `ms-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
      const arenaSeed = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      const ackDeadlineMs = 4000;

      const session = {
        id: matchSessionId,
        lobbyId,
        expectedRoster,
        arenaSeed,
        createdAt: Date.now(),
        ackDeadlineMs,
        presenceAcks: new Map(), // wallet -> ts
        assetsAcks: new Map(),   // wallet -> ts
      };
      try { global.queueSessions.set(matchSessionId, session); } catch {}
      try { global.activeQueueForLobby.set(lobbyId, matchSessionId); } catch {}
      // Pre-create match_results for ranked matches to guarantee a matchId
      try {
        const humans = (expectedRoster || []).filter(r => !r.isAi).map(r => r.wallet);
        if (!isTutorial && humans.length >= 2) {
          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
          const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
          if (supabaseUrl && supabaseServiceKey) {
            const { createClient } = require('@supabase/supabase-js');
            const supabase = createClient(supabaseUrl, supabaseServiceKey);
            const participants = humans.map((w) => ({ wallet: w, wager_amount: Number(lobbyMeta?.amount || 0) }));
            const { data: mrRow } = await supabase.from('match_results').insert({
              lobby_id: lobbyId,
              escrow_wallet_id: escrowIdVal || null,
              match_started_at: new Date().toISOString(),
              status: 'in_progress',
              total_prize_pool: Number(lobbyMeta?.amount || 0) * humans.length,
              participants,
              game_data: { matchSessionId },
              payout_processed: false,
            }).select('id').single();
            const mrId = mrRow?.id || null;
            try {
              if (mrId) {
                if (!global.recentMatchMetaBySession) global.recentMatchMetaBySession = new Map();
                if (!global.recentMatchMetaByWallet) global.recentMatchMetaByWallet = new Map();
                const meta = { lobbyId, matchSessionId, humans, humansCount: humans.length, amount: Number(lobbyMeta?.amount || 0), escrow: escrowIdVal, matchResultId: mrId };
                global.recentMatchMetaBySession.set(matchSessionId, meta);
                humans.forEach(w => global.recentMatchMetaByWallet.set(String(w).toLowerCase(), meta));
              }
            } catch {}
          }
        }
      } catch {}

      // Notify clients to begin queue confirmation
        const qbPayload = {
        matchSessionId,
        expectedRoster,
        arenaSeed,
        serverNow: Date.now(),
        ackDeadlineMs,
          minHumans: isTutorial ? 2 : 2,
        escrowId: escrowIdVal,
      };
      io.to(lobbyId).emit('queue_begin', qbPayload);
      try {
        const humans = (expectedRoster || []).filter(r => !r.isAi).map(r => r.wallet);
        console.log(`[match] queue_begin`, { lobbyId, matchSessionId, humans, totalRoster: (expectedRoster || []).length });
      } catch {}
      try {
        io.to(lobbyId).emit('debug_trace', {
          type: 'queue_begin', lobbyId, matchSessionId,
          expectedRosterWallets: (expectedRoster || []).map(r => r.wallet),
        });
      } catch {}

      // Deadline to finalize the roster (single-shot guard)
      session.__finalized = false;
      const safeFinalize = () => {
        if (session.__finalized) return;
        session.__finalized = true;
        try { finalizeQueueSession(matchSessionId, io); } catch {}
      }
      // Primary deadline
      session.deadlineTimer = setTimeout(safeFinalize, ackDeadlineMs);
      // Safety: also finalize a bit later if 'match_started' was emitted but finalize didn't run due to timing
      setTimeout(() => {
        try {
          const s = global.queueSessions && global.queueSessions.get(matchSessionId);
          if (s && !s.__finalized) safeFinalize();
        } catch {}
      }, ackDeadlineMs + 1500);
    } catch (e) {
      console.warn('startQueuePhase error:', e?.message || e);
    }
    finally {
      // Always release the lock if we didn't get to queue begin
      try { if (global.queueLocks) global.queueLocks.delete(lobbyId); } catch {}
    }
  }

  // Finalize a queue session: lock roster and schedule round start (or cancel/refund)
  async function finalizeQueueSession(matchSessionId, io) {
    const session = global.queueSessions && global.queueSessions.get(matchSessionId);
    if (!session) return;
    const { lobbyId, expectedRoster, presenceAcks, assetsAcks } = session;
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${port}`;
      const response = await fetch(`${baseUrl}/api/lobbies`).catch(() => null);
      const all = response ? await response.json().catch(() => []) : [];
      const lobby = Array.isArray(all) ? all.find(l => l && l.id === lobbyId) : null;
      const isTutorial = lobby ? lobby.matchType === 'tutorial' : false;

      const requiredHumans = expectedRoster.filter(p => !p.isAi).map(p => p.wallet);
      const presentHumans = requiredHumans.filter(w => isTutorial ? presenceAcks.has(w) : (presenceAcks.has(w) && assetsAcks.has(w)));

      // Ranked cancellation if insufficient humans
      const minHumans = isTutorial ? 2 : 2;
      if (!isTutorial && presentHumans.length < minHumans) {
        try {
          // Refund all expected humans (best-effort) via server-only function
          const { processRefundServerOnly } = require('./app/api/wager/refund/route.ts');
          for (const w of requiredHumans) {
            try { await processRefundServerOnly({ lobbyId, playerPublicKey: w, reason: 'insufficient_players' }); } catch {}
          }
        } catch {}
        try { io.to(lobbyId).emit('match_cancelled', { reason: 'insufficient_players' }); } catch {}
        try { global.queueSessions.delete(matchSessionId); } catch {}
        try { global.activeQueueForLobby.delete(lobbyId); } catch {}
        // Release per-lobby lock on cancellation
        try { if (global.queueLocks) global.queueLocks.delete(lobbyId); } catch {}
        return;
      }

      // Build final roster: include present humans only (AI removed)
      let finalRoster = expectedRoster.filter(p => !p.isAi && presentHumans.includes(p.wallet));
      // Remove over-eager tutorial fallback; require at least one human ready AND AI roster populated by prior steps

      // Refund any paid human who failed the queue handshake (ranked only)
      if (!isTutorial) {
        const failedHumans = requiredHumans.filter(w => !presentHumans.includes(w));
        try {
          const { processRefundServerOnly } = require('./app/api/wager/refund/route.ts');
          for (const w of failedHumans) {
            try { await processRefundServerOnly({ lobbyId, playerPublicKey: w, reason: 'queue_no_show' }); } catch {}
          }
        } catch {}
      }

      // Lock roster and schedule a synchronized round start
      const roundStartAtEpochMs = Date.now() + 3000;
      try {
        const payload = { matchSessionId, finalRoster, arenaSeed: session.arenaSeed, roundStartAtEpochMs };
        io.to(lobbyId).emit('arena_lock_roster', payload);
        try {
          const humans = (finalRoster || []).filter(r => !r.isAi).map(r => r.wallet);
          console.log(`[match] arena_lock_roster`, { lobbyId, matchSessionId, humansCount: humans.length, roundStartAtEpochMs });
        } catch {}
        try { io.to(lobbyId).emit('debug_trace', { type: 'arena_lock_roster', lobbyId, matchSessionId, finalRosterWallets: finalRoster.map(r => r.wallet) }); } catch {}
        // Persist payout meta for this match session so end-of-match payout does not depend on lobby polling
        try {
          const humans = finalRoster.filter(r => !r.isAi).map(r => String(r.wallet || '').toLowerCase());
          const amount = lobby && typeof lobby.amount === 'number' ? lobby.amount : 0;
          const escrow = lobby && lobby.escrowWalletId ? lobby.escrowWalletId : null;
          if (!global.recentMatchMetaBySession) global.recentMatchMetaBySession = new Map();
          if (!global.recentMatchMetaByWallet) global.recentMatchMetaByWallet = new Map();
          const meta = { lobbyId, matchSessionId, humans, humansCount: humans.length, amount, escrow, startAt: roundStartAtEpochMs };
          try { global.recentMatchMetaBySession.set(matchSessionId, meta); } catch {}
          try { humans.forEach(w => { global.recentMatchMetaByWallet.set(w, meta); }); } catch {}
        } catch {}
        // Ensure all humans join the match room immediately
        try {
          const humans = finalRoster.filter(r => !r.isAi).map(r => String(r.wallet || '').toLowerCase());
          for (const [sid, conn] of activeConnections.entries()) {
            const w = String(conn.walletAddress || '').toLowerCase();
            if (humans.includes(w)) {
              try { conn.socket.join(matchSessionId); conn.currentMatch = matchSessionId; } catch {}
            }
          }
        } catch {}
      } catch {}

      // Emit 3..0 countdown aligned to round start (synced across clients)
      let c = 3;
      const interval = setInterval(() => {
        try { io.to(lobbyId).emit('round_countdown', { matchSessionId, count: c }); } catch {}
        c--;
        if (c < 0) {
          clearInterval(interval);
          try { io.to(lobbyId).emit('round_start', { matchSessionId, finalRoster }); } catch {}
          try { console.log(`[match] round_start`, { lobbyId, matchSessionId }); } catch {}
          try { io.to(lobbyId).emit('debug_trace', { type: 'round_start', lobbyId, matchSessionId }); } catch {}
          try { const s = global.queueSessions && global.queueSessions.get(matchSessionId); if (s) s.__finalized = true; } catch {}
          try { global.queueSessions.delete(matchSessionId); } catch {}
          try { global.activeQueueForLobby.delete(lobbyId); } catch {}
          // Reset readiness and wagers to ensure re-entry requires paying again
          try {
            const map = getRosterMap(lobbyId);
            for (const [k, v] of map.entries()) { map.set(k, { ...v, isReady: false, hasWagered: false }); }
            const lob = lobbies.find(l => l && l.id === lobbyId);
            if (lob && Array.isArray(lob.players)) {
              lob.players = lob.players.map(p => ({ ...p, isReady: false, hasWagered: false }));
            }
            const version = nextLobbyVersion(lobbyId);
            buildLobbySnapshot(lobbyId).then((snap) => {
              try { if (snap) io.to(lobbyId).emit('lobby_updated', { ...snap, version }); } catch {}
            }).catch(() => {});
          } catch {}
          // Release per-lobby lock on successful round start
          try { if (global.queueLocks) global.queueLocks.delete(lobbyId); } catch {}
        }
      }, 1000);
    } catch (e) {
      console.warn('finalizeQueueSession error:', e?.message || e);
    }
  }

  // Matchmaking function
  function matchPlayers(io) {
    const queuedPlayers = [];
    
    for (const [id, connection] of activeConnections.entries()) {
      if (connection.status === 'queued') {
        queuedPlayers.push({ id, ...connection });
      }
    }

    // Sort by queue time (first in, first matched)
    queuedPlayers.sort((a, b) => a.joinedAt - b.joinedAt);

    while (queuedPlayers.length >= 2) {
      const player1 = queuedPlayers.shift();
      const player2 = queuedPlayers.shift();

      if (!player1 || !player2) continue;

      const roomId = `match_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      const player1Connection = activeConnections.get(player1.id);
      const player2Connection = activeConnections.get(player2.id);

      if (player1Connection && player2Connection) {
        // Update player statuses
        player1Connection.status = 'in_battle';
        player2Connection.status = 'in_battle';

        // Join room
        player1Connection.socket.join(roomId);
        player2Connection.socket.join(roomId);

        // Initialize game state
        const gameState = initializeGameState(player1, player2);
        
        gameRooms.set(roomId, {
          player1Id: player1.id,
          player2Id: player2.id,
          gameState,
          startTime: Date.now(),
          lastUpdateTime: Date.now(),
        });

        // Notify players
        player1Connection.socket.emit('match_found', {
          roomId,
          opponent: player2.playerData,
          gameState,
          isPlayer1: true
        });

        player2Connection.socket.emit('match_found', {
          roomId,
          opponent: player1.playerData,
          gameState,
          isPlayer1: false
        });

        console.log(`🎮 Match created: ${roomId} - ${player1.id} vs ${player2.id}`);
      }
    }
  }

  // Initialize game state
  function initializeGameState(player1, player2) {
    return {
      player1: {
        id: player1.id,
        name: player1.playerData?.name || 'Player 1',
        chicken: player1.playerData?.chicken || {},
        health: 100,
        position: { x: -2, y: 0, z: 0 },
        status: 'alive'
      },
      player2: {
        id: player2.id,
        name: player2.playerData?.name || 'Player 2',
        chicken: player2.playerData?.chicken || {},
        health: 100,
        position: { x: 2, y: 0, z: 0 },
        status: 'alive'
      },
      battleStatus: 'active',
      turn: player1.id,
      round: 1,
      lastActionTime: Date.now()
    };
  }

  // Process battle action
  function processAction(room, playerId, action, targetPosition) {
    const gameState = room.gameState;
    const isPlayer1 = room.player1Id === playerId;
    const currentPlayer = isPlayer1 ? gameState.player1 : gameState.player2;
    const opponent = isPlayer1 ? gameState.player2 : gameState.player1;

    // Basic action processing
    let damage = 0;
    let actionSuccess = false;

    switch (action) {
      case 'attack':
        damage = Math.floor(Math.random() * 30) + 10; // 10-40 damage
        opponent.health = Math.max(0, opponent.health - damage);
        actionSuccess = true;
        break;
      case 'special_attack':
        damage = Math.floor(Math.random() * 50) + 20; // 20-70 damage
        opponent.health = Math.max(0, opponent.health - damage);
        actionSuccess = true;
        break;
      case 'defend':
        // Reduce incoming damage for next turn
        currentPlayer.defending = true;
        actionSuccess = true;
        break;
    }

    // Mark last hit time for tie-breaks
    if (actionSuccess && damage > 0 && opponent.health === 0) {
      const now = Date.now();
      room.lastKillTime = room.lastKillTime || {};
      room.lastKillTime[playerId] = now;
    }

    // Check if battle is over with tie-breaker
    const p1Dead = gameState.player1.health <= 0;
    const p2Dead = gameState.player2.health <= 0;

    let battleOver = false;
    let winner = null;

    if (p1Dead && p2Dead) {
      battleOver = true;
      // Resolve by earliest kill timestamp (who delivered lethal blow first)
      const k1 = room.lastKillTime && room.lastKillTime[room.player1Id] || Infinity;
      const k2 = room.lastKillTime && room.lastKillTime[room.player2Id] || Infinity;
      if (k1 < k2) winner = room.player1Id; else if (k2 < k1) winner = room.player2Id; else winner = playerId;
    } else if (p1Dead || p2Dead) {
      battleOver = true;
      winner = p1Dead ? room.player2Id : room.player1Id;
    }

    if (battleOver) {
      gameState.battleStatus = 'ended';
      gameState.winner = winner;
      gameState.endedAt = Date.now();
    }

    return {
      action,
      playerId,
      damage,
      success: actionSuccess,
      battleOver,
      winner,
      gameState
    };
  }

  // Start the server
  httpServer
    .once('error', (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, () => {
      console.log(`🚀 Server ready on http://${hostname}:${port}`);
      console.log(`🔌 Socket.io ready on path: /api/socketio`);
    });
}); 