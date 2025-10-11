"use client"

import { Canvas, useFrame } from "@react-three/fiber"
import * as THREE from "three"
import { ContactShadows } from "@react-three/drei"
import { motion } from "framer-motion"
import { PixelChicken } from "@/components/3d/pixel-chicken-viewer"
import { useRef, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

// Simple grazing flock at the bottom: idle + occasional peck and short walk
function GrazingFlock() {
  return (
    <group position={[0, 0, 0]}>
      <GrazingChicken position={[-7.0, 0.6, -2.2]} paletteIndex={0} />
      <GrazingChicken position={[-4.2, 0.6, -2.0]} paletteIndex={1} />
      <GrazingChicken position={[-1.5, 0.6, -2.4]} paletteIndex={2} />
      <GrazingChicken position={[1.2, 0.6, -2.1]} paletteIndex={3} />
      <GrazingChicken position={[3.8, 0.6, -2.3]} paletteIndex={4} />
      <GrazingChicken position={[6.2, 0.6, -2.0]} paletteIndex={5} />
    </group>
  )
}

function GrazingChicken({ position, paletteIndex }: { position: [number, number, number]; paletteIndex: number }) {
  const ref = useRef<THREE.Group>(null)
  const [state, setState] = useState<'idle' | 'peck' | 'walk'>('idle')
  const timerRef = useRef(0)
  const targetRef = useRef<THREE.Vector3 | null>(null)
  const speedRef = useRef(0.5 + Math.random() * 0.4) // per-chicken base speed

  useFrame((_, delta) => {
    timerRef.current -= delta
    if (timerRef.current <= 0) {
      // Randomly pick next state with bias to idle/peck
      const r = Math.random()
      if (r < 0.5) { setState('idle'); timerRef.current = 1.5 + Math.random() * 2.5 }
      else if (r < 0.85) { setState('peck'); timerRef.current = 0.5 }
      else {
        setState('walk')
        timerRef.current = 1.5 + Math.random() * 2.2
        // Pick a nearby wander target within the bottom band
        const current = ref.current ? ref.current.position.clone() : new THREE.Vector3(0, 0.6, -2.2)
        const nx = current.x + (Math.random() - 0.5) * 3.2 // small lateral wander
        const nz = -2.2 + (Math.random() - 0.5) * 0.6    // keep a tight depth band
        const clampedX = Math.max(-8, Math.min(8, nx))
        const clampedZ = Math.max(-2.8, Math.min(-1.6, nz))
        targetRef.current = new THREE.Vector3(clampedX, 0.6, clampedZ)
      }
    }

    if (ref.current && state === 'walk' && targetRef.current) {
      // Move slightly toward target, keep within a narrow band near bottom
      const pos = ref.current.position
      const dir = targetRef.current.clone().sub(pos)
      dir.y = 0
      const dist = dir.length()
      if (dist > 0.001) {
        // Approach with per-chicken speed
        dir.normalize().multiplyScalar(speedRef.current * delta)
        pos.add(dir)
        // Face direction of travel
        const angle = Math.atan2(dir.x, dir.z)
        ref.current.rotation.y = angle
      }
      // Clamp within band to avoid exiting the page edge
      pos.x = Math.max(-8, Math.min(8, pos.x))
      pos.z = Math.max(-2.8, Math.min(-1.6, pos.z))
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
      {/* Decorative ambient orbs */}
      <div className="pointer-events-none absolute inset-0">
        {Array.from({ length: 16 }).map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-purple-500/10 blur-2xl"
            style={{
              top: `${Math.random() * 100}%`,
              left: `${Math.random() * 100}%`,
              width: `${Math.random() * 240 + 80}px`,
              height: `${Math.random() * 240 + 80}px`,
              animation: `float ${Math.random() * 10 + 12}s infinite ease-in-out`,
              animationDelay: `${Math.random() * 6}s`,
            }}
          />
        ))}
      </div>

      {/* Header actions */}
      <div className="absolute top-4 left-4 z-30 flex gap-3">
        <Link href="/">
          <Button variant="outline" className="border-purple-400 text-purple-100 bg-purple-900/40 hover:bg-purple-800/60">Back</Button>
        </Link>
        <Link href="/arena">
          <Button className="bg-purple-600 hover:bg-purple-700 text-white">Play Now</Button>
        </Link>
      </div>

      {/* Centered informational content - no scroll needed */}
      <div className="absolute inset-0 z-20 pointer-events-none flex items-center justify-center p-6">
        <div className="max-w-5xl w-full text-center pointer-events-auto">
          <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="text-5xl md:text-6xl font-extrabold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-red-500 to-purple-400">
            How to Play
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.05 }} className="text-lg md:text-xl text-purple-100 mb-8">
            Jump in fast. Win with skill. Profit with strategy.
          </motion.p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
            {[
              { t: '1. Connect', d: 'Link your wallet to enter the arena. No download. No setup.', i: '🔗' },
              { t: '2. Battle', d: 'Move, sprint, jump and peck. Outplay and outlast the flock.', i: '⚔️' },
              { t: '3. Bet', d: 'Back your champion. Winners earn. Spectate and stack rewards.', i: '💰' },
            ].map((x, idx) => (
              <motion.div key={x.t} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.05 * (idx + 1) }} className="bg-purple-900/40 backdrop-blur-sm border border-purple-600/40 rounded-xl p-5 shadow-[0_0_40px_rgba(0,0,0,0.25)]">
                <div className="text-2xl mb-1">{x.i}</div>
                <h3 className="text-yellow-400 font-bold mb-1">{x.t}</h3>
                <p className="text-purple-100">{x.d}</p>
              </motion.div>
            ))}
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
            {[
              { t: 'Controls', d: 'WASD/Arrows move • Space peck • Shift sprint', i: '🎮' },
              { t: 'Win Condition', d: 'Knock out rivals with pecks and positioning. Last alive wins. Ties break by last hit.', i: '🏆' },
              { t: 'Economy', d: 'Earn $COCK from wins, wagers, and events. Wagers pool into prize; house takes a small cut.', i: '🪙' },
            ].map((x, idx) => (
              <motion.div key={x.t} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.15 + 0.05 * (idx + 1) }} className="bg-purple-900/40 backdrop-blur-sm border border-purple-600/40 rounded-xl p-5 shadow-[0_0_40px_rgba(0,0,0,0.25)]">
                <div className="text-2xl mb-1">{x.i}</div>
                <h3 className="text-yellow-400 font-bold mb-1">{x.t}</h3>
                <p className="text-purple-100">{x.d}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom grazing chickens - foreground overlay, can pass in front of text */}
      <div className="absolute left-0 right-0 bottom-0 h-52 md:h-64 z-30 pointer-events-none">
        <Canvas camera={{ position: [0, 1.8, 6], fov: 42 }} dpr={[1, 1.5]} shadows gl={{ alpha: true }}>
          <ambientLight intensity={0.9} />
          <directionalLight position={[6, 8, 6]} intensity={0.8} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
          <GrazingFlock />
          <ContactShadows position={[0, 0, 0]} opacity={0.5} scale={20} blur={2.5} far={5} color="#1a1a1a" />
        </Canvas>
      </div>
    </div>
  )
}


