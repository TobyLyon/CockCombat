"use client"

import { useRef } from "react"
import { useFrame } from "@react-three/fiber"
import { useChickens } from "@/hooks/use-chickens"
import { usePlayerControls } from "@/hooks/use-player-controls"
import ChickenModel from "./chicken-model"
import FriedChicken from "./fried-chicken"

export default function Arena({ gameState }) {
  const arenaSize = 50
  const gridRef = useRef()
  const { chickens, updateChickens, peckAction } = useChickens(gameState)
  const { moveDirection, isPecking } = usePlayerControls()

  // Update player movement and AI movement
  useFrame((state, delta) => {
    if (gameState !== "playing") return

    // Update player and AI chickens
    updateChickens(moveDirection, isPecking, delta)
  })

  return (
    <group>
      {/* Arena floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]} receiveShadow>
        <planeGeometry args={[arenaSize, arenaSize]} />
        <meshStandardMaterial color="#111" />
      </mesh>

      {/* Grid lines */}
      <gridHelper ref={gridRef} args={[arenaSize, arenaSize, "#444", "#222"]} position={[0, 0, 0]} />

      {/* Arena boundary */}
      <mesh position={[0, 1, 0]}>
        <boxGeometry args={[arenaSize, 2, arenaSize]} />
        <meshStandardMaterial color="#222" wireframe={true} />
      </mesh>

      {/* Lighting effects for the arena */}
      <pointLight position={[0, 10, 0]} intensity={0.8} color="#ff9900" />

      {/* Render all chickens */}
      {chickens.map((chicken) =>
        chicken.health > 0 ? (
          <ChickenModel
            key={chicken.id}
            position={chicken.position}
            rotation={chicken.rotation}
            health={chicken.health}
            isPlayer={chicken.isPlayer}
            isPecking={chicken.isPecking}
          />
        ) : (
          <FriedChicken key={`fried-${chicken.id}`} position={chicken.position} />
        ),
      )}
    </group>
  )
}
