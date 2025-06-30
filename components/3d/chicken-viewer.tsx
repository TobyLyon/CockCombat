"use client"

import { useRef, useEffect, useState } from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { OrbitControls, PerspectiveCamera, Environment } from "@react-three/drei"
import { motion } from "framer-motion"

// Main 3D viewer component
export default function ChickenViewer() {
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Simulate loading time for 3D assets
    const timer = setTimeout(() => {
      setIsLoading(false)
    }, 2000)

    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="w-full h-full relative">
      {isLoading ? (
        <div className="absolute inset-0 flex items-center justify-center bg-purple-900/50 backdrop-blur-sm">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-t-yellow-400 border-r-yellow-400 border-b-transparent border-l-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-purple-200">Loading 3D Chickens...</p>
          </div>
        </div>
      ) : (
        <motion.div
          className="w-full h-full"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1 }}
        >
          <Canvas shadows>
            <PerspectiveCamera makeDefault position={[0, 1, 5]} fov={50} />
            <ambientLight intensity={0.5} />
            <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={1} castShadow />
            <pointLight position={[-10, -10, -10]} intensity={0.5} />

            <Environment preset="sunset" />

            <VoxelChicken position={[0, 0, 0]} rotation={[0, Math.PI / 4, 0]} />

            <OrbitControls
              enablePan={false}
              enableZoom={false}
              minPolarAngle={Math.PI / 3}
              maxPolarAngle={Math.PI / 2}
              autoRotate
              autoRotateSpeed={1}
            />

            <Arena />
          </Canvas>
        </motion.div>
      )}
    </div>
  )
}

// Voxel chicken model
function VoxelChicken({ position, rotation }) {
  const chickenRef = useRef()
  const { clock } = useThree()

  // Animate the chicken
  useFrame(() => {
    if (chickenRef.current) {
      // Bobbing motion
      chickenRef.current.position.y = Math.sin(clock.getElapsedTime() * 2) * 0.1 + 0.1

      // Slight rotation
      chickenRef.current.rotation.y = Math.sin(clock.getElapsedTime() * 0.5) * 0.2 + rotation[1]
    }
  })

  return (
    <group position={position} ref={chickenRef}>
      {/* Body */}
      <mesh castShadow position={[0, 0.6, 0]}>
        <boxGeometry args={[1, 1, 1.5]} />
        <meshStandardMaterial color="#f97316" roughness={0.7} metalness={0.1} />
      </mesh>

      {/* Head */}
      <mesh castShadow position={[0, 1.3, 0.5]}>
        <boxGeometry args={[0.8, 0.8, 0.8]} />
        <meshStandardMaterial color="#f97316" roughness={0.7} metalness={0.1} />
      </mesh>

      {/* Comb */}
      <mesh castShadow position={[0, 1.8, 0.5]}>
        <boxGeometry args={[0.2, 0.3, 0.6]} />
        <meshStandardMaterial color="#ef4444" roughness={0.7} metalness={0.1} />
      </mesh>

      {/* Beak */}
      <mesh castShadow position={[0, 1.3, 1]}>
        <coneGeometry args={[0.2, 0.4, 4]} rotation={[Math.PI / 2, 0, 0]} />
        <meshStandardMaterial color="#fbbf24" roughness={0.7} metalness={0.1} />
      </mesh>

      {/* Eyes */}
      <mesh position={[0.25, 1.4, 0.8]}>
        <sphereGeometry args={[0.1, 16, 16]} />
        <meshStandardMaterial color="black" />
      </mesh>
      <mesh position={[-0.25, 1.4, 0.8]}>
        <sphereGeometry args={[0.1, 16, 16]} />
        <meshStandardMaterial color="black" />
      </mesh>

      {/* Legs */}
      <mesh castShadow position={[0.3, -0.2, 0]}>
        <boxGeometry args={[0.15, 0.8, 0.15]} />
        <meshStandardMaterial color="#fbbf24" roughness={0.7} metalness={0.1} />
      </mesh>
      <mesh castShadow position={[-0.3, -0.2, 0]}>
        <boxGeometry args={[0.15, 0.8, 0.15]} />
        <meshStandardMaterial color="#fbbf24" roughness={0.7} metalness={0.1} />
      </mesh>

      {/* Feet */}
      <mesh castShadow position={[0.3, -0.6, 0.2]}>
        <boxGeometry args={[0.25, 0.1, 0.4]} />
        <meshStandardMaterial color="#fbbf24" roughness={0.7} metalness={0.1} />
      </mesh>
      <mesh castShadow position={[-0.3, -0.6, 0.2]}>
        <boxGeometry args={[0.25, 0.1, 0.4]} />
        <meshStandardMaterial color="#fbbf24" roughness={0.7} metalness={0.1} />
      </mesh>

      {/* Tail feathers */}
      <mesh castShadow position={[0, 0.7, -0.8]} rotation={[0.4, 0, 0]}>
        <boxGeometry args={[0.8, 0.4, 0.1]} />
        <meshStandardMaterial color="#f97316" roughness={0.7} metalness={0.1} />
      </mesh>
      <mesh castShadow position={[0.3, 0.8, -0.7]} rotation={[0.4, 0.2, 0]}>
        <boxGeometry args={[0.3, 0.4, 0.1]} />
        <meshStandardMaterial color="#f97316" roughness={0.7} metalness={0.1} />
      </mesh>
      <mesh castShadow position={[-0.3, 0.8, -0.7]} rotation={[0.4, -0.2, 0]}>
        <boxGeometry args={[0.3, 0.4, 0.1]} />
        <meshStandardMaterial color="#f97316" roughness={0.7} metalness={0.1} />
      </mesh>

      {/* Wings */}
      <mesh castShadow position={[0.6, 0.6, 0]} rotation={[0, 0, -0.2]}>
        <boxGeometry args={[0.1, 0.8, 1]} />
        <meshStandardMaterial color="#ea580c" roughness={0.7} metalness={0.1} />
      </mesh>
      <mesh castShadow position={[-0.6, 0.6, 0]} rotation={[0, 0, 0.2]}>
        <boxGeometry args={[0.1, 0.8, 1]} />
        <meshStandardMaterial color="#ea580c" roughness={0.7} metalness={0.1} />
      </mesh>
    </group>
  )
}

// Arena platform
function Arena() {
  return (
    <group>
      {/* Platform */}
      <mesh receiveShadow position={[0, -0.7, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[3, 3, 0.1, 32]} />
        <meshStandardMaterial color="#581c87" roughness={0.8} metalness={0.2} />
      </mesh>

      {/* Platform edge */}
      <mesh position={[0, -0.75, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[3, 0.1, 16, 100]} />
        <meshStandardMaterial color="#7e22ce" emissive="#7e22ce" emissiveIntensity={0.5} />
      </mesh>

      {/* Decorative elements */}
      {Array.from({ length: 8 }).map((_, i) => {
        const angle = (i / 8) * Math.PI * 2
        const x = Math.cos(angle) * 3
        const z = Math.sin(angle) * 3
        return (
          <mesh key={i} position={[x, -0.65, z]} rotation={[0, angle, 0]}>
            <boxGeometry args={[0.2, 0.2, 0.2]} />
            <meshStandardMaterial color="#a855f7" emissive="#a855f7" emissiveIntensity={0.5} />
          </mesh>
        )
      })}

      {/* Center spotlight effect */}
      <pointLight position={[0, 2, 0]} intensity={1} color="#a855f7" distance={6} decay={2} />
    </group>
  )
}
