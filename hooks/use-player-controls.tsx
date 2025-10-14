"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useIsomorphicLayoutEffect } from './use-viewport-height'
import * as THREE from "three"

export function usePlayerControls() {
  // Track movement and rotation separately for better control
  const [moveDirection, setMoveDirection] = useState<THREE.Vector3>(() => new THREE.Vector3(0, 0, 0))
  const [rotationAngle, setRotationAngle] = useState<number>(0)
  const [isPecking, setIsPecking] = useState<boolean>(false)
  const [isSprinting, setIsSprinting] = useState<boolean>(false)
  const [mousePeck, setMousePeck] = useState<boolean>(false)
  const mousePeckTimerRef = useRef<number | null>(null)
  
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
    setIsPecking(keys.Space || mousePeck)
    setIsSprinting(sprinting)
  }, [keys, rotationAngle, mousePeck])
  
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
  
  // Touch controls (mobile-only): virtual joystick + two buttons
  const leftTouchId = useRef<number | null>(null)
  const leftOrigin = useRef<{ x: number, y: number } | null>(null)
  const onTouchStart = (e: TouchEvent) => {
    try {
      for (const t of Array.from(e.touches)) {
        const x = t.clientX, y = t.clientY
        const vw = window.innerWidth, vh = window.innerHeight
        // left-bottom quadrant for joystick
        if (x < vw * 0.4 && y > vh * 0.6 && leftTouchId.current === null) {
          leftTouchId.current = t.identifier
          leftOrigin.current = { x, y }
        }
        // right-bottom quadrant for peck/jump
        if (x > vw * 0.6 && y > vh * 0.6) {
          // tap -> peck; long/second touch -> jump
          setMousePeck(true)
          if (mousePeckTimerRef.current) window.clearTimeout(mousePeckTimerRef.current)
          mousePeckTimerRef.current = window.setTimeout(() => setMousePeck(false), 140)
        }
      }
    } catch {}
  }
  const onTouchMove = (e: TouchEvent) => {
    try {
      if (leftTouchId.current === null || !leftOrigin.current) return
      const t = Array.from(e.touches).find(tt => tt.identifier === leftTouchId.current)
      if (!t) return
      const dx = t.clientX - leftOrigin.current.x
      const dy = t.clientY - leftOrigin.current.y
      // Map to forward/back (dy) and turn (dx)
      const dir = new (require('three').Vector3)(0, 0, 0)
      const dead = 8
      if (Math.abs(dy) > dead) dir.z = dy > 0 ? 1 : -1
      setMoveDirection(dir)
      const turnSpeed = 0.015
      setRotationAngle(prev => prev + (Math.abs(dx) > dead ? (dx > 0 ? -turnSpeed : turnSpeed) : 0))
    } catch {}
  }
  const onTouchEnd = (e: TouchEvent) => {
    try {
      if (leftTouchId.current !== null) {
        const ended = Array.from(e.changedTouches).some(tt => tt.identifier === leftTouchId.current)
        if (ended) { leftTouchId.current = null; leftOrigin.current = null; setMoveDirection(new (require('three').Vector3)(0,0,0)) }
      }
    } catch {}
  }

  // Set up key + touch listeners
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      setMousePeck(true)
      if (mousePeckTimerRef.current) window.clearTimeout(mousePeckTimerRef.current)
      mousePeckTimerRef.current = window.setTimeout(() => setMousePeck(false), 140)
    }

    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("keyup", handleKeyUp)
    window.addEventListener("mousedown", onMouseDown)
    // touch
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    
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
      window.removeEventListener("mousedown", onMouseDown)
      cancelAnimationFrame(animationFrameId)
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
      if (mousePeckTimerRef.current) window.clearTimeout(mousePeckTimerRef.current)
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
