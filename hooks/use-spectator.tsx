"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import socketService from "@/lib/socket-service"; // Assuming socket service exists

// Define types for GameState and MatchResult based on existing code or needs
// Placeholder types - adjust as needed
interface GameState {
  // Define structure based on what the arena/betting components need
  player1: { id: string; name: string; health: number; position?: any; /* ... */ };
  player2: { id:string; name: string; health: number; position?: any; /* ... */ };
  roundTime?: number;
  battleStatus?: 'starting' | 'active' | 'ended';
  // ... other state properties
}

interface MatchResult {
 winnerWallet?: string;
 loserWallet?: string;
 byDisconnect?: boolean;
 // ... other result details
}


export function useSpectator(matchId: string | null) {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [connectionStatus, setConnectionStatus] = useState("disconnected");
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<any>(null); // Use specific Socket type if available

  useEffect(() => {
    if (!matchId) {
      // If no matchId, disconnect or don't connect
      setGameState(null);
      setMatchResult(null);
      setConnectionStatus("disconnected");
      socketService.disconnect();
      socketRef.current = null;
      return;
    }

    let isMounted = true;
    const connectAndSpectate = async () => {
      try {
        if (!socketRef.current || !socketRef.current.connected) {
          setConnectionStatus("connecting");
          const socket = await socketService.connect();
          socketRef.current = socket;
        }

        if (!isMounted) return; // Check if component is still mounted after async operations

        setConnectionStatus("connected");
        setError(null);

        // --- Backend Interaction Needed ---
        // 1. Server needs to handle "spectate_match"
        // 2. Server needs to add spectator socket to the room
        // 3. Server needs to broadcast "game_state_update" & "match_ended" to the room
        // ------------------------------------
        console.log(`Emitting spectate_match for matchId: ${matchId}`);
        socketRef.current.emit("spectate_match", { matchId });

        // Placeholder listeners - adjust event names based on backend implementation
        socketRef.current.on(`game_state_update_${matchId}`, (newGameState: GameState) => {
           if (isMounted) {
              console.log("Received game state update:", newGameState);
              setGameState(newGameState);
           }
        });

        socketRef.current.on(`match_ended_${matchId}`, (result: MatchResult) => {
           if (isMounted) {
              console.log("Received match ended:", result);
              setMatchResult(result);
              setGameState(prevState => prevState ? { ...prevState, battleStatus: 'ended' } : null);
           }
        });

        socketRef.current.on("disconnect", () => {
          if (isMounted) {
            console.log("Socket disconnected");
            setConnectionStatus("disconnected");
            setGameState(null);
            setMatchResult(null);
            socketRef.current = null; // Clear ref on disconnect
          }
        });

        socketRef.current.on("connect_error", (err: Error) => {
          if (isMounted) {
            console.error("Spectator socket connection error:", err);
            setConnectionStatus("error");
            setError("Failed to connect to match stream.");
            socketRef.current = null; // Clear ref on error
          }
        });

      } catch (err) {
         if (isMounted) {
            console.error("Spectator connection setup error:", err);
            setConnectionStatus("error");
            setError("Failed to initialize match connection.");
         }
      }
    };

    connectAndSpectate();

    // Cleanup function
    return () => {
      isMounted = false;
      console.log(`Cleaning up spectator hook for matchId: ${matchId}`);
      if (socketRef.current) {
        // Consider leaving the room on the backend if necessary
        // socketRef.current.emit("leave_spectate", { matchId });

        // Remove specific listeners to avoid memory leaks
        socketRef.current.off(`game_state_update_${matchId}`);
        socketRef.current.off(`match_ended_${matchId}`);

        // Don't disconnect globally if other components might use the socket
        // socketService.disconnect();
      }
    };
  }, [matchId]); // Re-run effect if matchId changes

  return {
    gameState,
    matchResult,
    connectionStatus,
    error,
  };
} 