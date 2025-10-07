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

  // Initialize global readyTimers map used by tutorial lobby countdowns
  if (!global.readyTimers) {
    global.readyTimers = Object.create(null);
  }

  // Presence map: lobbyId -> Set of wallet addresses currently in the socket room
  if (!global.lobbyPresence) {
    global.lobbyPresence = new Map();
  }

  // Socket.io connection handling
  io.on('connection', (socket) => {
    console.log(`✅ Client connected: ${socket.id}`);
    activeConnections.set(socket.id, { 
      socket, 
      status: 'idle',
      joinedAt: Date.now()
    });

    // Handle registration of wallet address to socket connection
    socket.on('register_wallet', (walletAddress) => {
      console.log(`🔗 Linking wallet ${walletAddress} to socket ${socket.id}`);
      
      const connection = activeConnections.get(socket.id);
      if (connection) {
        connection.walletAddress = walletAddress;
        console.log(`✅ Wallet ${walletAddress} registered to socket ${socket.id}`);

        // Guard: if there is an older socket with the same wallet, clean it up to avoid ghost presence
        try {
          for (const [otherId, otherConn] of activeConnections.entries()) {
            if (otherId !== socket.id && otherConn.walletAddress === walletAddress) {
              const oldLobby = otherConn.currentLobby;
              console.log(`🧹 Cleaning prior socket ${otherId} for wallet ${walletAddress}${oldLobby ? ` (lobby ${oldLobby})` : ''}`);
              // Broadcast leave from old lobby if any
              if (oldLobby) {
                io.to(oldLobby).emit('player_left_lobby', { playerId: walletAddress, timestamp: Date.now() });
              }
              // Ensure presence maps are cleared
              if (oldLobby && global.lobbyPresence?.has(oldLobby)) {
                global.lobbyPresence.get(oldLobby).delete(walletAddress);
              }
              // Disconnect the old socket to prevent duplicate ghosts
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
        // Check if already in this lobby to prevent duplicate joins
        const connection = activeConnections.get(socket.id);
        if (connection && connection.currentLobby === lobbyId) {
          console.log(`🏟️ Client ${socket.id} already in lobby room: ${lobbyId}`);
          return;
        }
        
        console.log(`🏟️ Client ${socket.id} joining lobby room: ${lobbyId}`);
        socket.join(lobbyId);
        
        // Update connection data for this lobby
        if (connection) {
          connection.currentLobby = lobbyId;
          connection.isReady = false;
          // Track presence
          if (connection.walletAddress) {
            if (!global.lobbyPresence.has(lobbyId)) {
              global.lobbyPresence.set(lobbyId, new Set());
            }
            global.lobbyPresence.get(lobbyId).add(connection.walletAddress);
          }
        }
        
        // Try to fetch lobby data from API to see if this socket represents a player who joined via HTTP
        try {
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${port}`;
          const response = await fetch(`${baseUrl}/api/lobbies`);
          const lobbies = await response.json();
          const lobby = lobbies.find(l => l.id === lobbyId);
          
          if (lobby) {
            // Check if any of the HTTP API players could be this socket connection
            // This is a bit tricky since socket.id != wallet address, but we can try to match
            console.log(`🔍 Checking if socket ${socket.id} matches any lobby players for ${lobbyId}`);
            
            // For now, if this socket joins a lobby room, we assume they're validly in that lobby
            // The frontend should ensure this by only joining socket rooms after successful HTTP join
            
            // Don't broadcast a duplicate join if this socket represents an existing HTTP player
            // Instead, just refresh the lobby state for everyone
            console.log(`🔄 Refreshing lobby state for all players in ${lobbyId}`);
            
            const lobbyPlayers = lobby.players.map(player => {
              // Check ready status from socket connections PER PLAYER
              let isReady = false;
              for (const [, conn] of activeConnections.entries()) {
                if (conn.currentLobby === lobbyId && conn.walletAddress === player.playerId) {
                  isReady = !!conn.isReady;
                  break;
                }
              }
              return {
                playerId: player.playerId,
                username: player.username || player.playerId.slice(0, 8) + '...',
                chickenName: player.chickenId || 'Default',
                isReady: player.isAi ? true : isReady,
                isAi: player.isAi || false
              };
            });
            
            // Broadcast updated lobby state to all players in the room
            io.to(lobbyId).emit('lobby_updated', {
              id: lobbyId,
              players: lobbyPlayers,
              capacity: lobby.capacity,
              amount: lobby.amount,
              currency: lobby.currency,
              matchType: lobby.matchType
            });

            // Tutorial self-heal: if lobby is tutorial and everyone is ready, ensure the joining client gets start signals
            try {
              const minPlayers = lobbyId.includes('tutorial') ? 1 : 4;
              const readyPlayers = lobbyPlayers.filter(p => p.isReady || p.isAi);
              const hasHumanReady = lobbyId.includes('tutorial') ? lobbyPlayers.some(p => !p.isAi && p.isReady) : true;
              const allReady = lobbyPlayers.length >= minPlayers && readyPlayers.length === lobbyPlayers.length && hasHumanReady;
              if (allReady && lobbyId.includes('tutorial')) {
                // Emit only to this socket to avoid double-emitting to the entire room
                let c = 2;
                const t = setInterval(() => {
                  socket.emit('match_starting', { countdown: c });
                  c--;
                  if (c < 0) {
                    clearInterval(t);
                    socket.emit('match_started');
                  }
                }, 1000);
              }
            } catch {}
            
          } else {
            // Fallback for lobbies not in HTTP API (shouldn't happen for tutorial)
            console.log(`⚠️ Lobby ${lobbyId} not found in API, using socket-only mode`);
            
            // Generate random chicken for display
            const randomChickens = ['Warrior', 'Ninja', 'Berserker', 'Mage', 'Tank', 'Assassin', 'Paladin', 'Archer'];
            const randomChicken = randomChickens[Math.floor(Math.random() * randomChickens.length)];
            
            // Broadcast to lobby that someone joined (socket-only mode)
            socket.to(lobbyId).emit('player_joined_lobby', {
              playerId: socket.id,
              username: `Player_${socket.id.slice(0, 6)}`,
              chickenName: randomChicken,
              isReady: false,
              isAi: false,
              timestamp: Date.now()
            });
          }
        } catch (error) {
          console.error('❌ Error checking lobby API during socket join:', error);
          
          // Fallback to old socket-only behavior
          const randomChickens = ['Warrior', 'Ninja', 'Berserker', 'Mage', 'Tank', 'Assassin', 'Paladin', 'Archer'];
          const randomChicken = randomChickens[Math.floor(Math.random() * randomChickens.length)];
          
          socket.to(lobbyId).emit('player_joined_lobby', {
            playerId: socket.id,
            username: `Player_${socket.id.slice(0, 6)}`,
            chickenName: randomChicken,
            isReady: false,
            isAi: false,
            timestamp: Date.now()
          });
        }
      }
    });

    // Handle lobby room leaving
    socket.on('leave_lobby_room', (lobbyId) => {
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
        
        // Broadcast to lobby that someone left
        socket.to(lobbyId).emit('player_left_lobby', {
          playerId: socket.id,
          timestamp: Date.now()
        });
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
    socket.on('player_ready', (data) => {
      if (!checkRateLimit('player_ready', 5)) {
        console.warn(`⚠️ Rate limit exceeded for player_ready: ${socket.id}`);
        return;
      }
      const { lobbyId, playerId, isReady } = data;
      console.log(`🎯 Player ${playerId} ready status: ${isReady} in lobby ${lobbyId}`);
      
      const connection = activeConnections.get(socket.id);
      if (connection) {
        connection.isReady = isReady;
        
        // Broadcast ready status to all players in the lobby
        io.to(lobbyId).emit('player_ready_status', {
          playerId,
          isReady
        });
        
        // Check if all players are ready
        checkLobbyReadyStatus(lobbyId, io);
        
        // Also emit a lobby_updated event to refresh the full lobby state
        setTimeout(() => {
          io.to(lobbyId).emit('refresh_lobby_state');
        }, 100);
      }
    });

    // Handle get lobby state request
    socket.on('get_lobby_state', async (lobbyId) => {
      if (!checkRateLimit('get_lobby_state', 20)) {
        console.warn(`⚠️ Rate limit exceeded for get_lobby_state: ${socket.id}`);
        return;
      }
      try {
        // Fetch lobby data from API to get real usernames and player list
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${port}`;
        const response = await fetch(`${baseUrl}/api/lobbies`);
        const lobbies = await response.json();
        const lobby = lobbies.find(l => l.id === lobbyId);
        
        if (lobby) {
          // Merge API lobby players with socket ready status
          const lobbyPlayers = lobby.players.map(player => {
            // Check if this player has a socket connection with ready status
            let isReady = false;
            for (const [, connection] of activeConnections.entries()) {
              if (connection.currentLobby === lobbyId && connection.walletAddress === player.playerId) {
                isReady = !!connection.isReady;
                break;
              }
            }
            return {
              playerId: player.playerId,
              username: player.username || player.playerId.slice(0, 8) + '...',
              chickenName: player.chickenId || 'Default',
              isReady: player.isAi ? true : isReady, // AI players are always ready
              isAi: player.isAi || false
            };
          });
          
          console.log(`📋 Sending lobby state for ${lobbyId}:`, lobbyPlayers);
          
          socket.emit('lobby_updated', {
            id: lobbyId,
            players: lobbyPlayers,
            capacity: lobby.capacity,
            amount: lobby.amount,
            currency: lobby.currency,
            matchType: lobby.matchType
          });
        } else {
          console.log(`⚠️ Lobby ${lobbyId} not found in API, using fallback`);
          // Fallback to socket-only method
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
          
          socket.emit('lobby_updated', {
            id: lobbyId,
            players: lobbyPlayers,
            capacity: 8,
            amount: 0,
            currency: 'FREE',
            matchType: 'tutorial'
          });
        }
      } catch (error) {
        console.error('❌ Error fetching lobby state:', error);
        // Fallback to socket-only method
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
        
        socket.emit('lobby_updated', {
          id: lobbyId,
          players: lobbyPlayers,
          capacity: 8,
          amount: 0,
          currency: 'FREE',
          matchType: 'tutorial'
        });
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

          // Record match (best-effort) in Supabase for auditing/payout flows
          try {
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
              await supabase.from('matches').upsert({
                id: roomId,
                player1_wallet: player1Wallet,
                player2_wallet: player2Wallet,
                winner_wallet: winnerWallet,
                metadata: {
                  source: 'socket_server',
                  started_at: room.startTime || Date.now(),
                  ended_at: Date.now(),
                },
              }, { onConflict: 'id' });

              // Ranked payout orchestrator: if lobby info available and amount > 0, record match_results and trigger payout
              try {
                // Try to infer lobby from participants' last lobby or from room metadata (not stored here), so fallback to unknown
                // Here we compute prize pool based on live lobby amounts if we can find a matching lobby; otherwise skip
                const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${port}`;
                const lobbyRes = await fetch(`${baseUrl}/api/lobbies`).catch(() => null);
                const lobbies = lobbyRes ? await lobbyRes.json().catch(() => []) : [];
                // Find any ranked lobby with either player wallet present
                const rankedLobby = Array.isArray(lobbies) ? lobbies.find(l => l.amount > 0 && (l.players || []).some(p => p.playerId === player1Wallet || p.playerId === player2Wallet)) : null;
                if (rankedLobby && rankedLobby.amount > 0) {
                  const humans = (rankedLobby.players || []).filter(p => !p.isAi);
                  const prizePoolLamports = Math.round(rankedLobby.amount * humans.length * 1_000_000_000);

                  // Create match_results row
                  const participants = humans.map((p) => ({ wallet: p.playerId, wager_amount: rankedLobby.amount }));
                  const { data: mr, error: mrErr } = await supabase.from('match_results').insert({
                    lobby_id: rankedLobby.id,
                    escrow_wallet_id: rankedLobby.escrowWalletId || null,
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
                    // Trigger payout via internal API with server secret
                    const payoutUrl = baseUrl ? `${baseUrl}/api/payout` : `${`http://localhost:${port}`}/api/payout`;
                    const serverSecret = process.env.PAYOUT_SERVER_SECRET;
                    if (serverSecret) {
                      const res = await fetch(payoutUrl, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${serverSecret}`,
                        },
                        body: JSON.stringify({
                          winnerAddress: winnerWallet,
                          prizePoolLamports,
                          matchId: mr.id,
                        }),
                      });
                      if (!res.ok) {
                        console.error('❌ Ranked payout failed:', await res.text().catch(() => ''));
                      } else {
                        console.log('💸 Ranked payout initiated for match_result:', mr.id);
                      }
                    } else {
                      console.warn('⚠️ PAYOUT_SERVER_SECRET not set; cannot trigger ranked payout');
                    }
                  } else if (mrErr) {
                    console.error('❌ Failed to insert match_results:', mrErr);
                  }
                }
              } catch (orchestratorErr) {
                console.error('⚠️ Payout orchestrator error:', orchestratorErr);
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
      
      // Attempt to remove the player from their current lobby via API (keeps server state clean)
      try {
        const connection = activeConnections.get(socket.id);
        if (connection && connection.currentLobby && connection.walletAddress) {
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${port}`;
          fetch(`${baseUrl}/api/lobbies`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lobbyId: connection.currentLobby, playerId: connection.walletAddress })
          }).catch(() => {});
          // Also update presence map
          if (global.lobbyPresence && global.lobbyPresence.has(connection.currentLobby)) {
            global.lobbyPresence.get(connection.currentLobby).delete(connection.walletAddress);
          }
          // Regardless of API success, immediately notify lobby to remove this player in UI
          try {
            io.to(connection.currentLobby).emit('player_left_lobby', {
              playerId: connection.walletAddress,
              timestamp: Date.now(),
            });
            // Emit refreshed lobby state using socket-side presence as fallback
            const fallbackPlayers = [];
            for (const [, conn] of activeConnections.entries()) {
              if (conn.currentLobby === connection.currentLobby && conn.walletAddress) {
                fallbackPlayers.push({
                  playerId: conn.walletAddress,
                  username: conn.walletAddress.slice(0, 8) + '...',
                  chickenName: 'Default',
                  isReady: !!conn.isReady,
                  isAi: false,
                });
              }
            }
            io.to(connection.currentLobby).emit('lobby_updated', {
              id: connection.currentLobby,
              players: fallbackPlayers,
              capacity: 8,
              amount: 0,
              currency: 'FREE',
              matchType: connection.currentLobby.includes('tutorial') ? 'tutorial' : 'ranked',
            });
          } catch {}
        }
      } catch {}

      // Remove from active connections
      activeConnections.delete(socket.id);

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
      // Fetch lobby data from API to get the real player list
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${port}`;
      const response = await fetch(`${baseUrl}/api/lobbies`);
      const lobbies = await response.json();
      const lobby = lobbies.find(l => l.id === lobbyId);
      
      if (lobby) {
        // Merge API lobby players with socket ready status
        const lobbyPlayers = lobby.players.map(player => {
          // Check if this player has a socket connection with ready status
          let isReady = false;
          for (const [connectionId, connection] of activeConnections.entries()) {
            if (connection.currentLobby === lobbyId && 
                connection.walletAddress === player.playerId) {
              isReady = connection.isReady || false;
              break;
            }
          }
          
          return {
            playerId: player.playerId,
            username: player.username || player.playerId.slice(0, 8) + '...',
            chickenName: player.chickenId || 'Default',
            isReady: player.isAi ? true : isReady, // AI players are always ready
            isAi: player.isAi || false
          };
        });
        
        // Check if we have minimum players and all are ready
        const minPlayers = lobbyId.includes('tutorial') ? 1 : 4;
        const readyPlayers = lobbyPlayers.filter(p => p.isReady || p.isAi);
        const hasHumanReady = lobbyId.includes('tutorial') ? lobbyPlayers.some(p => !p.isAi && p.isReady) : true;
        let allReady = lobbyPlayers.length >= minPlayers && 
                       readyPlayers.length === lobbyPlayers.length && hasHumanReady;

        // Ranked enforcement: all human players must have confirmed wagers to assigned escrow
        if (!lobbyId.includes('tutorial')) {
          try {
            // Fetch the live lobby from API to inspect hasWagered flags and escrow wallet
            const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${port}`;
            const res = await fetch(`${baseUrl}/api/lobbies`);
            const all = await res.json();
            const liveLobby = all.find(l => l.id === lobbyId);
            if (liveLobby && liveLobby.amount > 0) {
              const humans = (liveLobby.players || []).filter(p => !p.isAi);
              const allWagered = humans.length > 0 && humans.every(p => Boolean(p.hasWagered));
              const hasEscrow = Boolean(liveLobby.escrowWalletId);
              if (!allWagered || !hasEscrow) {
                allReady = false;
                io.to(lobbyId).emit('lobby_updated', {
                  id: lobbyId,
                  players: lobbyPlayers,
                  capacity: liveLobby.capacity,
                  amount: liveLobby.amount,
                  currency: liveLobby.currency,
                  matchType: liveLobby.matchType
                });
                console.log(`⏸️ Ranked lobby ${lobbyId} waiting for wagers: allWagered=${allWagered} hasEscrow=${hasEscrow}`);
              }
            }
          } catch (e) {
            console.warn('⚠️ Enforcement check failed, deferring start:', e?.message || e);
            allReady = false;
          }
        }
        
        console.log(`🎯 Lobby ${lobbyId} status: ${readyPlayers.length}/${lobbyPlayers.length} ready (min: ${minPlayers})`);
        
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
              
              // Clean up lobby connections
              for (const [id, connection] of activeConnections.entries()) {
                if (connection.currentLobby === lobbyId) {
                  delete connection.currentLobby;
                  connection.isReady = false;
                }
              }
            }
          }, 1000);
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
        const minPlayers = lobbyId.includes('tutorial') ? 1 : 4;
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
              
              // Clean up lobby connections
              for (const [id, connection] of activeConnections.entries()) {
                if (connection.currentLobby === lobbyId) {
                  delete connection.currentLobby;
                  connection.isReady = false;
                }
              }
            }
          }, 1000);
        }
      }
    } catch (error) {
      console.error('❌ Error checking lobby ready status:', error);
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

    // Check if battle is over
    const battleOver = opponent.health <= 0;
    const winner = battleOver ? playerId : null;

    if (battleOver) {
      gameState.battleStatus = 'ended';
      opponent.status = 'defeated';
      currentPlayer.status = 'winner';
    } else {
      // Switch turns
      gameState.turn = isPlayer1 ? room.player2Id : room.player1Id;
    }

    room.lastUpdateTime = Date.now();

    return {
      action,
      damage,
      actionSuccess,
      battleOver,
      winner,
      newPlayerState: currentPlayer,
      newOpponentState: opponent,
      gameState: gameState
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