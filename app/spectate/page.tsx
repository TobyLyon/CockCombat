"use client";

import { useRouter } from "next/navigation";
import { Button } from "../../components/ui/button";
import { ArrowLeft, Radio } from "lucide-react";
import LiveMatchesFeed from "../../components/spectator/live-matches-feed";

export default function SpectateIndexPage() {
  const router = useRouter()

  return (
    <div className="relative min-h-screen bg-gray-900 text-white flex flex-col overflow-hidden" style={{
      backgroundImage: `radial-gradient(circle at top right, rgba(255, 170, 0, 0.08), transparent 30%), radial-gradient(circle at bottom left, rgba(255, 0, 0, 0.08), transparent 30%)`
    }}>
      <main className="relative z-10 flex-1 flex flex-col max-w-full max-h-full overflow-hidden">
        <div className="flex-1 flex flex-col lg:flex-row w-full h-full max-h-full overflow-hidden gap-4">
          {/* Main area */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <div className="w-full mx-auto px-4 py-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-3xl sm:text-4xl font-bold mb-2 text-yellow-400 pixel-font flex items-center gap-3">
                    <Radio className="h-8 w-8 animate-pulse" />
                    Spectate Matches
                  </h1>
                  <p className="text-gray-400">Watch live battles with a dedicated viewer</p>
                </div>
                <Button 
                  variant="outline" 
                  onClick={() => router.push("/arena")}
                  className="border-yellow-600/30 text-yellow-400 hover:bg-yellow-600/10 hover:border-yellow-600/50"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Arena
                </Button>
              </div>

              <LiveMatchesFeed />
            </div>
          </div>

          {/* Side panel for tips/status (future expansion) */}
          <div className="hidden lg:block w-[350px] flex-shrink-0 overflow-y-auto px-4 py-6">
            <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
              <h2 className="text-sm font-semibold text-white/90 mb-2">How spectating works</h2>
              <p className="text-xs text-white/60">Choose a live match to open the full spectate view with chat and betting.</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}