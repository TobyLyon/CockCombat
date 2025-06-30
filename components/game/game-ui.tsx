"use client"

import { useEffect, useState } from "react"

export default function GameUI({
  gameState,
  playerHealth,
  remainingPlayers,
  timeRemaining,
  prizePool,
  peckCooldown,
  startGame,
  resetGame,
  isWinner,
}) {
  const [countdown, setCountdown] = useState(5)

  // Handle lobby countdown
  useEffect(() => {
    let timer
    if (gameState === "countdown" && countdown > 0) {
      timer = setTimeout(() => setCountdown(countdown - 1), 1000)
    }
    return () => clearTimeout(timer)
  }, [gameState, countdown])

  // Reset countdown when game state changes
  useEffect(() => {
    if (gameState === "countdown") {
      setCountdown(5)
    }
  }, [gameState])

  return (
    <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
      {/* Game HUD */}
      {(gameState === "playing" || gameState === "gameOver") && (
        <div className="absolute top-4 left-4 right-4 flex justify-between items-start">
          <div className="bg-black/70 p-3 rounded-lg border border-yellow-500">
            <div className="text-yellow-400 font-bold">Prize Pool</div>
            <div className="text-white text-xl">{prizePool} $CLUCK</div>
          </div>

          <div className="bg-black/70 p-3 rounded-lg border border-yellow-500">
            <div className="text-yellow-400 font-bold">Time Remaining</div>
            <div className="text-white text-xl">
              {Math.floor(timeRemaining / 60)}:{(timeRemaining % 60).toString().padStart(2, "0")}
            </div>
          </div>

          <div className="bg-black/70 p-3 rounded-lg border border-yellow-500">
            <div className="text-yellow-400 font-bold">Chickens Remaining</div>
            <div className="text-white text-xl">{remainingPlayers}</div>
          </div>
        </div>
      )}

      {/* Player health and peck cooldown */}
      {gameState === "playing" && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex flex-col items-center">
          <div className="bg-black/70 p-3 rounded-lg border border-yellow-500 mb-2">
            <div className="text-yellow-400 font-bold mb-1">Health</div>
            <div className="w-48 h-4 bg-gray-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  playerHealth > 2 ? "bg-green-500" : playerHealth > 1 ? "bg-yellow-500" : "bg-red-500"
                }`}
                style={{ width: `${(playerHealth / 3) * 100}%` }}
              ></div>
            </div>
          </div>

          {peckCooldown > 0 && (
            <div className="bg-black/70 p-2 rounded-lg border border-yellow-500">
              <div className="text-yellow-400">Peck Cooldown: {peckCooldown.toFixed(1)}s</div>
            </div>
          )}
        </div>
      )}

      {/* Countdown overlay */}
      {gameState === "countdown" && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-8xl font-bold text-yellow-400 bg-black/50 p-8 rounded-full w-40 h-40 flex items-center justify-center">
            {countdown}
          </div>
        </div>
      )}

      {/* Controls help */}
      {gameState === "playing" && (
        <div className="absolute bottom-4 right-4 bg-black/70 p-3 rounded-lg border border-yellow-500">
          <div className="text-yellow-400 font-bold mb-1">Controls</div>
          <div className="text-white text-sm">WASD / Arrow Keys: Move</div>
          <div className="text-white text-sm">Space: Peck</div>
        </div>
      )}
    </div>
  )
}
