"use client";

import { useParams } from 'next/navigation';
import ArenaViewer from "@/components/3d/arena-viewer";
import SpectatorView from "@/components/spectator/spectator-view";
import { useSpectator } from "@/hooks/use-spectator";
import { useEffect } from 'react';

export default function SpectatePage() {
  const params = useParams();
  const matchId = params?.matchId as string | null;

  // Use the spectator hook
  const { gameState, matchResult, connectionStatus, error } = useSpectator(matchId);

  // Log connection status and errors for debugging
  useEffect(() => {
    console.log("Spectator Connection:", connectionStatus, "Match ID:", matchId);
    if (error) {
      console.error("Spectator Error:", error);
    }
  }, [connectionStatus, error, matchId]);

  // Handle loading/error states
  if (connectionStatus === 'connecting') {
    return <div className="flex items-center justify-center h-screen w-screen bg-gray-900 text-white">Connecting to match...</div>;
  }

  if (error) {
    return <div className="flex items-center justify-center h-screen w-screen bg-gray-900 text-red-500">Error: {error}</div>;
  }

  if (!gameState && connectionStatus === 'connected') {
     // Could be waiting for the first game state update
     return <div className="flex items-center justify-center h-screen w-screen bg-gray-900 text-white">Waiting for match data...</div>;
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-900 text-white">
      <div className="flex-grow h-full relative">
        {/* Pass gameState to ArenaViewer */}
        <ArenaViewer gameState={gameState} />
      </div>

      <div className="w-80 h-full flex-shrink-0 border-l border-gray-700">
        {/* Pass matchId, gameState, and matchResult to SpectatorView */}
        <SpectatorView
          matchId={matchId}
          gameState={gameState}
          matchResult={matchResult}
        />
      </div>
    </div>
  );
} 