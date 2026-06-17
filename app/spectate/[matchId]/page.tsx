"use client";

import { useParams, useRouter } from 'next/navigation';
import dynamic from "next/dynamic";
// React Three Fiber is externalized server-side; load the 3D viewer client-only.
const ArenaViewer = dynamic(() => import("../../../components/3d/arena-viewer"), { ssr: false });
import SpectatorView from "../../../components/spectator/spectator-view";
import { useSpectator } from "../../../hooks/use-spectator";
import { useEffect, useState } from 'react';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { ArrowLeft, Clock, Users, Eye } from 'lucide-react';

export default function SpectatePage() {
  const params = useParams();
  const router = useRouter();
  const matchId = params?.matchId as string | null;
  const [elapsedTime, setElapsedTime] = useState(0);
  const [spectatorCount, setSpectatorCount] = useState(0);

  // Use the spectator hook
  const { gameState, matchResult, connectionStatus, error } = useSpectator(matchId);

  // Timer for elapsed time
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedTime(prev => prev + 1);
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);

  // Log connection status and errors for debugging
  useEffect(() => {
    console.log("Spectator Connection:", connectionStatus, "Match ID:", matchId);
    if (error) {
      console.error("Spectator Error:", error);
    }
  }, [connectionStatus, error, matchId]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

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
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-gray-900 text-white">
      {/* Top Bar with Match Info */}
      <div className="flex-shrink-0 bg-gray-950 border-b border-gray-700 p-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost"
            size="sm"
            onClick={() => router.push("/spectate")}
            className="text-gray-400 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Matches
          </Button>
          
          <div className="flex items-center gap-3">
            <Badge className="bg-red-600 text-white animate-pulse">
              <Eye className="h-3 w-3 mr-1" />
              LIVE
            </Badge>
            
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-gray-400" />
              <span className="text-gray-300 font-mono">{formatTime(elapsedTime)}</span>
            </div>
            
            <div className="flex items-center gap-2 text-sm">
              <Users className="h-4 w-4 text-gray-400" />
              <span className="text-gray-300">{spectatorCount} watching</span>
            </div>
          </div>
        </div>
        
        <div className="text-xs text-gray-500 font-mono">
          Match ID: {matchId?.slice(0, 8)}...
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-grow h-full relative">
          {/* Pass gameState to ArenaViewer */}
          <ArenaViewer gameState={gameState} />
        </div>

        <div className="w-80 lg:w-96 h-full flex-shrink-0 border-l border-gray-700">
          {/* Pass matchId, gameState, and matchResult to SpectatorView */}
          <SpectatorView
            matchId={matchId || undefined}
            gameState={gameState}
            matchResult={matchResult}
          />
        </div>
      </div>
    </div>
  );
} 