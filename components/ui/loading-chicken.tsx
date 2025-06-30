"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"

interface LoadingChickenProps {
  size?: "sm" | "md" | "lg"
  text?: string
  textColor?: string
}

export default function LoadingChicken({ 
  size = "md", 
  text = "Loading...",
  textColor = "text-yellow-400"
}: LoadingChickenProps) {
  const [frame, setFrame] = useState(0)
  
  // Size classes based on prop
  const sizeClasses = {
    sm: "w-8 h-8",
    md: "w-12 h-12",
    lg: "w-16 h-16"
  }
  
  // Animation frames for the chicken running
  const frames = [
    // Frame 1: Legs apart
    <>
      <div className="absolute bottom-0 left-1/4 w-1/6 h-1/3 bg-yellow-600"></div>
      <div className="absolute bottom-0 right-1/4 w-1/6 h-1/3 bg-yellow-600"></div>
    </>,
    // Frame 2: Legs together
    <>
      <div className="absolute bottom-0 left-1/3 w-1/6 h-1/4 bg-yellow-600"></div>
      <div className="absolute bottom-0 right-1/3 w-1/6 h-1/4 bg-yellow-600"></div>
    </>,
    // Frame 3: Legs apart (opposite of frame 1)
    <>
      <div className="absolute bottom-0 left-1/4 w-1/6 h-1/4 bg-yellow-600"></div>
      <div className="absolute bottom-0 right-1/4 w-1/6 h-1/3 bg-yellow-600"></div>
    </>,
    // Frame 4: Legs together (same as frame 2)
    <>
      <div className="absolute bottom-0 left-1/3 w-1/6 h-1/4 bg-yellow-600"></div>
      <div className="absolute bottom-0 right-1/3 w-1/6 h-1/4 bg-yellow-600"></div>
    </>
  ]
  
  // Cycle through animation frames
  useEffect(() => {
    const interval = setInterval(() => {
      setFrame((prevFrame) => (prevFrame + 1) % frames.length)
    }, 150) // 150ms per frame for a fast running animation
    
    return () => clearInterval(interval)
  }, [])
  
  return (
    <div className="flex flex-col items-center justify-center">
      <motion.div 
        className={`relative ${sizeClasses[size]} mb-2`}
        animate={{ y: [0, -2, 0] }}
        transition={{ repeat: Infinity, duration: 0.3 }}
      >
        {/* Chicken body */}
        <div className="absolute inset-0 bottom-1/4 bg-yellow-400 rounded-t-full"></div>
        
        {/* Chicken head */}
        <div className="absolute top-0 left-1/4 w-1/2 h-1/3 bg-yellow-400 rounded-full">
          {/* Chicken eye */}
          <div className="absolute top-1/3 left-1/4 w-1/4 h-1/4 bg-black rounded-full"></div>
          {/* Chicken beak */}
          <div className="absolute top-1/2 left-0 w-1/3 h-1/4 bg-orange-500"></div>
          {/* Chicken comb */}
          <div className="absolute top-0 right-1/4 w-1/4 h-1/3 bg-red-500"></div>
        </div>
        
        {/* Chicken legs - animated */}
        {frames[frame]}
      </motion.div>
      
      {/* Loading text */}
      {text && (
        <p className={`pixel-font ${textColor} text-center`}>{text}</p>
      )}
    </div>
  )
}
