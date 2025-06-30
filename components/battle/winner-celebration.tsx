"use client"

import React, { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { useGameState } from "@/contexts/GameStateContext"
import { Trophy, Coins, ArrowRight } from "lucide-react"
import confetti from "canvas-confetti"
import Image from "next/image"

export default function WinnerCelebration() {
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
    returnToMainMenu()
  }
  
  return (
    <AnimatePresence>
      <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/80">
        <motion.div 
          className="bg-gradient-to-b from-yellow-900 to-yellow-700 p-8 rounded-xl shadow-2xl max-w-2xl w-full mx-4 border-4 border-yellow-500"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", duration: 0.5 }}
        >
          <motion.div 
            className="flex justify-center mb-6"
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <Trophy className="text-yellow-300 h-24 w-24" />
          </motion.div>
          
          <motion.h1 
            className="text-4xl font-bold text-center text-yellow-300 mb-4 pixel-font"
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            VICTORY!
          </motion.h1>
          
          <motion.div 
            className="text-center text-white mb-8"
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.7 }}
          >
            <p className="text-xl mb-2">Your chicken is the last one standing!</p>
            <p className="text-lg">You've defeated all opponents in the arena.</p>
          </motion.div>
          
          <motion.div 
            className="bg-yellow-800 p-6 rounded-lg mb-8 border-2 border-yellow-600"
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.9 }}
          >
            <h2 className="text-2xl font-bold text-center text-yellow-300 mb-4 flex items-center justify-center">
              <Coins className="mr-2 h-6 w-6" />
              Your Winnings
            </h2>
            
            <div className="flex items-center justify-center gap-4">
              <div className="relative h-12 w-12">
                <Image 
                  src="/images/cock-token.png" 
                  alt="COCK Token" 
                  width={48} 
                  height={48}
                  className="object-contain"
                />
              </div>
              <div className="text-4xl font-bold text-yellow-300 pixel-font">
                {prizeAmount} $COCK
              </div>
            </div>
          </motion.div>
          
          <motion.div 
            className="flex justify-center"
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 1.1 }}
          >
            <Button
              onClick={handlePlayAgain}
              className="bg-yellow-500 hover:bg-yellow-400 text-black font-bold py-3 px-8 rounded-lg text-lg flex items-center"
            >
              Play Again <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </motion.div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
