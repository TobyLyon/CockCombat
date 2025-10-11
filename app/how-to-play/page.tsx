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
      {/* Discrete depth lanes to prevent overlap flicker */}
      <GrazingChicken position={[-7.0, 0.5, -1.70]} paletteIndex={0} laneZ={-1.70} />
      <GrazingChicken position={[-4.2, 0.5, -1.90]} paletteIndex={1} laneZ={-1.90} />
      <GrazingChicken position={[-1.5, 0.5, -2.10]} paletteIndex={2} laneZ={-2.10} />
      <GrazingChicken position={[1.2, 0.5, -2.30]} paletteIndex={3} laneZ={-2.30} />
      <GrazingChicken position={[3.8, 0.5, -2.50]} paletteIndex={4} laneZ={-2.50} />
      <GrazingChicken position={[6.2, 0.5, -1.80]} paletteIndex={5} laneZ={-1.80} />
      {/* Extra variety */}
      <GrazingChicken position={[-5.8, 0.5, -2.40]} paletteIndex={6} laneZ={-2.40} />
      <GrazingChicken position={[5.4, 0.5, -2.00]} paletteIndex={7} laneZ={-2.00} />
    </group>
  )
}

function GrazingChicken({ position, paletteIndex, laneZ }: { position: [number, number, number]; paletteIndex: number; laneZ: number }) {
  const ref = useRef<THREE.Group>(null)
  const [state, setState] = useState<'idle' | 'peck' | 'walk'>('idle')
  const timerRef = useRef(0)
  const targetRef = useRef<THREE.Vector3 | null>(null)
  const speedRef = useRef(0.5 + Math.random() * 0.4) // per-chicken base speed
  // Color palettes matching in-game variety
  const PALETTES = [
    { body: "#f97316", comb: "#ef4444", beak: "#FFD600", legs: "#FFD600", tail: "#6366f1", eyes: "#ffffff", pupils: "#222222" },
    { body: "#f59e0b", comb: "#b91c1c", beak: "#fbbf24", legs: "#fbbf24", tail: "#7c3aed", eyes: "#ffffff", pupils: "#111827" },
    { body: "#f8fafc", comb: "#dc2626", beak: "#facc15", legs: "#facc15", tail: "#3b82f6", eyes: "#ffffff", pupils: "#111827" },
    { body: "#1f2937", comb: "#ef4444", beak: "#f59e0b", legs: "#f59e0b", tail: "#10b981", eyes: "#e5e7eb", pupils: "#000000" },
    { body: "#60a5fa", comb: "#ef4444", beak: "#fbbf24", legs: "#fbbf24", tail: "#111827", eyes: "#ffffff", pupils: "#1f2937" },
    { body: "#10b981", comb: "#dc2626", beak: "#fbbf24", legs: "#fbbf24", tail: "#2563eb", eyes: "#ffffff", pupils: "#111827" },
    { body: "#d1d5db", comb: "#b91c1c", beak: "#f59e0b", legs: "#f59e0b", tail: "#374151", eyes: "#ffffff", pupils: "#111827" },
    { body: "#8b5cf6", comb: "#ef4444", beak: "#fbbf24", legs: "#fbbf24", tail: "#10b981", eyes: "#ffffff", pupils: "#111827" },
  ]

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
        // Pick a nearby wander target within this chicken's depth lane
        const current = ref.current ? ref.current.position.clone() : new THREE.Vector3(0, 0.6, laneZ)
        const nx = current.x + (Math.random() - 0.5) * 3.2 // small lateral wander
        const nz = laneZ + (Math.random() - 0.5) * 0.08    // very small depth wander inside lane
        const clampedX = Math.max(-8, Math.min(8, nx))
        const clampedZ = Math.max(laneZ - 0.06, Math.min(laneZ + 0.06, nz))
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
        // Face direction of travel (smoothed to avoid snap/jitter)
        const targetAngle = Math.atan2(dir.x, dir.z)
        const current = ref.current.rotation.y
        let deltaAngle = targetAngle - current
        deltaAngle = Math.atan2(Math.sin(deltaAngle), Math.cos(deltaAngle))
        const maxTurn = 2.5 * delta
        const step = THREE.MathUtils.clamp(deltaAngle, -maxTurn, maxTurn)
        ref.current.rotation.y = current + step
      }
      // Keep to lane with a tight band to avoid depth overlap
      pos.x = Math.max(-8, Math.min(8, pos.x))
      const laneBand = 0.06
      pos.z = Math.max(laneZ - laneBand, Math.min(laneZ + laneBand, pos.z))
    }
  })

  return (
    <group ref={ref} position={position} scale={[0.7, 0.7, 0.7]}>
      <PixelChicken position={[0, 0, 0]} rotation={[0, 0, 0]} health={undefined} maxHealth={undefined} isPlayer={false} isPecking={state==='peck'} disableBobbing={false} colors={PALETTES[((paletteIndex % PALETTES.length) + PALETTES.length) % PALETTES.length]} />
    </group>
  )
}

function CameraAim({ target }: { target: [number, number, number] }) {
  const t = new THREE.Vector3(...target)
  useFrame(({ camera }) => {
    camera.lookAt(t)
  })
  return null
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

      {/* Informational content - moved up */}
      <div className="absolute inset-0 z-20 pointer-events-none flex items-start justify-center p-6 pt-8 md:pt-12 lg:pt-16">
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
      <div className="absolute left-0 right-0 bottom-0 h-64 md:h-72 z-30 pointer-events-none">
        <Canvas camera={{ position: [0, 1.5, 8], fov: 40 }} dpr={[1, 1.5]} shadows gl={{ alpha: true }}>
          <ambientLight intensity={0.9} />
          <directionalLight position={[6, 8, 6]} intensity={0.8} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
          <GrazingFlock />
          <ContactShadows position={[0, 0, 0]} opacity={0.5} scale={20} blur={2.5} far={5} color="#1a1a1a" />
          <CameraAim target={[0, 0.5, -2]} />
        </Canvas>
      </div>
    </div>
  )
}


