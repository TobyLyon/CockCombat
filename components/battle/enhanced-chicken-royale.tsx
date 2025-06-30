import { useState, useRef, Suspense, useEffect } from "react"
import * as THREE from "three"
import { Canvas } from "@react-three/fiber"
import { Html } from "@react-three/drei"
import { motion } from "framer-motion"
import EnhancedArenaScene from "./enhanced-arena-scene"
import GameUI from "./game-ui"
import { usePlayerControls } from "@/hooks/use-player-controls"

// Define default chicken data for development mode
const defaultChickenData = {
  id: 'dev-chicken',
  name: 'Dev Chicken',
  tokenId: '0',
  attributes: {
    body: 'default',
    head: 'default',
    eyes: 'default',
    mouth: 'default',
    feet: 'default',
    wings: 'default',
    tail: 'default',
    comb: 'default',
  },
  colors: {
    body: '#e63946',
    beak: '#ffb703',
    comb: '#e63946',
    legs: '#ffb703',
    tail: '#e63946',
    eyes: '#ffffff',
    pupils: '#000000'
  },
  level: 1,
};

export default function EnhancedChickenRoyale({ onExit, playerChicken = defaultChickenData }: { onExit: () => void, playerChicken?: any }) {
  // Game state
  const [gameState, setGameState] = useState("playing") // playing, gameover
  const [playerPosition, setPlayerPosition] = useState(new THREE.Vector3(0, 2.0, 0))
  const [playerRotation, setPlayerRotation] = useState(new THREE.Euler(0, 0, 0))
  const [playerHealth, setPlayerHealth] = useState(100)
  const [remainingPlayers, setRemainingPlayers] = useState(15)
  const [timeRemaining, setTimeRemaining] = useState(300) // 5 minutes in seconds
  const [isJumping, setIsJumping] = useState(false)
  const [isPecking, setIsPecking] = useState(false)
  
  // Create refs for player movement and physics
  const playerPositionRef = useRef(new THREE.Vector3(0, 2.0, 0));
  const playerRotationRef = useRef(new THREE.Euler(0, 0, 0));
  const playerVelocityRef = useRef(new THREE.Vector3(0, 0, 0));
  const lastUpdateTimeRef = useRef(Date.now());
  
  // Get player controls
  const { moveDirection, rotationAngle, isPecking: controlIsPecking, isSprinting, isJumping: controlIsJumping } = usePlayerControls();
  
  // Track last peck state to detect new peck actions
  const lastPeckState = useRef(false);
  
  // Update player position and rotation based on controls with physics
  useEffect(() => {
    if (gameState !== "playing") return;
    
    // Set initial values to match state
    playerPositionRef.current.copy(playerPosition);
    playerRotationRef.current.copy(playerRotation);
    
    let frameId: number;
    
    const updatePhysics = () => {
      // Calculate delta time for frame-rate independent movement
      const now = Date.now();
      const deltaTime = Math.min((now - lastUpdateTimeRef.current) / 1000, 0.1); // Cap at 0.1 to prevent large jumps
      lastUpdateTimeRef.current = now;
      
      // Maximum movement speed based on sprint state - INCREASED SPEED
      const maxSpeed = isSprinting ? 12.0 : 8.0; // Doubled from 6.0/3.0
      
      // Update animation states
      setIsJumping(controlIsJumping);
      
      // Handle pecking - only trigger on the rising edge of the peck input
      if (controlIsPecking && !lastPeckState.current) {
        setIsPecking(true);
        // Reset peck after a short delay
        setTimeout(() => {
          setIsPecking(false);
        }, 200); // Short duration for a quick peck
      }
      lastPeckState.current = controlIsPecking;
      
      // Handle jumping physics
      if (controlIsJumping && playerPositionRef.current.y <= 2.0) {
        // Apply upward force when jumping and on/near ground
        playerVelocityRef.current.y = 8.0; // Jump force
      }
      
      // Apply gravity
      playerVelocityRef.current.y -= 15.0 * deltaTime; // Gravity
      
      // Apply vertical movement
      playerPositionRef.current.y += playerVelocityRef.current.y * deltaTime;
      
      // Ground collision
      if (playerPositionRef.current.y < 2.0) {
        playerPositionRef.current.y = 2.0; // Ground level
        playerVelocityRef.current.y = 0;
      }
      
      // Apply movement forces
      if (moveDirection.z !== 0) {
        // Manual calculation of movement direction based on rotation angle
        const angle = playerRotationRef.current.y;
        const moveVector = new THREE.Vector3(
          -Math.sin(angle) * moveDirection.z * maxSpeed, 
          0,
          -Math.cos(angle) * moveDirection.z * maxSpeed
        );
        
        // Smoothly interpolate velocity toward target (acceleration)
        playerVelocityRef.current.x += (moveVector.x - playerVelocityRef.current.x) * 10 * deltaTime; // Increased from 5 to 10
        playerVelocityRef.current.z += (moveVector.z - playerVelocityRef.current.z) * 10 * deltaTime; // Increased from 5 to 10
      } else {
        // Apply friction when not actively moving (deceleration)
        playerVelocityRef.current.x *= 0.8; // Increased from 0.9 to 0.8 for faster stopping
        playerVelocityRef.current.z *= 0.8;
        
        // Stop completely if moving very slowly
        if (playerVelocityRef.current.length() < 0.01) {
          playerVelocityRef.current.set(0, 0, 0);
        }
      }
      
      // Apply velocity to position
      playerPositionRef.current.x += playerVelocityRef.current.x * deltaTime;
      playerPositionRef.current.z += playerVelocityRef.current.z * deltaTime;
      
      // SNAPPY ROTATION - Immediately set rotation instead of lerping
      playerRotationRef.current.y = rotationAngle;
      
      // Keep player within arena bounds
      const maxBounds = 25;
      if (Math.abs(playerPositionRef.current.x) > maxBounds) {
        playerPositionRef.current.x = Math.sign(playerPositionRef.current.x) * maxBounds;
        playerVelocityRef.current.x = 0; // Stop horizontal velocity when hitting bound
      }
      
      if (Math.abs(playerPositionRef.current.z) > maxBounds) {
        playerPositionRef.current.z = Math.sign(playerPositionRef.current.z) * maxBounds;
        playerVelocityRef.current.z = 0; // Stop vertical velocity when hitting bound
      }
      
      // Update state with new position and rotation
      setPlayerPosition(playerPositionRef.current.clone());
      setPlayerRotation(playerRotationRef.current.clone());
      
      // Continue animation loop
      frameId = requestAnimationFrame(updatePhysics);
    };
    
    // Start animation loop
    frameId = requestAnimationFrame(updatePhysics);
    
    // Clean up
    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [gameState, moveDirection, rotationAngle, isSprinting, playerPosition, playerRotation]);
  
  // Ensure the chicken has all required color properties
  const chickenToRender = {
    ...playerChicken,
    colors: {
      body: playerChicken?.colors?.body || '#e63946',
      beak: playerChicken?.colors?.mouth || '#ffb703',
      comb: playerChicken?.colors?.comb || '#e63946',
      legs: playerChicken?.colors?.feet || '#ffb703',
      tail: playerChicken?.colors?.tail || '#e63946',
      eyes: '#ffffff',
      pupils: '#000000'
    }
  }
  
  // Game timer
  useEffect(() => {
    if (gameState === "playing") {
      const timer = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 0) {
            clearInterval(timer)
            setGameState("gameover")
            return 0
          }
          return prev - 1
        })
      }, 1000)
      
      return () => clearInterval(timer)
    }
  }, [gameState])
  
  // Handle game over
  useEffect(() => {
    if (gameState === "gameover") {
      const timer = setTimeout(() => {
        onExit()
      }, 5000)
      
      return () => clearTimeout(timer)
    }
  }, [gameState, onExit])
  
  // Handle player being defeated
  useEffect(() => {
    if (playerHealth <= 0 && gameState === "playing") {
      setGameState("gameover")
    }
  }, [playerHealth, gameState])
  
  // Simulate other players being defeated over time
  useEffect(() => {
    if (gameState === "playing" && remainingPlayers > 1) {
      const interval = setInterval(() => {
        // Random chance for a player to be defeated
        if (Math.random() < 0.2) {
          setRemainingPlayers(prev => Math.max(1, prev - 1))
        }
      }, 10000) // Check every 10 seconds
      
      return () => clearInterval(interval)
    }
  }, [gameState, remainingPlayers])
  
  return (
    <div className="relative w-full h-full">
      <div className="w-full h-full">
        <Canvas 
          style={{ width: '100%', height: '100%' }}
          shadows
          camera={{ fov: 75, near: 0.1, far: 50000 }} // Increased far clipping plane
        >
          <color attach="background" args={['#87CEEB']} /> {/* Sky Blue - more vibrant */}
          <fog attach="fog" args={['#87CEEB', 30, 500]} /> {/* Add fog with same color as background */}
          <Suspense fallback={<Html center>Loading Arena...</Html>}>
            {/* Use the enhanced arena scene with all our improvements */}
            <EnhancedArenaScene
              gameState={gameState}
              playerPosition={playerPosition}
              playerRotation={playerRotation}
              playerChicken={chickenToRender}
              isJumping={isJumping}
              isPecking={isPecking}
            />
          </Suspense>
        </Canvas>
        
        {/* Game UI Overlay */}
        <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
          <GameUI
            gameState={gameState}
            health={playerHealth}
            remaining={remainingPlayers}
            time={timeRemaining}
            prize={0} // Default value for now
            peckCooldown={0} // Default value for now
            isWinner={gameState === "gameover" && remainingPlayers === 1}
            onExit={onExit}
          />
        </div>
        
        {/* Controls Help */}
        <div className="absolute bottom-4 left-4 text-white bg-black bg-opacity-50 p-2 rounded">
          <p>W: Move forward</p>
          <p>A/D: Rotate left/right</p>
          <p>Space: Peck (attack)</p>
          <p>Shift: Sprint</p>
        </div>
      </div>
    </div>
  );
}
