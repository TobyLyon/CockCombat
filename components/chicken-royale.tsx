"use client"

import { useRef } from "react"
import { Canvas } from "@react-three/fiber"
import { OrbitControls, PerspectiveCamera } from "@react-three/drei"
import { Button } from "@/components/ui/button"
import Arena from "./game/arena"
import GameUI from "./game/game-ui"
import { useGameState } from "@/hooks/use-game-state"

export default function ChickenRoyale() {
  const canvasRef = useRef(null)
  const {
    gameState,
    playerHealth,
    remainingPlayers,
    timeRemaining,
    prizePool,
    peckCooldown,
    startGame,
    resetGame,
    isWinner,
  } = useGameState()

  return (
    <div className="w-full h-screen relative">
      <Canvas ref={canvasRef} shadows>
        <PerspectiveCamera makeDefault position={[0, 25, 25]} />
        <ambientLight intensity={0.5} />
        <directionalLight
          position={[10, 10, 5]}
          intensity={1}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />
        <Arena gameState={gameState} />
        <OrbitControls enableZoom={true} enablePan={true} minPolarAngle={Math.PI / 6} maxPolarAngle={Math.PI / 2.5} />
      </Canvas>

      <GameUI
        gameState={gameState}
        playerHealth={playerHealth}
        remainingPlayers={remainingPlayers}
        timeRemaining={timeRemaining}
        prizePool={prizePool}
        peckCooldown={peckCooldown}
        startGame={startGame}
        resetGame={resetGame}
        isWinner={isWinner}
      />

      {gameState === "lobby" && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10 flex flex-col items-center">
          <div className="bg-black/80 p-8 rounded-lg border-2 border-yellow-400 text-center">
            <h1 className="text-4xl font-bold text-yellow-400 mb-6">CHICKEN ROYALE</h1>
            <p className="text-white mb-6">Battle arena for voxel chickens!</p>
            <Button
              onClick={startGame}
              className="bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-3 px-6 rounded-lg text-lg"
            >
              Pay 1 $CLUCK to Join
            </Button>
          </div>
        </div>
      )}

      {gameState === "gameOver" && isWinner && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10">
          <div className="bg-black/80 p-8 rounded-lg border-2 border-yellow-400 text-center">
            <h2 className="text-4xl font-bold text-yellow-400 mb-4">WINNER!</h2>
            <p className="text-white text-xl mb-6">You claimed the prize pool of {prizePool} $CLUCK!</p>
            <Button
              onClick={resetGame}
              className="bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-3 px-6 rounded-lg text-lg"
            >
              Play Again
            </Button>
          </div>
        </div>
      )}

      {gameState === "gameOver" && !isWinner && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10">
          <div className="bg-black/80 p-8 rounded-lg border-2 border-red-500 text-center">
            <h2 className="text-4xl font-bold text-red-500 mb-4">FRIED!</h2>
            <p className="text-white text-xl mb-6">Better luck next time!</p>
            <Button
              onClick={resetGame}
              className="bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-3 px-6 rounded-lg text-lg"
            >
              Play Again
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
