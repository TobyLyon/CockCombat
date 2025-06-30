"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Heart, Clock, Users, Trophy, Zap, HelpCircle, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

interface GameUIProps {
  gameState: string;       // Current state of the game
  health: number;          // Player's current health
  remaining: number;       // Number of players remaining
  time: number;            // Time remaining in the match
  prize: number;           // Current prize pool
  peckCooldown: number;    // Cooldown status for pecking
  isWinner: boolean;       // Whether the player won
  onExit: () => void;      // Function to call when exiting
}

// Helper to render hearts
const renderHearts = (count: number) => {
  const hearts = [];
  for (let i = 0; i < 3; i++) {
    hearts.push(
      <Heart
        key={i}
        className={`h-6 w-6 ${i < count ? 'text-red-500 fill-current' : 'text-gray-600'}`}
        style={{ filter: i < count ? 'drop-shadow(1px 1px 0px #8B0000)' : 'none' }} // Add pixel drop shadow to filled hearts
      />
    );
  }
  return hearts;
};

export default function GameUI({
  gameState,
  health,
  remaining,
  time,
  prize,
  peckCooldown,
  isWinner,
  onExit,
}: GameUIProps) {
  const [countdown, setCountdown] = useState(5)
  const [showControls, setShowControls] = useState(false)
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  // Log the received gameState prop
  useEffect(() => {
    console.log("GameUI received gameState:", gameState);
  }, [gameState]);

  // Handle lobby countdown
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined; // Use inferred return type
    if (gameState === "countdown" && countdown > 0) {
      timer = setTimeout(() => setCountdown(countdown - 1), 1000)
    }
    // Automatically transition state after countdown finishes (assuming EnhancedChickenRoyale handles this)
    // if (countdown === 0) { /* Logic to start game might go here or in parent */ } 
    return () => clearTimeout(timer)
  }, [gameState, countdown])

  // Reset countdown when game state changes back to countdown
  useEffect(() => {
    if (gameState === "countdown") {
      setCountdown(5)
    }
  }, [gameState])

  // Toggle controls help
  const toggleControls = () => {
    setShowControls(!showControls)
  }

  // Format time as MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowExitConfirm(true);
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="absolute top-0 left-0 w-full h-full pointer-events-none pixel-font">
      {/* Exit button */}
      {(gameState === "playing" || gameState === "gameOver") && (
        <motion.div 
          className="absolute top-4 left-4 pointer-events-auto"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Button
            className="bg-[#ff4500] hover:bg-[#ff6347] text-white font-bold py-2 px-4 rounded border-b-4 border-[#8B0000] hover:border-[#ff4500] transition-all flex items-center gap-2 pixel-font"
            onClick={() => setShowExitConfirm(true)}
          >
            <ArrowLeft className="h-4 w-4" />
            EXIT ARENA
          </Button>
        </motion.div>
      )}

      {/* Game HUD - Top Center */}
      {(gameState === "playing" || gameState === "gameOver") && (
        <motion.div 
          className="absolute top-4 left-1/2 transform -translate-x-1/2 flex justify-center items-start gap-4"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <div className="bg-black/70 p-3 rounded-lg border border-yellow-500 pointer-events-auto flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-400" />
            <div>
              <div className="text-yellow-400 font-bold text-xs">Prize Pool</div>
              <div className="text-white text-lg">{prize} $COCK</div>
            </div>
          </div>

          <div className="bg-black/70 p-3 rounded-lg border border-yellow-500 pointer-events-auto flex items-center gap-2">
            <Clock className="h-5 w-5 text-yellow-400" />
            <div>
              <div className="text-yellow-400 font-bold text-xs">Time</div>
              <div className="text-white text-lg">
                {Math.floor(time / 60)}:{(time % 60).toString().padStart(2, "0")}
              </div>
            </div>
          </div>

          <div className="bg-black/70 p-3 rounded-lg border border-yellow-500 pointer-events-auto flex items-center gap-2">
            <Users className="h-5 w-5 text-yellow-400" />
            <div>
              <div className="text-yellow-400 font-bold text-xs">Remaining</div>
              <div className="text-white text-lg">{remaining}/15</div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Spinning Coin GIF in the bottom-left corner */}
      {gameState === "playing" && (
        <motion.div 
          className="absolute bottom-4 left-4 pointer-events-auto z-10"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 300 }}
        >
          <div className="bg-black/60 p-2 rounded-lg border-2 border-yellow-500">
            <img 
              src="/images/cock_combat_coin_spin.gif" 
              alt="$COCK Coin" 
              className="w-20 h-20 object-contain"
            />
            <div className="text-yellow-400 text-xs text-center mt-1 font-bold pixel-font">$COCK</div>
          </div>
        </motion.div>
      )}

      {/* Player health and peck cooldown - Bottom Center */}
      {gameState === "playing" && (
        <motion.div 
          className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex flex-col items-center gap-2"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          {/* Health Hearts */}
          <div className="bg-black/70 p-2 px-3 rounded-lg border border-yellow-500 pointer-events-auto flex items-center gap-1.5">
            {renderHearts(health)}
          </div>

          {/* Peck Cooldown */}
          {peckCooldown > 0 && (
            <div className="bg-black/70 p-1 px-2 rounded-lg border border-yellow-500 pointer-events-auto flex items-center gap-1 text-xs">
              <Zap className="h-3 w-3 text-yellow-400" />
              <div className="text-yellow-400 pixel-font">PECK: {peckCooldown.toFixed(1)}s</div>
            </div>
          )}
        </motion.div>
      )}

      {/* Controls help toggle - Bottom Right */}
      {gameState === "playing" && (
        <motion.div 
          className="absolute bottom-4 right-4 pointer-events-auto"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <Button
            onClick={toggleControls}
            variant="outline"
            size="icon"
            className="bg-black/70 border border-yellow-500 text-yellow-400 hover:bg-yellow-900/50 hover:text-yellow-300 p-2 rounded-full h-10 w-10 flex items-center justify-center"
          >
            <HelpCircle className="h-5 w-5" />
          </Button>
          
          {showControls && (
            <motion.div 
              className="absolute bottom-12 right-0 bg-black/80 p-4 rounded-lg border-2 border-yellow-600 w-52 pixel-font shadow-lg"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="text-yellow-400 font-bold text-base mb-2">CONTROLS</div>
              <div className="text-white text-sm mb-1"><span className="text-yellow-300 font-semibold">WASD/Arrows:</span> Move</div>
              <div className="text-white text-sm mb-1"><span className="text-yellow-300 font-semibold">Space:</span> Peck</div>
              <div className="text-white text-sm"><span className="text-yellow-300 font-semibold">Mouse:</span> Look Around</div>
            </motion.div>
          )}
        </motion.div>
      )}

      {/* Leaderboard - Top Right (below player info) */}
      {gameState === "playing" && (
        <motion.div 
          className="absolute top-24 right-4 bg-black/70 p-3 rounded-lg border border-yellow-500 pointer-events-auto max-h-[200px] overflow-y-auto w-48"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.7 }}
        >
          <div className="text-yellow-400 font-bold mb-2 pixel-font text-sm">LEADERBOARD</div>
          <div className="space-y-1">
            {/* TODO: Replace with actual dynamic leaderboard data from parent component */}
            {Array.from({ length: remaining }).map((_, i) => (
              <div key={i} className="flex justify-between items-center">
                <div className="text-white text-xs truncate pixel-font">
                  {/* TODO: Replace with actual player name */}
                  Chicken #${i+1}
                </div>
                <Badge variant="outline" className="bg-green-900/30 text-green-400 text-xs pixel-font">
                  {/* TODO: Replace with actual health from parent */}
                  {Math.floor(Math.random() * 3) + 1} HP 
                </Badge>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Countdown Timer Display */}
      {gameState === "countdown" && countdown > 0 && (
        <motion.div
          key={countdown} // Use key to re-trigger animation when countdown changes
          className="absolute inset-0 flex items-center justify-center pointer-events-none z-50"
          initial={{ scale: 1.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.5, opacity: 0 }} // Exit animation might not show without AnimatePresence
          transition={{ duration: 0.4, ease: "easeInOut" }}
        >
          <div className="text-9xl font-bold text-yellow-400 pixel-font drop-shadow-[6px_6px_0px_#000000]">
            {countdown}
          </div>
        </motion.div>
      )}

      {/* Game Over / Winner Display */}
      {gameState === "gameOver" && (
          <motion.div 
            className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 pointer-events-auto z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            <div className="text-center p-10 bg-[#222] border-4 border-yellow-600 rounded-lg shadow-xl pixel-shadow-hard">
              <motion.h2 
                className={`text-6xl font-bold mb-6 pixel-font drop-shadow-[4px_4px_0px_#000]`}
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 100 }}
              >
                {isWinner ? <span className="text-green-400">VICTORY!</span> : <span className="text-red-500">GAME OVER</span>}
              </motion.h2>
              {isWinner && (
                <motion.p 
                  className="text-2xl text-yellow-300 mb-8 pixel-font"
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.4 }}
                >
                  You are the last cock standing!
                </motion.p>
              )}
              {!isWinner && (
                <motion.p 
                  className="text-2xl text-gray-300 mb-8 pixel-font"
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.4 }}
                >
                  Better luck next time, clucker!
                </motion.p>
              )}
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.6 }}
              >
                <Button
                  onClick={onExit} 
                  className="bg-yellow-500 hover:bg-yellow-400 text-black font-bold py-3 px-8 rounded border-b-4 border-yellow-700 hover:border-yellow-500 transition-all pixel-font text-xl pixel-shadow"
                >
                  RETURN TO LOBBY
                </Button>
              </motion.div>
            </div>
          </motion.div>
      )}

      {/* Exit confirmation modal */}
      {showExitConfirm && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 pointer-events-auto">
          <div className="bg-gray-800 p-6 rounded-lg max-w-md text-center">
            <h2 className="text-xl font-bold text-white mb-4">Exit Battle?</h2>
            <p className="text-gray-300 mb-6">Are you sure you want to exit? Your progress will be lost.</p>
            <div className="flex justify-center space-x-4">
              <button 
                className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg"
                onClick={() => setShowExitConfirm(false)}
              >
                Cancel
              </button>
              <button 
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg"
                onClick={onExit}
              >
                Exit Battle
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
