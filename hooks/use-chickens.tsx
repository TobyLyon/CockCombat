"use client"

import { useState, useEffect } from "react"
import * as THREE from "three"

// Define the structure of a chicken's state
interface ChickenState {
  id: string;
  position: THREE.Vector3;
  rotation: THREE.Euler;
  health: number;
  isPlayer: boolean;
  isPecking: boolean;
  isDying: boolean;
  color: string;
  fadeOut: number;
  colors?: any; // Add colors property for the canonical chicken model
}

export function useChickens(gameState: string) {
  // Initialize chickens with the correct type
  const [chickens, setChickens] = useState<ChickenState[]>([])

  // Initialize chickens when game starts
  useEffect(() => {
    if (gameState === "playing") {
      const newChickens: ChickenState[] = []
      const arenaSize = 40 // Arena size for spawning
      const CHICKEN_COUNT = 15 // Total number of chickens including player

      // Create player chicken at the center
      newChickens.push({
        id: "player",
        position: new THREE.Vector3(0, 0.5, 0),
        rotation: new THREE.Euler(0, 0, 0),
        health: 3,
        isPlayer: true,
        isPecking: false,
        isDying: false,
        color: "#f59e0b",
        fadeOut: 0,
        colors: {
          body: "#f59e0b",
          beak: "#FFD600",
          comb: "#ef4444",
          legs: "#FFD600",
          tail: "#6366f1",
          eyes: "#ffffff",
          pupils: "#000000"
        }
      })

      // Create AI chickens - different colors for variety
      const aiColors = [
        { body: "#f97316", comb: "#ef4444", beak: "#FFD600", legs: "#FFD600", tail: "#6366f1" },
        { body: "#ef4444", comb: "#ef4444", beak: "#FFD600", legs: "#FFD600", tail: "#6366f1" },
        { body: "#3b82f6", comb: "#ef4444", beak: "#FFD600", legs: "#FFD600", tail: "#6366f1" },
        { body: "#22c55e", comb: "#ef4444", beak: "#FFD600", legs: "#FFD600", tail: "#6366f1" },
        { body: "#a855f7", comb: "#ef4444", beak: "#FFD600", legs: "#FFD600", tail: "#6366f1" },
        { body: "#ec4899", comb: "#ef4444", beak: "#FFD600", legs: "#FFD600", tail: "#6366f1" }
      ]

      // Create AI chickens in a circle around the arena
      for (let i = 0; i < CHICKEN_COUNT - 1; i++) {
        // Calculate position in a circle around the arena
        const angle = (i / (CHICKEN_COUNT - 1)) * Math.PI * 2
        const radius = arenaSize / 3 // Spawn in a circle at 1/3 of the arena size
        const x = Math.cos(angle) * radius
        const z = Math.sin(angle) * radius
        
        // Face toward the center
        const rotation = new THREE.Euler(0, Math.atan2(-x, -z), 0)
        
        // Get random color from the aiColors array
        const colorSet = aiColors[Math.floor(Math.random() * aiColors.length)]
        
        newChickens.push({
          id: `ai-${i}`,
          position: new THREE.Vector3(x, 0.5, z),
          rotation: rotation,
          health: 3,
          isPlayer: false,
          isPecking: false,
          isDying: false,
          color: colorSet.body,
          fadeOut: 5 + Math.random() * 3, // Random fade out time between 5-8 seconds
          colors: {
            ...colorSet,
            eyes: "#ffffff",
            pupils: "#000000"
          }
        })
      }

      setChickens(newChickens)
    }
  }, [gameState])

  // Update chicken positions based on player position
  useEffect(() => {
    if (gameState === "playing") {
      const updateInterval = setInterval(() => {
        setChickens((prevChickens) => {
          // Guard against null or undefined prevChickens
          if (!prevChickens || !Array.isArray(prevChickens)) return []

          const newChickens: ChickenState[] = [...prevChickens]

          // Find player chicken with null check
          const playerChicken = newChickens.find((c) => c && c.isPlayer)
          if (!playerChicken) return prevChickens

          // Update AI chickens with null checks
          newChickens.forEach((chicken) => {
            if (chicken && !chicken.isPlayer && chicken.health > 0) {
              // Random movement
              const moveChance = Math.random()

              if (moveChance < 0.7) {
                // Move randomly
                const angle = Math.random() * Math.PI * 2
                const distance = Math.random() * 0.2

                chicken.position.x += Math.cos(angle) * distance
                chicken.position.z += Math.sin(angle) * distance

                // Update rotation to face movement direction
                chicken.rotation.y = angle
              } else if (moveChance < 0.9) {
                // Move toward player (aggressive behavior)
                const direction = new THREE.Vector3()
                  .subVectors(playerChicken.position, chicken.position)
                  .normalize()
                  .multiplyScalar(0.1)

                chicken.position.add(direction)

                // Face player
                chicken.rotation.y = Math.atan2(direction.x, direction.z)

                // Random chance to peck if close to player
                if (chicken.position.distanceTo(playerChicken.position) < 2 && Math.random() < 0.2) {
                  chicken.isPecking = true

                  // Reset pecking after a short time
                  setTimeout(() => {
                    setChickens((currentChickens) => {
                      if (!currentChickens || !Array.isArray(currentChickens)) return []
                      return currentChickens.map((c) => (c && c.id === chicken.id ? { ...c, isPecking: false } : c))
                    })
                  }, 500)
                }
              }

              // Constrain to arena bounds
              const arenaSize = 24
              chicken.position.x = Math.max(-arenaSize, Math.min(arenaSize, chicken.position.x))
              chicken.position.z = Math.max(-arenaSize, Math.min(arenaSize, chicken.position.z))
            }
          })

          return newChickens
        })
      }, 200)

      return () => clearInterval(updateInterval)
    }
  }, [gameState])

  // Return both the chickens array and the setter function
  return { chickens: chickens || [], setChickens }
}
