"use client"

import { useRef, useEffect } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import { useChickens } from "@/hooks/use-chickens"
import ChickenModel from "./chicken-model"
import FriedChicken from "./fried-chicken"
import * as THREE from "three"
import { Player } from '@/hooks/use-battle-state'
import { Box, Plane } from '@react-three/drei'

export default function BattleArenaScene({ player }: { player: Player }) {
  const arenaSize = 50
  const gridRef = useRef()
  const { chickens } = useChickens(player.gameState)
  const { scene } = useThree()

  const groundColor = '#87CEEB'
  const chickenColor = player.isAi ? 'hotpink' : 'orange'

  // Set up arena lighting and environment
  useEffect(() => {
    // Add arena fog for atmosphere
    scene.fog = new THREE.Fog(0x111111, 30, 60)

    // Set background color
    scene.background = new THREE.Color(0x111111)

    return () => {
      scene.fog = null
    }
  }, [scene])

  // Update grid position to follow player with null check
  useFrame(() => {
    if (gridRef.current && player.position) {
      gridRef.current.position.x = Math.floor(player.position.x / 10) * 10
      gridRef.current.position.z = Math.floor(player.position.z / 10) * 10
    }
  })

  return (
    <group>
      {/* Arena floor */}
      <Plane args={[100, 100]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <meshStandardMaterial color={groundColor} />
      </Plane>

      {/* Grid lines */}
      <gridHelper ref={gridRef} args={[arenaSize, arenaSize, "#444", "#222"]} position={[0, 0, 0]} />

      {/* Arena boundary */}
      <mesh position={[0, 1, 0]}>
        <boxGeometry args={[arenaSize, 2, arenaSize]} />
        <meshStandardMaterial color="#222" wireframe={true} />
      </mesh>

      {/* Arena lighting */}
      <spotLight position={[0, 20, 0]} intensity={0.8} castShadow angle={0.5} penumbra={0.5} />
      <pointLight position={[10, 10, 10]} intensity={0.5} color="#ff9900" />
      <pointLight position={[-10, 10, -10]} intensity={0.5} color="#ff9900" />

      {/* Arena decorations */}
      <ArenaDecorations />

      {/* Render all chickens */}
      {chickens &&
        chickens.map((chicken) =>
          chicken && chicken.health > 0 ? (
            <ChickenModel
              key={chicken.id}
              position={chicken.position}
              rotation={chicken.rotation}
              health={chicken.health}
              isPlayer={chicken.isPlayer}
              isPecking={chicken.isPecking}
              color={chicken.color}
            />
          ) : chicken ? (
            <FriedChicken key={`fried-${chicken.id}`} position={chicken.position} fadeOut={chicken.fadeOut} />
          ) : null,
        )}

      <ChickenModel position={player.position} color={chickenColor} />
    </group>
  )
}

function ArenaDecorations() {
  // Add some decorative elements to the arena
  return (
    <group>
      {/* Corner pillars */}
      {[
        [20, 0, 20],
        [20, 0, -20],
        [-20, 0, 20],
        [-20, 0, -20],
      ].map((pos, i) => (
        <mesh key={i} position={pos} castShadow>
          <cylinderGeometry args={[1, 1, 5, 8]} />
          <meshStandardMaterial color="#333" />
        </mesh>
      ))}

      {/* Center platform */}
      <mesh position={[0, -0.05, 0]} receiveShadow>
        <cylinderGeometry args={[5, 5, 0.1, 32]} />
        <meshStandardMaterial color="#222" />
      </mesh>

      {/* Scattered obstacles */}
      {Array.from({ length: 10 }).map((_, i) => {
        const angle = (i / 10) * Math.PI * 2
        const radius = 10 + Math.random() * 10
        const x = Math.cos(angle) * radius
        const z = Math.sin(angle) * radius
        const height = 0.5 + Math.random() * 1.5

        return (
          <mesh key={`obstacle-${i}`} position={[x, height / 2, z]} castShadow>
            <boxGeometry args={[1.5, height, 1.5]} />
            <meshStandardMaterial color="#333" />
          </mesh>
        )
      })}
    </group>
  )
}
