"use client"

import React, { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { useGameState } from "@/contexts/GameStateContext"
import { Coins, ArrowRight } from "lucide-react"
import confetti from "canvas-confetti"
import Image from "next/image"

interface WinnerCelebrationProps {
  onExit?: () => void
}

export default function WinnerCelebration({ onExit }: WinnerCelebrationProps = {}) {
  const { prizeAmount, returnToMainMenu, playSound } = useGameState()
  const [showConfetti, setShowConfetti] = useState(false)
  
  // Launch confetti when component mounts
  useEffect(() => {
    // Short delay before showing confetti
    const timer = setTimeout(() => {
      setShowConfetti(true)
      
      // Create confetti burst
      const duration = 5 * 1000
      const animationEnd = Date.now() + duration
      const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 }
      
      function randomInRange(min: number, max: number) {
        return Math.random() * (max - min) + min
      }
      
      const interval: any = setInterval(function() {
        const timeLeft = animationEnd - Date.now()
        
        if (timeLeft <= 0) {
          return clearInterval(interval)
        }
        
        const particleCount = 50 * (timeLeft / duration)
        
        // Launch confetti from both sides and middle
        confetti({
          ...defaults,
          particleCount,
          origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 }
        })
        confetti({
          ...defaults,
          particleCount,
          origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 }
        })
      }, 250)
      
      // Play victory sound
      playSound("victory")
      
      return () => {
        clearInterval(interval)
      }
    }, 500)
    
    return () => clearTimeout(timer)
  }, [playSound])
  
  // Handle play again button
  const handlePlayAgain = () => {
    playSound("button")
    if (onExit) {
      onExit()
    } else {
      returnToMainMenu()
    }
  }
  
  return (
    <AnimatePresence>
      <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/80">
        <motion.div 
          className="bg-gradient-to-b from-yellow-900 to-yellow-700 p-6 rounded-xl shadow-2xl max-w-xl w-full mx-3 border-2 border-yellow-500"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", duration: 0.45 }}
        >
          <motion.div 
            className="flex justify-center mb-4"
            initial={{ y: -16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.25 }}
          >
            <div className="relative h-16 w-16">
              <Image 
                src="/images/chicken-dinner-coin.png" 
                alt="Chicken Dinner Coin"
                width={64}
                height={64}
                className="object-contain drop-shadow-[0_0_12px_rgba(255,212,0,0.6)]"
              />
            </div>
          </motion.div>
          
          <motion.h1 
            className="text-3xl font-bold text-center text-yellow-300 mb-3 pixel-font"
            initial={{ y: -16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            VICTORY
          </motion.h1>
          
          <motion.div 
            className="text-center text-white mb-6"
            initial={{ y: -16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.55 }}
          >
            <p className="text-base mb-1">Your chicken is the last one standing.</p>
            <p className="text-sm text-yellow-100/90">Well fought in the arena.</p>
          </motion.div>
          
          <motion.div 
            className="bg-yellow-800 p-4 rounded-lg mb-6 border border-yellow-600"
            initial={{ y: -16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.7 }}
          >
            <h2 className="text-xl font-bold text-center text-yellow-300 mb-3 flex items-center justify-center">
              <Coins className="mr-2 h-5 w-5" />
              Your Winnings
            </h2>
            
            <div className="flex items-center justify-center gap-3">
              <div className="relative h-10 w-10">
                <Image 
                  src="/images/chicken-dinner-coin.png" 
                  alt="DINNER Token"
                  width={40} 
                  height={40}
                  className="object-contain"
                />
              </div>
              <div className="text-3xl font-bold text-yellow-300 pixel-font">
                {prizeAmount} $DINNER
              </div>
            </div>
          </motion.div>
          
          <motion.div 
            className="flex justify-center"
            initial={{ y: -16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.85 }}
          >
            <Button
              onClick={handlePlayAgain}
              className="bg-yellow-500 hover:bg-yellow-400 text-black font-bold py-2.5 px-6 rounded-lg text-base flex items-center"
            >
              Play Again <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </motion.div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
