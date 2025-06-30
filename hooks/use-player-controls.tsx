"use client"

import { useState, useEffect, useCallback } from "react"
import * as THREE from "three"

export function usePlayerControls() {
  // Track movement and rotation separately for better control
  const [moveDirection, setMoveDirection] = useState<THREE.Vector3>(() => new THREE.Vector3(0, 0, 0))
  const [rotationAngle, setRotationAngle] = useState<number>(0)
  const [isPecking, setIsPecking] = useState<boolean>(false)
  const [isSprinting, setIsSprinting] = useState<boolean>(false)
  
  // Track key states for smoother movement
  const [keys, setKeys] = useState<{
    KeyW: boolean,
    KeyS: boolean,
    KeyA: boolean,
    KeyD: boolean,
    ArrowUp: boolean,
    ArrowDown: boolean,
    ArrowLeft: boolean,
    ArrowRight: boolean,
    Space: boolean,
    ShiftLeft: boolean,
    ShiftRight: boolean,
  }>({
    KeyW: false,
    KeyS: false,
    KeyA: false,
    KeyD: false,
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false,
    Space: false,
    ShiftLeft: false,
    ShiftRight: false,
  })
  
  // Update movement based on current key states
  const updateMovement = useCallback(() => {
    // Create a new Vector3 each time to avoid mutation issues
    const direction = new THREE.Vector3(0, 0, 0)
    
    // COMPLETELY INVERT ALL CONTROLS
    // W/Up = Backward (negative Z), S/Down = Forward (positive Z)
    if (keys.KeyW || keys.ArrowUp) direction.z = -1
    if (keys.KeyS || keys.ArrowDown) direction.z = 1
    
    // Improved rotation handling - make turning more responsive
    const turnSpeed = 0.15;
    let newRotationAngle = rotationAngle
    
    // COMPLETELY INVERT ROTATION
    // A/Left = Turn right (increase angle), D/Right = Turn left (decrease angle)
    if (keys.KeyA || keys.ArrowLeft) newRotationAngle += turnSpeed;
    if (keys.KeyD || keys.ArrowRight) newRotationAngle -= turnSpeed;
    
    // Sprint state
    const sprinting = keys.ShiftLeft || keys.ShiftRight
    
    // Update states
    setMoveDirection(direction)
    setRotationAngle(newRotationAngle)
    setIsPecking(keys.Space)
    setIsSprinting(sprinting)
  }, [keys, rotationAngle])
  
  // Handle key down events
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.code in keys && !e.repeat) {
      setKeys(prevKeys => ({
        ...prevKeys,
        [e.code]: true
      }))
    }
  }, [keys])
  
  // Handle key up events
  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    if (e.code in keys) {
      setKeys(prevKeys => ({
        ...prevKeys,
        [e.code]: false
      }))
    }
  }, [keys])
  
  // Set up key listeners
  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("keyup", handleKeyUp)
    
    // Animation frame for smooth movement updates
    let animationFrameId: number
    
    const updateFrame = () => {
      updateMovement()
      animationFrameId = requestAnimationFrame(updateFrame)
    }
    
    animationFrameId = requestAnimationFrame(updateFrame)
    
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("keyup", handleKeyUp)
      cancelAnimationFrame(animationFrameId)
    }
  }, [handleKeyDown, handleKeyUp, updateMovement])
  
  return { 
    moveDirection, 
    rotationAngle, 
    isPecking, 
    isSprinting,
    isJumping: keys.ShiftLeft || keys.ShiftRight,
    // Add a reset function for when player is hit
    resetControls: () => {
      setMoveDirection(new THREE.Vector3(0, 0, 0))
      setIsPecking(false)
    }
  }
}
