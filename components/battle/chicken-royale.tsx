"use client"

import { useRef, useEffect } from "react"
import { Canvas } from "@react-three/fiber"
import { OrbitControls, PerspectiveCamera } from "@react-three/drei"
import BattleArenaScene from "./battle-arena-scene"
import GameUI from "./game-ui"
import { useBattleState, Player } from "@/hooks/use-battle-state"
import { usePlayerControls } from "@/hooks/use-player-controls"
import GameOver from "./game-over"
import { useAIController } from "@/hooks/use-ai-controller"

// Mock initial players for development
const mockPlayers: Player[] = [
  { id: 'human-player', health: 100, position: { x: 0, y: 0, z: 0 }, rotation: { y: 0 }, isAi: false },
  { id: 'ai-player-1', health: 100, position: { x: 5, y: 0, z: 5 }, rotation: { y: 0 }, isAi: true },
  { id: 'ai-player-2', health: 100, position: { x: -5, y: 0, z: -5 }, rotation: { y: 0 }, isAi: true },
];

export default function ChickenRoyale({ onExit }) {
  const {
    gameState,
    players,
    timeRemaining,
    prizePool,
    peckCooldown,
    winner,
    humanPlayer,
    startGame,
    resetGame,
    updatePlayerPosition,
    performPeck,
  } = useBattleState(mockPlayers);

  const { moveDirection, isPecking } = usePlayerControls();
  
  // Hook to control AI players
  useAIController(players.filter(p => p.isAi), players, updatePlayerPosition, performPeck);

  // Start game automatically
  useEffect(() => {
    startGame();
  }, [startGame]);

  // Update human player movement
  useEffect(() => {
    if (gameState === "playing" && humanPlayer && moveDirection) {
      updatePlayerPosition(humanPlayer.id, moveDirection);
      if (isPecking) {
        performPeck(humanPlayer.id);
      }
    }
  }, [gameState, humanPlayer, moveDirection, isPecking, updatePlayerPosition, performPeck]);
  
  const humanPlayerPosition = humanPlayer?.position || {x: 0, y: 0, z: 0};

  return (
    <div className="w-full h-full relative">
      <Canvas shadows>
        <PerspectiveCamera makeDefault position={[0, 10, 15]} fov={50} />
        <ambientLight intensity={0.5} />
        <directionalLight
          position={[10, 10, 5]}
          intensity={1}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />

        {players.map(player => (
           <BattleArenaScene 
             key={player.id}
             player={player}
           />
        ))}

        <OrbitControls
          target={[humanPlayerPosition.x, 0, humanPlayerPosition.z]}
          enableZoom={true}
          enablePan={false}
          minPolarAngle={Math.PI / 6}
          maxPolarAngle={Math.PI / 2.5}
          minDistance={5}
          maxDistance={15}
        />
      </Canvas>

      <GameUI
        gameState={gameState}
        playerHealth={humanPlayer?.health || 0}
        remainingPlayers={players.filter(p => p.health > 0).length}
        timeRemaining={timeRemaining}
        prizePool={prizePool}
        peckCooldown={peckCooldown}
        resetGame={resetGame}
        onExit={onExit}
      />

      {gameState === "gameOver" && (
        <GameOver winner={winner} humanPlayer={humanPlayer} onExit={onExit} />
      )}
    </div>
  );
}
