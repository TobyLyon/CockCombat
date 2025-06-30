"use client"

import { useState, useEffect, useCallback } from "react"

export function useGameState() {
  // Game states: "lobby", "countdown", "playing", "gameOver"
  const [gameState, setGameState] = useState("lobby")
  const [playerHealth, setPlayerHealth] = useState(3)
  const [remainingPlayers, setRemainingPlayers] = useState(15)
  const [timeRemaining, setTimeRemaining] = useState(120) // 2 minutes
  const [prizePool, setPrizePool] = useState(15) // 1 $CLUCK per player
  const [peckCooldown, setPeckCooldown] = useState(0)
  const [isWinner, setIsWinner] = useState(false)

  // Start the game
  const startGame = useCallback(() => {
    setGameState("countdown")
    setPlayerHealth(3)
    setRemainingPlayers(15)
    setTimeRemaining(120)
    setPrizePool(15)
    setPeckCooldown(0)
    setIsWinner(false)

    // After countdown, start the game
    setTimeout(() => {
      setGameState("playing")
    }, 5000)
  }, [])

  // Reset the game
  const resetGame = useCallback(() => {
    setGameState("lobby")
  }, [])

  // Game timer
  useEffect(() => {
    let timer
    if (gameState === "playing") {
      timer = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            clearInterval(timer)
            // If player is still alive when time runs out, they win
            if (playerHealth > 0) {
              setIsWinner(true)
            }
            setGameState("gameOver")
            return 0
          }
          return prev - 1
        })

        // Randomly eliminate AI chickens
        if (Math.random() < 0.05 && remainingPlayers > 1) {
          setRemainingPlayers((prev) => prev - 1)

          // If only player remains, they win
          if (remainingPlayers === 2) {
            setIsWinner(true)
            setGameState("gameOver")
          }
        }

        // Decrease peck cooldown
        setPeckCooldown((prev) => Math.max(0, prev - 0.1))
      }, 100)
    }

    return () => clearInterval(timer)
  }, [gameState, remainingPlayers, playerHealth])

  // Handle player damage
  useEffect(() => {
    if (playerHealth <= 0 && gameState === "playing") {
      setIsWinner(false)
      setGameState("gameOver")
    }
  }, [playerHealth, gameState])

  // Expose methods to damage player and use peck
  const damagePlayer = useCallback(() => {
    setPlayerHealth((prev) => Math.max(0, prev - 1))
  }, [])

  const usePeck = useCallback(() => {
    if (peckCooldown <= 0) {
      setPeckCooldown(1) // 1 second cooldown

      // 30% chance to hit and damage an AI chicken
      if (Math.random() < 0.3 && remainingPlayers > 1) {
        setRemainingPlayers((prev) => prev - 1)

        // If only player remains, they win
        if (remainingPlayers === 2) {
          setIsWinner(true)
          setGameState("gameOver")
        }
      }

      return true
    }
    return false
  }, [peckCooldown, remainingPlayers, gameState])

  return {
    gameState,
    playerHealth,
    remainingPlayers,
    timeRemaining,
    prizePool,
    peckCooldown,
    startGame,
    resetGame,
    damagePlayer,
    usePeck,
    isWinner,
  }
}
