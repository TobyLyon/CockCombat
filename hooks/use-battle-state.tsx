"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import * as THREE from "three"

const BATTLE_ARENA_WIDTH = 20
const BATTLE_ARENA_DEPTH = 20

export interface Player {
  id: string
  health: number
  position: { x: number; y: number; z: number }
  rotation: { y: number }
  isAi: boolean
}

export function useBattleState(initialPlayers: Player[] = []) {
  // Game states: "lobby", "countdown", "playing", "gameOver", "arena_ready"
  const [gameState, setGameState] = useState("lobby")
  const [players, setPlayers] = useState<Player[]>(initialPlayers)
  const [timeRemaining, setTimeRemaining] = useState(180) // 3 minutes
  const [prizePool] = useState(1000) // Placeholder
  const [peckCooldown, setPeckCooldown] = useState(0)
  const [winner, setWinner] = useState<Player | null>(null)

  const humanPlayer = players.find(p => !p.isAi)

  const gameTimerRef = useRef<NodeJS.Timeout | null>(null)
  const aiActionTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Start the game
  const startGame = useCallback(() => {
    // Spawn players at random positions
    setPlayers(currentPlayers => currentPlayers.map(p => ({
      ...p,
      position: {
        x: (Math.random() - 0.5) * BATTLE_ARENA_WIDTH,
        y: 0,
        z: (Math.random() - 0.5) * BATTLE_ARENA_DEPTH,
      },
      health: 100,
    })))
    setGameState("playing")
    setTimeRemaining(180)
  }, [])

  // Reset the game
  const resetGame = useCallback(() => {
    setGameState("lobby")
    setWinner(null)
  }, [])

  // Game loop
  useEffect(() => {
    if (gameState !== "playing") return

    const gameInterval = setInterval(() => {
      setTimeRemaining(prev => prev - 1)
      setPeckCooldown(prev => Math.max(0, prev - 1))

      // Check for game over conditions
      const remainingPlayers = players.filter(p => p.health > 0)
      if (timeRemaining <= 0 || remainingPlayers.length <= 1) {
        setGameState("gameOver")
        setWinner(remainingPlayers.length > 0 ? remainingPlayers[0] : null)
      }
    }, 1000)

    return () => clearInterval(gameInterval)
  }, [gameState, timeRemaining, players])

  // Update player position based on movement direction
  const updatePlayerPosition = useCallback((playerId: string, direction: { x: number; z: number }) => {
    setPlayers(currentPlayers => currentPlayers.map(p => {
      if (p.id === playerId) {
        const newPosition = { ...p.position }
        newPosition.x += direction.x * 0.1
        newPosition.z += direction.z * 0.1
        // Clamp position to stay within the arena
        newPosition.x = Math.max(-BATTLE_ARENA_WIDTH / 2, Math.min(BATTLE_ARENA_WIDTH / 2, newPosition.x))
        newPosition.z = Math.max(-BATTLE_ARENA_DEPTH / 2, Math.min(BATTLE_ARENA_DEPTH / 2, newPosition.z))
        return { ...p, position: newPosition }
      }
      return p
    }))
  }, [])

  // Perform peck action
  const performPeck = useCallback((attackerId: string) => {
    // Logic to determine if a peck hits another player
    setPeckCooldown(3) // 3-second cooldown
    // This would involve checking distances and applying damage
  }, [])

  return {
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
  }
}
