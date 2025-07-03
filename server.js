const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = process.env.PORT || 3000;

// Create Next.js app
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Active connections and game rooms
const activeConnections = new Map();
const gameRooms = new Map();

app.prepare().then(() => {
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
      origin: dev ? '*' : process.env.NEXT_PUBLIC_APP_URL,
      methods: ['GET', 'POST'],
    },
  });

  console.log('🚀 Socket.io server initialized');

  // Socket.io connection handling
  io.on('connection', (socket) => {
    console.log(`✅ Client connected: ${socket.id}`);
    activeConnections.set(socket.id, { 
      socket, 
      status: 'idle',
      joinedAt: Date.now()
    });

    // Handle lobby room joining
    socket.on('join_lobby_room', (lobbyId) => {
      if (lobbyId) {
        // Check if already in this lobby to prevent duplicate joins
        const connection = activeConnections.get(socket.id);
        if (connection && connection.currentLobby === lobbyId) {
          console.log(`🏟️ Client ${socket.id} already in lobby room: ${lobbyId}`);
          return;
        }
        
        console.log(`🏟️ Client ${socket.id} joining lobby room: ${lobbyId}`);
        socket.join(lobbyId);
        
        // Initialize player data for this lobby
        if (connection) {
          connection.currentLobby = lobbyId;
          connection.isReady = false;
        }
        
        // Generate random chicken for display
        const randomChickens = ['Warrior', 'Ninja', 'Berserker', 'Mage', 'Tank', 'Assassin', 'Paladin', 'Archer'];
        const randomChicken = randomChickens[Math.floor(Math.random() * randomChickens.length)];
        
        // Broadcast to lobby that someone joined
        socket.to(lobbyId).emit('player_joined_lobby', {
          playerId: socket.id,
          username: `Player_${socket.id.slice(0, 6)}`,
          chickenName: randomChicken,
          isReady: false,
          isAi: false,
          timestamp: Date.now()
        });
      }
    });

    // Handle lobby room leaving
    socket.on('leave_lobby_room', (lobbyId) => {
      if (lobbyId) {
        console.log(`🚪 Client ${socket.id} leaving lobby room: ${lobbyId}`);
        socket.leave(lobbyId);
        
        // Clear lobby data
        const connection = activeConnections.get(socket.id);
        if (connection) {
          connection.currentLobby = null;
          connection.isReady = false;
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
      }
    });

    // Handle get lobby state request
    socket.on('get_lobby_state', async (lobbyId) => {
      try {
        // Fetch lobby data from API to get real usernames
        const response = await fetch(`http://localhost:${port}/api/lobbies`);
        const lobbies = await response.json();
        const lobby = lobbies.find(l => l.id === lobbyId);
        
        if (lobby) {
          // Convert API lobby players to socket format
          const lobbyPlayers = lobby.players.map(player => ({
            playerId: player.playerId,
            username: player.username || player.playerId.slice(0, 8) + '...',
            chickenName: player.chickenId || 'Default',
            isReady: false, // Will be updated by ready events
            isAi: player.isAi || false
          }));
          
          socket.emit('lobby_updated', {
            id: lobbyId,
            players: lobbyPlayers,
            capacity: lobby.capacity,
            amount: lobby.amount,
            currency: lobby.currency,
            matchType: lobby.matchType
          });
        }
      } catch (error) {
        console.error('Error fetching lobby state:', error);
        // Fallback to old method
        const lobbyPlayers = [];
        
        // Get all connections in this lobby
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
          players: lobbyPlayers
        });
      }
    });

    // Handle battle actions
    socket.on('battle_action', (actionData) => {
      const { roomId, action, targetPosition } = actionData;
      console.log(`⚔️ Action from ${socket.id} in room ${roomId}: ${action}`);
      
      const room = gameRooms.get(roomId);
      if (room) {
        // Process the action and broadcast result
        const result = processAction(room, socket.id, action, targetPosition);
        
        // Broadcast to all players in the room
        io.to(roomId).emit('action_result', result);
        io.to(roomId).emit('game_state_update', room.gameState);

        // Check if battle is over
        if (result.battleOver) {
          console.log(`🏆 Match ${roomId} ended. Winner: ${result.winner}`);
          io.to(roomId).emit('match_ended', { 
            winner: result.winner,
            battleData: result 
          });
          
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
        socket.emit('game_state_update', room.gameState);
      } else {
        socket.emit('spectate_error', { message: 'Match not found' });
      }
    });

    // Handle disconnect
    socket.on('disconnect', (reason) => {
      console.log(`❌ Client disconnected: ${socket.id}. Reason: ${reason}`);
      
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
  function checkLobbyReadyStatus(lobbyId, io) {
    const lobbyPlayers = [];
    
    // Get all connections in this lobby
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
    const minPlayers = lobbyId.includes('tutorial') ? 2 : 4;
    const allReady = lobbyPlayers.length >= minPlayers && 
                     lobbyPlayers.every(p => p.isReady);
    
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
              delete connection.isReady;
            }
          }
        }
      }, 1000);
    } else if (lobbyId.includes('tutorial') && lobbyPlayers.length > 0 && lobbyPlayers.every(p => p.isReady)) {
      // For free lobbies, if players are ready but not enough, start AI backfill timer
      console.log(`⏰ Starting AI backfill timer for free lobby ${lobbyId} - ${lobbyPlayers.length} ready players`);
      
      // Clear any existing timer for this lobby
      if (global.readyTimers && global.readyTimers[lobbyId]) {
        clearTimeout(global.readyTimers[lobbyId]);
      }
      
      // Initialize global timers object if not exists
      if (!global.readyTimers) {
        global.readyTimers = {};
      }
      
      // Set 1-minute timer for AI backfill
      global.readyTimers[lobbyId] = setTimeout(() => {
        console.log(`🤖 AI backfill triggered for free lobby ${lobbyId}`);
        
        // Add AI players to fill the lobby
        const aiNames = ['ChickenBot', 'RoboRooster', 'CyberCluck', 'TechnoTender', 'ByteBird', 'PixelPecker', 'DataDrummer', 'CodeCock'];
        const currentPlayers = lobbyPlayers.length;
        
        // Broadcast AI players joining
        for (let i = currentPlayers; i < minPlayers; i++) {
          const randomName = aiNames[Math.floor(Math.random() * aiNames.length)];
          const randomChicken = ['Warrior', 'Ninja', 'Berserker', 'Mage', 'Tank', 'Assassin'][Math.floor(Math.random() * 6)];
          
          io.to(lobbyId).emit('player_joined_lobby', {
            playerId: `ai-${Math.random().toString(36).substring(2, 9)}`,
            username: randomName,
            chickenName: randomChicken,
            isReady: true,
            isAi: true,
            timestamp: Date.now()
          });
        }
        
        // Start the match with AI players
        console.log(`🚀 Starting free lobby ${lobbyId} with AI backfill`);
        let countdown = 3;
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
                delete connection.isReady;
              }
            }
          }
        }, 1000);
        
        // Clean up timer
        delete global.readyTimers[lobbyId];
      }, 60000); // 1 minute wait
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