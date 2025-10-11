"use client"

import { Canvas, useFrame } from "@react-three/fiber"
import * as THREE from "three"
import { PixelChicken } from "@/components/3d/pixel-chicken-viewer"
import { useRef, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

// Simple grazing flock at the bottom: idle + occasional peck and short walk
function GrazingFlock() {
  return (
    <group position={[0, 0, 0]}>
      <GrazingChicken position={[-3.5, 0.6, -2.0]} paletteIndex={0} />
      <GrazingChicken position={[-1.0, 0.6, -2.3]} paletteIndex={1} />
      <GrazingChicken position={[1.2, 0.6, -2.1]} paletteIndex={2} />
      <GrazingChicken position={[3.8, 0.6, -2.4]} paletteIndex={3} />
    </group>
  )
}

function GrazingChicken({ position, paletteIndex }: { position: [number, number, number]; paletteIndex: number }) {
  const ref = useRef<THREE.Group>(null)
  const [state, setState] = useState<'idle' | 'peck' | 'walk'>('idle')
  const timerRef = useRef(0)
  const targetRef = useRef<THREE.Vector3 | null>(null)

  useFrame((_, delta) => {
    timerRef.current -= delta
    if (timerRef.current <= 0) {
      // Randomly pick next state with bias to idle/peck
      const r = Math.random()
      if (r < 0.6) { setState('idle'); timerRef.current = 2 + Math.random() * 3 }
      else if (r < 0.9) { setState('peck'); timerRef.current = 0.4 }
      else { setState('walk'); timerRef.current = 1.2 + Math.random() * 1.2; targetRef.current = new THREE.Vector3((Math.random()-0.5)*0.8, 0.6, -2.2 + (Math.random()-0.5)*0.6) }
    }

    if (ref.current && state === 'walk' && targetRef.current) {
      // Move slightly toward target, keep within a narrow band near bottom
      const pos = ref.current.position
      const dir = targetRef.current.clone().sub(pos)
      dir.y = 0
      const dist = dir.length()
      if (dist > 0.001) {
        dir.normalize().multiplyScalar(0.6 * delta)
        pos.add(dir)
        // Face direction of travel
        const angle = Math.atan2(dir.x, dir.z)
        ref.current.rotation.y = angle
      }
    }
  })

  return (
    <group ref={ref} position={position}>
      <PixelChicken position={[0, 0, 0]} rotation={[0, 0, 0]} health={undefined} maxHealth={undefined} isPlayer={false} isPecking={state==='peck'} disableBobbing={false} />
    </group>
  )
}

export default function HowToPlayPage() {
  return (
    <div className="min-h-screen w-full overflow-hidden relative bg-gradient-to-b from-purple-900 via-purple-800 to-purple-950 text-white">
      {/* Header actions */}
      <div className="absolute top-4 left-4 z-20">
        <Link href="/">
          <Button variant="outline" className="border-purple-400 text-purple-100 bg-purple-900/40 hover:bg-purple-800/60">Back</Button>
        </Link>
      </div>

      {/* Centered informational content - no scroll needed */}
      <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center p-6">
        <div className="max-w-4xl text-center pointer-events-auto">
          <h1 className="text-5xl md:text-6xl font-extrabold mb-6 text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-red-500 to-purple-400">How to Play</h1>
          <p className="text-lg md:text-xl text-purple-100 mb-6">Jump in fast. Win with skill. Profit with strategy.</p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
            <div className="bg-purple-900/40 border border-purple-600/40 rounded-lg p-5">
              <h3 className="text-yellow-400 font-bold mb-2">1. Connect</h3>
              <p className="text-purple-100">Link your wallet to enter the arena. No download. No setup.</p>
            </div>
            <div className="bg-purple-900/40 border border-purple-600/40 rounded-lg p-5">
              <h3 className="text-yellow-400 font-bold mb-2">2. Battle</h3>
              <p className="text-purple-100">Move, sprint, jump and peck. Outplay and outlast the flock.</p>
            </div>
            <div className="bg-purple-900/40 border border-purple-600/40 rounded-lg p-5">
              <h3 className="text-yellow-400 font-bold mb-2">3. Bet</h3>
              <p className="text-purple-100">Back your champion. Winners earn. Spectate and stack rewards.</p>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
            <div className="bg-purple-900/40 border border-purple-600/40 rounded-lg p-5">
              <h3 className="text-yellow-400 font-bold mb-2">Controls</h3>
              <p className="text-purple-100">WASD/Arrows to move • Space to Peck • Shift to Sprint</p>
            </div>
            <div className="bg-purple-900/40 border border-purple-600/40 rounded-lg p-5">
              <h3 className="text-yellow-400 font-bold mb-2">Win Condition</h3>
              <p className="text-purple-100">Last chicken standing or highest score when time runs out.</p>
            </div>
            <div className="bg-purple-900/40 border border-purple-600/40 rounded-lg p-5">
              <h3 className="text-yellow-400 font-bold mb-2">Economy</h3>
              <p className="text-purple-100">Earn $CLUCK from wins, wagers, and events. Claim in wallet.</p>
            </div>
          </div>

          <div className="text-center mt-8">
            <Link href="/arena">
              <Button className="bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 text-white font-bold py-3 px-8 rounded-lg text-lg shadow-lg">Play Now</Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Bottom grazing chickens - break the 4th wall, no cinematic framing */}
      <div className="absolute left-0 right-0 bottom-0 h-56 md:h-64 z-0">
        <Canvas camera={{ position: [0, 2.0, 5.5], fov: 45 }} dpr={[1, 1.5]} shadows>
          <color attach="background" args={["transparent" as unknown as any]} />
          <ambientLight intensity={0.9} />
          <directionalLight position={[6, 8, 6]} intensity={0.9} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} />

          {/* Simple ground strip as the "bottom edge" */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
            <planeGeometry args={[20, 4]} />
            <meshStandardMaterial color="#2f6838" />
          </mesh>

          {/* Subtle darker patches */}
          {[-6, -2, 2, 6].map((x, i) => (
            <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.01, -1]} receiveShadow>
              <circleGeometry args={[1, 16]} />
              <meshStandardMaterial color="#285a31" />
            </mesh>
          ))}

          <GrazingFlock />
        </Canvas>
      </div>
    </div>
  )
}


