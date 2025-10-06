"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Radio } from "lucide-react";
import LiveMatchesFeed from "@/components/spectator/live-matches-feed";

export default function SpectateIndexPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 text-white">
      <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold mb-2 text-yellow-400 pixel-font flex items-center gap-3">
              <Radio className="h-8 w-8 animate-pulse" />
              SPECTATOR MODE
            </h1>
            <p className="text-gray-400">Watch live battles and chat with other spectators</p>
          </div>
          <Button 
            variant="outline" 
            onClick={() => router.push("/arena")}
            className="border-gray-700 hover:bg-gray-800"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Arena
          </Button>
        </div>
        
        {/* Live Matches Feed */}
        <LiveMatchesFeed />
      </div>
    </div>
  );
} 