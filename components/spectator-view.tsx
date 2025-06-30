"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { X } from "lucide-react"

export default function SpectatorView({ onClose }) {
  const [loading, setLoading] = useState(true)
  const [currentMatch, setCurrentMatch] = useState(null)
  const [matchTime, setMatchTime] = useState(120) // 2 minutes
  const canvasRef = useRef(null)
  const animationRef = useRef(null)

  // Simulated match data
  const matchData = {
    id: "match-1",
    player1: {
      name: "FeatherFury",
      color: "#f97316",
      health: 100,
      position: { x: 100, y: 150 },
      direction: 1,
    },
    player2: {
      name: "BeakBreaker",
      color: "#3b82f6",
      health: 100,
      position: { x: 300, y: 150 },
      direction: -1,
    },
  }

  useEffect(() => {
    // Simulate loading
    const timer = setTimeout(() => {
      setLoading(false)
      setCurrentMatch(matchData)
    }, 2000)

    return () => clearTimeout(timer)
  }, [])

  // Match timer
  useEffect(() => {
    let interval
    if (currentMatch && matchTime > 0) {
      interval = setInterval(() => {
        setMatchTime((prev) => prev - 1)
      }, 1000)
    }

    return () => clearInterval(interval)
  }, [currentMatch, matchTime])

  // Canvas animation
  useEffect(() => {
    if (!canvasRef.current || !currentMatch) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext("2d")
    const width = canvas.width
    const height = canvas.height

    // Animation variables
    let player1Jump = 0
    let player2Jump = 0
    let player1Attack = false
    let player2Attack = false
    let frame = 0

    const drawPixelChicken = (x, y, color, direction, isAttacking, jumpOffset) => {
      // Body
      ctx.fillStyle = color
      ctx.fillRect(x - 15 * direction, y - 30 - jumpOffset, 30, 30)

      // Head
      ctx.fillRect(x + 5 * direction, y - 45 - jumpOffset, 20, 20)

      // Comb
      ctx.fillStyle = "#ef4444"
      ctx.fillRect(x + 5 * direction, y - 55 - jumpOffset, 5, 10)

      // Beak
      ctx.fillStyle = "#fbbf24"
      ctx.fillRect(x + 25 * direction, y - 40 - jumpOffset, 10, 10)

      // Eye
      ctx.fillStyle = "#000000"
      ctx.fillRect(x + 15 * direction, y - 40 - jumpOffset, 5, 5)

      // Wing
      ctx.fillStyle = color === "#f97316" ? "#ea580c" : color
      ctx.fillRect(x - 20 * direction, y - 25 - jumpOffset, 5, 20)

      // Legs
      ctx.fillStyle = "#fbbf24"
      ctx.fillRect(x - 10 * direction, y, 5, 15)
      ctx.fillRect(x + 5 * direction, y, 5, 15)

      // Attack animation
      if (isAttacking) {
        ctx.fillStyle = "#ff0000"
        ctx.fillRect(x + 35 * direction, y - 40 - jumpOffset, 15, 15)
      }
    }

    const render = () => {
      // Clear canvas
      ctx.fillStyle = "#D2B48C"
      ctx.fillRect(0, 0, width, height)

      // Draw arena border
      ctx.strokeStyle = "#8B4513"
      ctx.lineWidth = 10
      ctx.strokeRect(10, 10, width - 20, height - 20)

      // Update animation variables
      frame++
      if (frame % 60 === 0) {
        player1Attack = Math.random() > 0.7
        player2Attack = Math.random() > 0.7
      }

      player1Jump = Math.sin(frame / 10) * 5
      player2Jump = Math.sin(frame / 10 + Math.PI) * 5

      // Update positions
      const p1 = currentMatch.player1
      const p2 = currentMatch.player2

      // Draw chickens
      drawPixelChicken(p1.position.x, p1.position.y, p1.color, p1.direction, player1Attack, player1Jump)
      drawPixelChicken(p2.position.x, p2.position.y, p2.color, p2.direction, player2Attack, player2Jump)

      // Draw health bars
      ctx.fillStyle = "#000000"
      ctx.fillRect(50, 20, 100, 15)
      ctx.fillRect(width - 150, 20, 100, 15)

      ctx.fillStyle = "#22c55e"
      ctx.fillRect(50, 20, p1.health, 15)
      ctx.fillRect(width - 150, 20, p2.health, 15)

      // Draw names
      ctx.fillStyle = "#ffffff"
      ctx.font = "10px 'Press Start 2P', monospace"
      ctx.fillText(p1.name, 50, 50)
      ctx.fillText(p2.name, width - 150, 50)

      // Simulate some damage
      if (player1Attack && Math.random() > 0.7) {
        currentMatch.player2.health = Math.max(0, currentMatch.player2.health - 5)
      }
      if (player2Attack && Math.random() > 0.7) {
        currentMatch.player1.health = Math.max(0, currentMatch.player1.health - 5)
      }

      animationRef.current = requestAnimationFrame(render)
    }

    render()

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [currentMatch])

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  return (
    <div className="w-full h-full relative bg-[#333333] border-4 border-[#222222] rounded-lg overflow-hidden">
      <div className="absolute top-2 right-2 z-20">
        <Button
          variant="outline"
          size="icon"
          className="w-8 h-8 rounded-md bg-[#444444] border-2 border-[#666666] hover:bg-[#555555]"
          onClick={onClose}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {loading ? (
        <div className="absolute inset-0 flex items-center justify-center bg-[#333333]">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-t-yellow-400 border-r-yellow-400 border-b-transparent border-l-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-white pixel-font">Loading Match...</p>
          </div>
        </div>
      ) : (
        <div className="w-full h-full flex flex-col">
          <div className="bg-[#222222] p-2 flex justify-between items-center">
            <div className="text-yellow-400 pixel-font text-sm">LIVE MATCH</div>
            <div className="text-white pixel-font text-sm">{formatTime(matchTime)}</div>
          </div>

          <div className="flex-1 flex items-center justify-center p-4">
            <canvas
              ref={canvasRef}
              width={400}
              height={300}
              className="border-4 border-[#8B4513] rounded-md"
              style={{ imageRendering: "pixelated" }}
            ></canvas>
          </div>

          <div className="bg-[#222222] p-2">
            <div className="text-center text-white pixel-font text-xs">
              Spectating: {currentMatch?.player1.name} vs {currentMatch?.player2.name}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
