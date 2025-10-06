"use client"

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Eye, Clock, Users, Swords, Trophy, PlayCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';

interface ActiveMatch {
  matchId: string;
  status: string;
  startedAt: string;
  elapsedSeconds: number;
  estimatedRemainingSeconds: number;
  progress: number;
  players: Array<{
    id: string;
    name: string;
    health: number;
    status: string;
  }>;
  spectatorCount: number;
  isSpectatable: boolean;
}

interface LiveMatchesFeedProps {
  className?: string;
  compact?: boolean;
}

export default function LiveMatchesFeed({ className = '', compact = false }: LiveMatchesFeedProps) {
  const [matches, setMatches] = useState<ActiveMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const fetchMatches = async () => {
      try {
        const response = await fetch('/api/matches/active');
        if (response.ok) {
          const data = await response.json();
          setMatches(data.matches || []);
        }
      } catch (error) {
        console.error('Failed to fetch active matches:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchMatches();
    
    // Poll every 2 seconds for live updates
    const interval = setInterval(fetchMatches, 2000);
    
    return () => clearInterval(interval);
  }, []);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSpectate = (matchId: string) => {
    router.push(`/spectate/${matchId}`);
  };

  if (loading) {
    return (
      <Card className={`bg-gray-900/50 border-gray-700 ${className}`}>
        <CardHeader>
          <CardTitle className="text-yellow-400 flex items-center gap-2">
            <Swords className="h-5 w-5" />
            Live Matches
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin h-8 w-8 border-4 border-yellow-400 border-t-transparent rounded-full"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (matches.length === 0) {
    return (
      <Card className={`bg-gray-900/50 border-gray-700 ${className}`}>
        <CardHeader>
          <CardTitle className="text-yellow-400 flex items-center gap-2">
            <Swords className="h-5 w-5" />
            Live Matches
            <Badge variant="outline" className="ml-auto">0 Active</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-400">
            <PlayCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No active matches right now</p>
            <p className="text-sm mt-1">Check back soon or start your own!</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`bg-gray-900/50 border-gray-700 ${className}`}>
      <CardHeader>
        <CardTitle className="text-yellow-400 flex items-center gap-2 text-base sm:text-lg">
          <Swords className="h-5 w-5 animate-pulse" />
          Live Matches
          <Badge variant="outline" className="ml-auto bg-red-600/20 text-red-400 border-red-600">
            {matches.length} Active
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className={compact ? 'p-2 space-y-2' : 'space-y-3'}>
        <AnimatePresence mode="popLayout">
          {matches.map((match) => (
            <motion.div
              key={match.matchId}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="bg-gray-800/50 border border-gray-700 rounded-lg p-3 hover:border-yellow-500/50 transition-all"
            >
              {/* Match Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Badge className="bg-red-600 text-white animate-pulse">
                    LIVE
                  </Badge>
                  <span className="text-xs text-gray-400">
                    {formatTime(match.elapsedSeconds)} elapsed
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <Eye className="h-3 w-3" />
                  <span>{match.spectatorCount} watching</span>
                </div>
              </div>

              {/* Players */}
              <div className="grid grid-cols-2 gap-3 mb-3">
                {match.players.map((player, idx) => (
                  <div key={player.id} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className={`h-3 w-3 rounded-full ${player.status === 'alive' ? 'bg-green-500' : 'bg-red-500'}`} />
                      <span className="text-sm font-semibold truncate">{player.name}</span>
                    </div>
                    <Progress 
                      value={player.health} 
                      className="h-2" 
                      indicatorClassName={player.health > 50 ? 'bg-green-500' : player.health > 25 ? 'bg-yellow-500' : 'bg-red-500'}
                    />
                    <div className="text-xs text-gray-400">HP: {player.health}%</div>
                  </div>
                ))}
              </div>

              {/* Match Progress */}
              <div className="space-y-1 mb-3">
                <div className="flex items-center justify-between text-xs text-gray-400">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Est. {formatTime(match.estimatedRemainingSeconds)} remaining
                  </span>
                  <span>{Math.round(match.progress)}%</span>
                </div>
                <Progress value={match.progress} className="h-1.5" />
              </div>

              {/* Spectate Button */}
              <Button
                onClick={() => handleSpectate(match.matchId)}
                className="w-full bg-yellow-600 hover:bg-yellow-500 text-black font-semibold text-xs py-2"
                size="sm"
              >
                <Eye className="h-3.5 w-3.5 mr-1.5" />
                Spectate
              </Button>
            </motion.div>
          ))}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}

