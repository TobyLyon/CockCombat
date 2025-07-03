import { Server as HttpServer } from "http";
import { Socket as NetSocket } from "net";
import { Server as SocketIOServer, Socket } from "socket.io";
import { NextApiRequest, NextApiResponse } from "next"; // Assuming standard Next.js API types

// Define interfaces for clarity
interface ConnectionData {
  socket: Socket;
  status: "idle" | "queued" | "in_battle";
  playerData?: any; // Define more specific type if possible
  joinedAt?: number;
}

interface GameRoom {
  player1Id: string;
  player2Id: string;
  gameState: any; // Define more specific type if possible
  startTime: number;
  lastUpdateTime: number;
}

// Augment the Node.js server type to include our ws instance
interface AugmentedHttpServer extends HttpServer {
  io?: SocketIOServer; // Add io instance to the server type
}

// Type the Map instances
const activeConnections = new Map<string, ConnectionData>();
const gameRooms = new Map<string, GameRoom>();

// Global variable to store the Socket.io instance, typed
let io: SocketIOServer | undefined;

// This is a new function to get the IO instance
export function getIoInstance() {
  return io;
}

// Define a type for the NextApiResponse with socket properties
interface SocketApiResponse extends NextApiResponse {
  socket: NetSocket & {
    server: AugmentedHttpServer;
  };
}

// Initialize Socket.io server
function initializeSocketIO(server: AugmentedHttpServer): SocketIOServer {
  console.log("*Initializing Socket.IO Server*", server.io);

  // Initialize Socket.IO Server
  const io = new SocketIOServer(server, {
    path: "/api/socketio",
    addTrailingSlash: false,
    // Add CORS configuration needed for development/production
    cors: {
       origin: process.env.NODE_ENV === 'production' ? 'YOUR_PROD_URL' : '*', // Be specific in production
       methods: ["GET", "POST"]
     }
  });
  console.log(" Socket.IO Server instance created.");

  // --- Socket.IO Event Handlers --- (Removed for brevity, assume they are correct as before)
  io.on("connection", (socket: Socket) => {
     console.log(`--> Client Connected: ${socket.id}`);
     activeConnections.set(socket.id, { socket, status: "idle" });

     // Handler for clients to join a lobby-specific room
     socket.on("join_lobby_room", (lobbyId: string) => {
       if (lobbyId) {
         console.log(`<- Client ${socket.id} is joining lobby room: ${lobbyId}`);
         socket.join(lobbyId);
       }
     });

     // Handler for clients to leave a lobby-specific room
     socket.on("leave_lobby_room", (lobbyId: string) => {
      if (lobbyId) {
        console.log(`<- Client ${socket.id} is leaving lobby room: ${lobbyId}`);
        socket.leave(lobbyId);
      }
    });

     // Spectate Match Handler
     socket.on("spectate_match", ({ matchId }: { matchId: string }) => {
       console.log(`<- Spectator ${socket.id} wants to join match ${matchId}`);
       const room = gameRooms.get(matchId);
       if (room) {
         socket.join(matchId);
         console.log(`--> Spectator ${socket.id} joined room ${matchId}`);
         socket.emit(`game_state_update_${matchId}`, room.gameState); // Send initial state
       } else {
         console.log(`<-! Match room ${matchId} not found for spectator ${socket.id}`);
         // socket.emit("spectate_error", { message: "Match not found" });
       }
     });

     // Battle Action Handler
     socket.on("battle_action", (actionData: any) => {
       const { roomId, action, targetPosition } = actionData;
       console.log(`<- Action from ${socket.id} in room ${roomId}: ${action}`);
       const room = gameRooms.get(roomId);
       if (room) {
         const result = processAction(room, socket.id, action, targetPosition);
         // Broadcast action result AND updated game state to the room
         io?.to(roomId).emit("action_result", result);
         io?.to(roomId).emit(`game_state_update_${roomId}`, room.gameState); // Broadcast full state update

         if (result.battleOver) {
            console.log(`--> Match ${roomId} ended. Winner: ${result.winner}`);
            io?.to(roomId).emit(`match_ended_${roomId}`, { winner: result.winner /* add more details */ });
            // Clean up room and reset player statuses
            const player1 = activeConnections.get(room.player1Id);
            const player2 = activeConnections.get(room.player2Id);
            if (player1) player1.status = "idle";
            if (player2) player2.status = "idle";
            gameRooms.delete(roomId);
         }
       } else {
          console.log(`<-! Room ${roomId} not found for action from ${socket.id}`);
       }
     });

     // Disconnect Handler
     socket.on("disconnect", (reason) => {
       console.log(`--> Client Disconnected: ${socket.id}. Reason: ${reason}`);
       const connectionData = activeConnections.get(socket.id);
       activeConnections.delete(socket.id); // Remove from active connections

       // Check if the disconnected client was a player in a room
       for (const [roomId, room] of gameRooms.entries()) {
         if (room.player1Id === socket.id || room.player2Id === socket.id) {
           console.log(` Player ${socket.id} disconnected from active match ${roomId}`);
           const otherPlayerId = room.player1Id === socket.id ? room.player2Id : room.player1Id;
           const otherPlayerConnection = activeConnections.get(otherPlayerId);
           if (otherPlayerConnection?.socket) {
              otherPlayerConnection.socket.emit("opponent_disconnected");
              otherPlayerConnection.status = "idle";
           }
           // Broadcast match end due to disconnect
           io?.to(roomId).emit(`match_ended_${roomId}`, { winner: otherPlayerId, byDisconnect: true });
           gameRooms.delete(roomId); // Clean up the room
           break; // Player can only be in one room
         }
       }
     });

     // Error Handler
      socket.on("error", (error) => {
        console.error(`--> Socket Error from ${socket.id}:`, error);
      });

  });
   console.log("* Socket.IO Event Handlers Attached *", io);

  return io;
}

// Match players in the queue - THIS FUNCTION IS NOW DEPRECATED AND WILL BE REMOVED.
/*
function matchPlayers(io: SocketIOServer) {
  const queuedPlayers: (ConnectionData & { id: string })[] = [];

  for (const [id, connection] of activeConnections.entries()) {
    if (connection.status === "queued") {
      queuedPlayers.push({ id, ...connection });
    }
  }

  queuedPlayers.sort((a, b) => (a.joinedAt ?? 0) - (b.joinedAt ?? 0));

  while (queuedPlayers.length >= 2) {
    const player1 = queuedPlayers.shift();
    const player2 = queuedPlayers.shift();

    if (!player1 || !player2) continue; // Should not happen, but good practice

    const roomId = `room_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const player1Connection = activeConnections.get(player1.id);
    const player2Connection = activeConnections.get(player2.id);

    if (player1Connection && player2Connection) {
      player1Connection.status = "in_battle";
      player2Connection.status = "in_battle";
      activeConnections.set(player1.id, player1Connection);
      activeConnections.set(player2.id, player2Connection);

      player1Connection.socket.join(roomId);
      player2Connection.socket.join(roomId);

      const gameState = initializeGameState(player1, player2);
      gameRooms.set(roomId, {
        player1Id: player1.id,
        player2Id: player2.id,
        gameState,
        startTime: Date.now(),
        lastUpdateTime: Date.now(),
      });

      player1Connection.socket.emit("match_found", {
        roomId,
        opponent: player2.playerData,
        gameState,
        isPlayer1: true,
      });
      player2Connection.socket.emit("match_found", {
        roomId,
        opponent: player1.playerData,
        gameState,
        isPlayer1: false,
      });
       console.log(`Match found! Room ${roomId} created for ${player1.id} and ${player2.id}`);
    }
  }
}
*/

// Initialize game state
function initializeGameState(player1: ConnectionData & { id: string }, player2: ConnectionData & { id: string }) {
  // TODO: Define a proper GameState type
  return {
    player1: {
      id: player1.id,
      name: player1.playerData?.name || 'Player 1',
      chicken: player1.playerData?.chicken, // Define chicken type
      health: 100,
      energy: 100,
      position: { x: -5, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      status: "idle",
      effects: [],
    },
    player2: {
      id: player2.id,
      name: player2.playerData?.name || 'Player 2',
      chicken: player2.playerData?.chicken,
      health: 100,
      energy: 100,
      position: { x: 5, y: 0, z: 0 },
      rotation: { x: 0, y: Math.PI, z: 0 },
      status: "idle",
      effects: [],
    },
    arena: {
      items: generateArenaItems(),
      hazards: generateArenaHazards(),
      weather: getRandomWeather(),
    },
    battleStatus: "starting", // Start as 'starting' maybe?
    roundTime: 120,
    currentTime: 120,
  };
}

// Process a battle action
function processAction(room: GameRoom, playerId: string, action: string, targetPosition: any) {
  const { gameState } = room;
  const isPlayer1 = playerId === room.player1Id;
  const player = isPlayer1 ? gameState.player1 : gameState.player2;
  const opponent = isPlayer1 ? gameState.player2 : gameState.player1;

  // TODO: Define proper result type
  const result = {
    playerId,
    action,
    success: false,
    damage: 0,
    newPlayerState: null,
    newOpponentState: null,
    battleOver: false,
    winner: null,
    // Add potentially updated gameState for broadcasting
    updatedGameState: gameState // Placeholder - update this with actual changes
  };

  // --- Mock Action Processing --- TODO: Implement real game logic
  console.log(`Processing action '${action}' from ${playerId}`);
  if (action === 'attack') {
    const damageDealt = Math.floor(Math.random() * 10) + 5;
    opponent.health = Math.max(0, opponent.health - damageDealt);
    result.success = true;
    result.damage = damageDealt;
    result.newOpponentState = opponent; // Send back updated opponent state
    console.log(`${player.name} dealt ${damageDealt} damage to ${opponent.name}. ${opponent.name} health: ${opponent.health}`);

    if (opponent.health <= 0) {
      result.battleOver = true;
      result.winner = player.id;
      gameState.battleStatus = "ended";
      console.log(`Battle over! Winner: ${player.name}`);
    }
  } else if (action === 'move') {
    // Mock movement - just update position slightly
    player.position = targetPosition || { x: player.position.x + (isPlayer1 ? 0.5 : -0.5), y: 0, z: player.position.z };
    result.success = true;
    result.newPlayerState = player;
     console.log(`${player.name} moved`);
  }
  // --- End Mock Action Processing ---

  // Update the gameState within the room object (important!)
  room.gameState = gameState;
  room.lastUpdateTime = Date.now();

  result.updatedGameState = room.gameState; // Include potentially updated state

  return result;
}

// Helper functions (keep as is or implement properly)
function calculateDistance(pos1: any, pos2: any): number {
  if (!pos1 || !pos2) return Infinity;
  const dx = pos1.x - pos2.x;
  const dy = pos1.y - pos2.y;
  const dz = pos1.z - pos2.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function generateArenaItems(): any[] {
  // Placeholder
  return [];
}

function generateArenaHazards(): any[] {
  // Placeholder
  return [];
}

function getRandomWeather(): string {
  // Placeholder
  return "sunny";
}

// API route handlers
export default function handler(req: any, res: SocketApiResponse) {
  console.log(`API route /api/socketio hit. Method: ${req.method}`);
  // It's crucial that the server instance is available on res.socket.server
  if (!res.socket?.server) {
     console.error("API handler called without res.socket.server available.");
     res.status(500).json({ message: "Socket server not available on response." });
     return;
  }

  if (!res.socket.server.io) {
    console.log(" Attaching Socket.IO to server...");
    // Pass the HttpServer instance directly and attach io to it
    io = initializeSocketIO(res.socket.server); // Assign to global io
    res.socket.server.io = io;
     console.log(" Socket.IO attached and event listeners set up.");
  } else {
    console.log("Socket.IO already attached.");
  }
  // End the HTTP response for the initial API hit (needed for HTTP requests)
  res.end();
}
