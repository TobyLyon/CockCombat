"use client"

import { useRef, useState, useEffect, Suspense } from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { OrbitControls, useTexture, Html } from "@react-three/drei"
import * as THREE from "three"
import { motion } from "framer-motion"
import { useGLTF } from "@react-three/drei"

// Arena floor component with new textures
function ArenaFloor() {
  const [texturesLoaded, setTexturesLoaded] = useState(false)
  
  // Use try/catch to handle texture loading errors
  try {
    const sandTextures = useTexture({
      map: "/textures/textures/sandy_gravel_02_diff_4k.jpg",
      normalMap: "/textures/textures/sandy_gravel_02_nor_gl_4k.exr",
      roughnessMap: "/textures/textures/sandy_gravel_02_rough_4k.exr",
      displacementMap: "/textures/textures/sandy_gravel_02_disp_4k.png",
    })
    
    // Apply texture settings for better quality
    Object.values(sandTextures).forEach(texture => {
      if (texture) {
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping
        texture.repeat.set(4, 4)
      }
    })

    // Reduce displacement impact
    if (sandTextures.displacementMap) {
      sandTextures.displacementMap.offset = new THREE.Vector2(0, 0)
    }

  useEffect(() => {
      setTexturesLoaded(true)
  }, [])

    return (
      <mesh position={[0, -0.5, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[20, 20, 100, 100]} />
        <meshStandardMaterial 
          {...sandTextures} 
          color="#D2B48C" 
          metalness={0.1} 
          roughness={0.8}
          displacementScale={0.2}
        />
      </mesh>
    )
  } catch (error) {
    console.error("Error loading textures:", error)
    
    // Fallback to basic material if textures fail to load
    return (
      <mesh position={[0, -0.5, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial color="#D2B48C" />
        {!texturesLoaded && (
          <Html position={[0, 0, 1]}>
            <div className="bg-black text-white p-2 rounded">Texture loading failed</div>
          </Html>
        )}
      </mesh>
    )
  }
}

// Wall component with rock textures
function ArenaWalls() {
  try {
    const rockTextures = useTexture({
      map: "/textures/textures/coast_sand_rocks_02_diff_4k.jpg",
      normalMap: "/textures/textures/coast_sand_rocks_02_nor_gl_4k.exr",
      roughnessMap: "/textures/textures/coast_sand_rocks_02_rough_4k.exr",
      displacementMap: "/textures/textures/coast_sand_rocks_02_disp_4k.png",
    })
    
    // Apply texture settings for better quality
    Object.values(rockTextures).forEach(texture => {
      if (texture) {
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping
        texture.repeat.set(2, 1)
      }
    })

    const walls = [
      { position: [0, 1, -10], rotation: [0, 0, 0], scale: [20, 3, 1] },
      { position: [0, 1, 10], rotation: [0, 0, 0], scale: [20, 3, 1] },
      { position: [-10, 1, 0], rotation: [0, Math.PI / 2, 0], scale: [20, 3, 1] },
      { position: [10, 1, 0], rotation: [0, Math.PI / 2, 0], scale: [20, 3, 1] },
    ]

  return (
      <>
        {walls.map((wall, index) => (
          <mesh
            key={index}
            position={wall.position}
            rotation={wall.rotation}
            castShadow
            receiveShadow
          >
            <boxGeometry args={wall.scale} />
            <meshStandardMaterial 
              {...rockTextures} 
              color="#8B4513" 
              roughness={1} 
              displacementScale={0.5}
            />
          </mesh>
        ))}
      </>
    )
  } catch (error) {
    console.error("Error loading wall textures:", error)
    
    // Fallback to basic walls if textures fail to load
    const walls = [
      { position: [0, 1, -10], rotation: [0, 0, 0], scale: [20, 3, 1] },
      { position: [0, 1, 10], rotation: [0, 0, 0], scale: [20, 3, 1] },
      { position: [-10, 1, 0], rotation: [0, Math.PI / 2, 0], scale: [20, 3, 1] },
      { position: [10, 1, 0], rotation: [0, Math.PI / 2, 0], scale: [20, 3, 1] },
    ]
    
    return (
      <>
        {walls.map((wall, index) => (
          <mesh
            key={index}
            position={wall.position}
            rotation={wall.rotation}
            castShadow
            receiveShadow
          >
            <boxGeometry args={wall.scale} />
            <meshStandardMaterial color="#8B4513" roughness={1} />
          </mesh>
        ))}
      </>
    )
  }
}

// CircularChickens component for showing chickens in a circle
function CircularChickens({ count = 8 }) {
  const groupRef = useRef()
  
  // Calculate chicken positions in a circle
  const chickens = Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2
    const radius = 6
    const x = Math.cos(angle) * radius
    const z = Math.sin(angle) * radius
    
    // Different colors for variety
    const colors = ["#f97316", "#ef4444", "#3b82f6", "#22c55e", "#eab308", "#8b5cf6"]
    
    return {
      position: [x, 0, z],
      rotation: [0, -angle + Math.PI, 0], // Face the center
      color: colors[i % colors.length]
    }
  })
  
  // Simple animation for the chickens
  useFrame(({ clock }) => {
    if (groupRef.current) {
      // Rotate the entire chicken circle slowly
      groupRef.current.rotation.y = clock.getElapsedTime() * 0.05
      
      // Animate individual chickens
      groupRef.current.children.forEach((chicken, i) => {
        // Make chickens bob up and down
        chicken.position.y = Math.sin(clock.getElapsedTime() * 2 + i) * 0.1 + 0.5
      })
    }
  })

  return (
    <group ref={groupRef}>
      {chickens.map((chicken, i) => (
        <ChickenModel key={i} position={chicken.position} rotation={chicken.rotation} color={chicken.color} />
      ))}
    </group>
  )
}

// Simple chicken model
function ChickenModel({ position, rotation, color }) {
  return (
    <group position={position} rotation={rotation}>
      {/* Body */}
      <mesh castShadow position={[0, 0.6, 0]}>
        <boxGeometry args={[0.8, 0.8, 1.2]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>

      {/* Head */}
      <mesh castShadow position={[0, 1.2, 0.4]}>
        <boxGeometry args={[0.6, 0.6, 0.6]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>

      {/* Beak */}
      <mesh castShadow position={[0, 1.2, 0.8]}>
        <coneGeometry args={[0.1, 0.3, 4]} />
        <meshStandardMaterial color="#fbbf24" roughness={0.5} />
      </mesh>

      {/* Comb */}
      <mesh castShadow position={[0, 1.5, 0.4]}>
        <boxGeometry args={[0.1, 0.2, 0.4]} />
        <meshStandardMaterial color="#ef4444" roughness={0.8} />
      </mesh>

      {/* Legs */}
      <mesh castShadow position={[-0.3, 0, 0]}>
        <boxGeometry args={[0.1, 0.6, 0.1]} />
        <meshStandardMaterial color="#fbbf24" roughness={0.5} />
      </mesh>
      <mesh castShadow position={[0.3, 0, 0]}>
        <boxGeometry args={[0.1, 0.6, 0.1]} />
        <meshStandardMaterial color="#fbbf24" roughness={0.5} />
      </mesh>
    </group>
  )
}

// Add simple lighting setup
function ArenaLighting() {
  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight
        position={[10, 10, 5]} 
        intensity={1}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-15}
        shadow-camera-right={15}
        shadow-camera-top={15}
        shadow-camera-bottom={-15}
      />
      <hemisphereLight args={["#3a8c4f", "#3a8c4f", 0.3]} />
      
      {/* Add point lights around the arena for better visibility */}
      <pointLight position={[0, 5, 0]} intensity={0.5} />
      <pointLight position={[8, 2, 8]} intensity={0.3} color="#ffd700" />
      <pointLight position={[-8, 2, -8]} intensity={0.3} color="#ff8c00" />
    </>
  )
}

// Define an interface for the gameState prop
interface ArenaViewerProps {
  gameState?: any; // Replace with a more specific type when available
}

export default function ArenaViewer({ gameState }: ArenaViewerProps) {
  const [showInstructions, setShowInstructions] = useState(true)

  useEffect(() => {
    // Hide instructions after 5 seconds
    const timer = setTimeout(() => {
      setShowInstructions(false)
    }, 5000)

    return () => clearTimeout(timer)
  }, [])

  // Log gameState for debugging
  useEffect(() => {
    if (gameState) {
      console.log("ArenaViewer received gameState:", gameState);
    }
  }, [gameState]);

  return (
    <div className="relative h-full w-full">
      {/* Canvas with shadows enabled */}
      <Canvas shadows className="h-full w-full">
        <Suspense fallback={<Html><div className="text-white">Loading arena...</div></Html>}>
          {/* Scene content */}
          <ArenaFloor />
          <ArenaWalls />
          <ArenaLighting />
          
          {/* If we have gameState with chickens, render those instead of placeholder chickens */}
          {gameState?.player1 && gameState?.player2 ? (
            // Render actual game state chickens/players
            <group>
              {/* TODO: Replace with actual players from gameState when format is known */}
              <ChickenModel 
                position={gameState.player1.position || [3, 0, 3]} 
                rotation={gameState.player1.rotation || [0, 0, 0]} 
                color={gameState.player1.color || "#f97316"} 
              />
              <ChickenModel 
                position={gameState.player2.position || [-3, 0, -3]} 
                rotation={gameState.player2.rotation || [0, Math.PI, 0]} 
                color={gameState.player2.color || "#3b82f6"} 
              />
            </group>
          ) : (
            // Render placeholder circle of chickens if no game state
            <CircularChickens />
          )}
          
          <OrbitControls 
            enablePan={false}
            enableZoom={true}
            minDistance={5}
            maxDistance={20}
            minPolarAngle={Math.PI / 6}
            maxPolarAngle={Math.PI / 2}
          />
        </Suspense>
      </Canvas>
      
      {/* Instructions */}
      {showInstructions && (
        <motion.div 
          className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black/70 text-white px-4 py-3 rounded-lg text-sm"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
        >
          <p>Drag to rotate • Scroll to zoom</p>
        </motion.div>
      )}
      
      {/* Optional: Add a "Live" badge for spectator view */}
      <div className="absolute top-4 left-4 bg-red-600 text-white px-3 py-1 rounded-full flex items-center">
        <span className="h-2 w-2 bg-white rounded-full animate-pulse mr-2"></span>
        <span className="font-medium text-sm">LIVE</span>
      </div>
    </div>
  )
}
