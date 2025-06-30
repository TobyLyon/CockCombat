"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

// Define an interface for the Match object
interface Match {
  id: string;
  player1: string;
  player2: string;
  wagerAmount: number;
  inProgress: boolean;
}

// Mock match data - Update with wager amounts
const MOCK_MATCHES: Match[] = [
  { id: "match-1", player1: "CockyWarrior", player2: "FeatherFury", wagerAmount: 10000, inProgress: true }, // Tier 1
  { id: "match-2", player1: "CluckNorris", player2: "WingCommander", wagerAmount: 100000, inProgress: true }, // Tier 2
  { id: "match-3", player1: "BeakTyson", player2: "HenSolo", wagerAmount: 1000000, inProgress: true } // Tier 3
];

export default function SpectateIndexPage() {
  // Use the Match interface for the state type
  const [liveMatches, setLiveMatches] = useState<Match[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Simulate loading live matches
  useEffect(() => {
    // Replace with actual API call to fetch live matches
    const fetchLiveMatches = async () => {
      setIsLoading(true);
      try {
        // Simulating API delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        setLiveMatches(MOCK_MATCHES);
      } catch (error) {
        console.error("Failed to fetch live matches:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchLiveMatches();
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-6">
      <h1 className="text-3xl font-bold mb-6">Live Matches</h1>
      
      {isLoading ? (
        <div className="text-gray-400">Loading live matches...</div>
      ) : liveMatches.length > 0 ? (
        <div className="w-full max-w-2xl grid gap-4">
          {liveMatches.map((match) => (
            <Link 
              href={`/spectate/${match.id}`} 
              key={match.id}
              className="block w-full"
            >
              <div className="border border-gray-700 bg-gray-800 rounded-lg p-4 hover:bg-gray-700 transition-colors">
                <div className="flex justify-between items-center">
                  <h3 className="font-semibold text-lg flex items-center">
                    <span className="text-yellow-500 mr-2">💰</span> 
                    Wager: {match.wagerAmount.toLocaleString()} $COCK
                  </h3>
                  <div className="flex items-center">
                    <span className="h-2 w-2 bg-green-500 rounded-full animate-pulse mr-2"></span>
                    <span className="text-sm text-gray-400">Live</span>
                  </div>
                </div>
                <Button className="w-full mt-3">Watch Match</Button>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="text-center">
          <p className="text-gray-400 mb-4">No live matches available at the moment.</p>
          <p className="text-gray-500 text-sm">Check back soon or visit the arena to start your own match!</p>
          <Link href="/arena">
            <Button className="mt-4">Go to Arena</Button>
          </Link>
        </div>
      )}
      
      <div className="mt-8 text-center text-sm text-gray-500 max-w-lg">
        <p>Select a match above to spectate, or navigate directly to <code className="bg-gray-800 px-2 py-1 rounded">/spectate/[matchId]</code> if you have a specific match ID.</p>
      </div>
    </div>
  );
} 