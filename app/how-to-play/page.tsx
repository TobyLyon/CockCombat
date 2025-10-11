"use client"

import { Canvas, useFrame } from "@react-three/fiber"
import * as THREE from "three"
import { ContactShadows } from "@react-three/drei"
import { motion } from "framer-motion"
import { PixelChicken } from "@/components/3d/pixel-chicken-viewer"
import { useRef, useState, useMemo } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

// Floating particle system for ambient background
function FloatingParticles({ count = 40 }: { count?: number }) {
  const particlesRef = useRef<THREE.Points>(null)
  
  const particles = useMemo(() => {
    const positions = new Float32Array(count * 3)
    const velocities = new Float32Array(count * 3)
    
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 20
      positions[i * 3 + 1] = Math.random() * 12
      positions[i * 3 + 2] = (Math.random() - 0.5) * 10
      
      velocities[i * 3] = (Math.random() - 0.5) * 0.02
      velocities[i * 3 + 1] = Math.random() * 0.01 + 0.005
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.02
    }
    
    return { positions, velocities }
  }, [count])
  
  useFrame((_, delta) => {
    if (!particlesRef.current) return
    
    const positions = particlesRef.current.geometry.attributes.position.array as Float32Array
    
    for (let i = 0; i < count; i++) {
      positions[i * 3] += particles.velocities[i * 3] * delta * 60
      positions[i * 3 + 1] += particles.velocities[i * 3 + 1] * delta * 60
      positions[i * 3 + 2] += particles.velocities[i * 3 + 2] * delta * 60
      
      if (positions[i * 3 + 1] > 12) positions[i * 3 + 1] = 0
      if (Math.abs(positions[i * 3]) > 10) positions[i * 3] *= -0.9
      if (Math.abs(positions[i * 3 + 2]) > 5) positions[i * 3 + 2] *= -0.9
    }
    
    particlesRef.current.geometry.attributes.position.needsUpdate = true
  })
  
  return (
    <points ref={particlesRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={particles.positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial size={0.03} color="#ffffff" transparent opacity={0.4} sizeAttenuation />
    </points>
  )
}

// Simple grazing flock at the bottom: idle + occasional peck and short walk
function GrazingFlock() {
  return (
    <group position={[0, 0, 0]}>
      {/* Reduced to 4 chickens with well-spaced lanes */}
      <GrazingChicken position={[-5.5, 0.5, -1.80]} paletteIndex={0} laneZ={-1.80} />
      <GrazingChicken position={[-1.8, 0.5, -2.10]} paletteIndex={2} laneZ={-2.10} />
      <GrazingChicken position={[1.8, 0.5, -2.40]} paletteIndex={4} laneZ={-2.40} />
      <GrazingChicken position={[5.5, 0.5, -2.00]} paletteIndex={6} laneZ={-2.00} />
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
      // Randomly pick next state with heavier bias to idle/peck (less walking)
      const r = Math.random()
      if (r < 0.6) { 
        setState('idle')
        timerRef.current = 2.0 + Math.random() * 3.0
      }
      else if (r < 0.92) { 
        setState('peck')
        timerRef.current = 0.6 + Math.random() * 0.4
      }
      else {
        setState('walk')
        timerRef.current = 1.2 + Math.random() * 1.5
        // Pick a wander target across the bottom screen area within lane
        const current = ref.current ? ref.current.position.clone() : new THREE.Vector3(0, 0.6, laneZ)
        const nx = current.x + (Math.random() - 0.5) * 3.5 // moderate lateral wander
        const nz = laneZ + (Math.random() - 0.5) * 0.05    // minimal depth variation
        const clampedX = Math.max(-8, Math.min(8, nx)) // moderate horizontal bounds
        const clampedZ = Math.max(laneZ - 0.04, Math.min(laneZ + 0.04, nz))
        targetRef.current = new THREE.Vector3(clampedX, 0.6, clampedZ)
      }
    }

    if (ref.current && state === 'walk' && targetRef.current) {
      // Move gently toward target
      const pos = ref.current.position
      const dir = targetRef.current.clone().sub(pos)
      dir.y = 0
      const dist = dir.length()
      if (dist > 0.05) {
        // Slow gentle approach
        dir.normalize().multiplyScalar(Math.min(dist * 0.8, speedRef.current) * delta)
        pos.add(dir)
        // Very smooth rotation toward movement
        const targetAngle = Math.atan2(dir.x, dir.z)
        const currentAngle = ref.current.rotation.y
        let deltaAngle = targetAngle - currentAngle
        // Normalize to [-PI, PI]
        deltaAngle = Math.atan2(Math.sin(deltaAngle), Math.cos(deltaAngle))
        const maxTurn = 1.8 * delta // reduced turn speed for smoothness
        const step = THREE.MathUtils.clamp(deltaAngle, -maxTurn, maxTurn)
        ref.current.rotation.y = currentAngle + step
      } else {
        // Reached target, stop walking
        setState('idle')
        timerRef.current = 1.5 + Math.random() * 2.0
      }
      // Keep strictly to lane with moderate horizontal bounds
      pos.x = Math.max(-8, Math.min(8, pos.x))
      const laneBand = 0.04
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
      {/* Refined ambient background with grain effect */}
      <div className="pointer-events-none absolute inset-0 opacity-30">
        {Array.from({ length: 16 }).map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-purple-500/20 blur-3xl"
            style={{
              top: `${Math.random() * 100}%`,
              left: `${Math.random() * 100}%`,
              width: `${Math.random() * 300 + 120}px`,
              height: `${Math.random() * 300 + 120}px`,
              animation: `float ${Math.random() * 15 + 20}s infinite ease-in-out`,
              animationDelay: `${Math.random() * 6}s`,
            }}
          />
        ))}
      </div>
      
      {/* Grain texture overlay */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.015] bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iMzAwIj48ZmlsdGVyIGlkPSJhIiB4PSIwIiB5PSIwIj48ZmVUdXJidWxlbmNlIGJhc2VGcmVxdWVuY3k9Ii43NSIgc3RpdGNoVGlsZXM9InN0aXRjaCIgdHlwZT0iZnJhY3RhbE5vaXNlIi8+PGZlQ29sb3JNYXRyaXggdHlwZT0ic2F0dXJhdGUiIHZhbHVlcz0iMCIvPjwvZmlsdGVyPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbHRlcj0idXJsKCNhKSIvPjwvc3ZnPg==')]" />

      {/* Full-page floating particles */}
      <div className="pointer-events-none absolute inset-0 z-10">
        <Canvas camera={{ position: [0, 6, 12], fov: 50 }} dpr={[1, 1.5]} gl={{ alpha: true }}>
          <FloatingParticles count={50} />
        </Canvas>
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

      {/* Informational content - upgraded */}
      <div className="absolute inset-0 z-20 pointer-events-none flex items-start justify-center p-4 md:p-6 pt-6 md:pt-10 lg:pt-14">
        <div className="max-w-6xl w-full text-center pointer-events-auto">
          <motion.h1 
            initial={{ opacity: 0, y: 10 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ duration: 0.5 }} 
            className="pixel-font text-4xl md:text-5xl lg:text-6xl font-extrabold mb-3 text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-red-500 to-purple-400 drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]"
          >
            How to Play
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 10 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ duration: 0.6, delay: 0.05 }} 
            className="text-base md:text-lg text-purple-200/90 mb-6 font-medium"
          >
            Jump in fast • Win with skill • Profit with strategy
          </motion.p>

          {/* Main flow cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
            {[
              { 
                num: '01', 
                title: 'Connect Wallet', 
                desc: 'BNB Chain • Instant access', 
                icon: '🔗',
                color: 'from-blue-500 to-cyan-500'
              },
              { 
                num: '02', 
                title: 'Enter Arena', 
                desc: 'Real-time PvP combat', 
                icon: '⚔️',
                color: 'from-red-500 to-orange-500'
              },
              { 
                num: '03', 
                title: 'Win & Earn', 
                desc: 'Battle or spectate for $COCK', 
                icon: '💰',
                color: 'from-yellow-500 to-amber-500'
              },
            ].map((x, idx) => (
              <motion.div 
                key={x.num} 
                initial={{ opacity: 0, y: 20 }} 
                animate={{ opacity: 1, y: 0 }} 
                transition={{ duration: 0.5, delay: 0.1 + idx * 0.1 }}
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
                className="relative bg-gradient-to-br from-purple-900/60 to-purple-950/60 backdrop-blur-md border border-purple-500/30 rounded-2xl p-5 shadow-[0_8px_32px_rgba(0,0,0,0.3)] hover:border-purple-400/50 hover:shadow-[0_8px_48px_rgba(168,85,247,0.4)] transition-all overflow-hidden group"
              >
                {/* Gradient accent */}
                <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${x.color} opacity-60 group-hover:opacity-100 transition-opacity`} />
                
                <div className="flex items-start gap-3 text-left">
                  <div className="text-3xl mt-1 filter drop-shadow-lg">{x.icon}</div>
                  <div className="flex-1">
                    <div className={`text-xs font-bold bg-gradient-to-r ${x.color} bg-clip-text text-transparent mb-1`}>STEP {x.num}</div>
                    <h3 className="text-lg font-bold text-white mb-1">{x.title}</h3>
                    <p className="text-sm text-purple-200/80">{x.desc}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Detailed info cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { 
                title: 'Controls', 
                icon: '🎮',
                items: [
                  { key: 'WASD', desc: 'Move & Turn' },
                  { key: 'SPACE', desc: 'Peck Attack' },
                  { key: 'SHIFT', desc: 'Sprint' },
                  { key: 'CLICK', desc: 'Also Peck' },
                ]
              },
              { 
                title: 'Win Conditions', 
                icon: '🏆',
                items: [
                  { key: 'Last Alive', desc: 'Survive longest' },
                  { key: 'Most Hits', desc: 'Peck more rivals' },
                  { key: 'Tiebreaker', desc: 'Last hit wins' },
                ]
              },
              { 
                title: 'Economy', 
                icon: '🪙',
                items: [
                  { key: '$COCK', desc: 'In-game currency' },
                  { key: 'Wagers', desc: 'Pool into prizes' },
                  { key: 'Winners', desc: 'Take 96% cut' },
                ]
              },
            ].map((x, idx) => (
              <motion.div 
                key={x.title} 
                initial={{ opacity: 0, y: 20 }} 
                animate={{ opacity: 1, y: 0 }} 
                transition={{ duration: 0.5, delay: 0.4 + idx * 0.1 }}
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
                className="bg-purple-900/50 backdrop-blur-md border border-purple-600/30 rounded-2xl p-4 shadow-[0_8px_32px_rgba(0,0,0,0.25)] hover:border-purple-500/50 hover:shadow-[0_8px_40px_rgba(139,92,246,0.3)] transition-all text-left"
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-2xl filter drop-shadow-lg">{x.icon}</span>
                  <h3 className="text-base font-bold text-yellow-400">{x.title}</h3>
                </div>
                <div className="space-y-2">
                  {x.items.map((item, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="font-mono font-bold text-xs bg-purple-800/60 text-purple-200 px-2 py-0.5 rounded border border-purple-600/40 min-w-[60px] text-center">{item.key}</span>
                      <span className="text-purple-100/90">{item.desc}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom grazing chickens - foreground overlay */}
      <div className="absolute left-0 right-0 bottom-0 h-64 md:h-72 z-30 pointer-events-none">
        <Canvas camera={{ position: [0, 1.5, 10], fov: 45 }} dpr={[1, 1.5]} shadows gl={{ alpha: true }}>
          <ambientLight intensity={0.9} />
          <directionalLight position={[6, 8, 6]} intensity={0.8} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
          <GrazingFlock />
          <ContactShadows position={[0, 0, 0]} opacity={0.5} scale={30} blur={2.5} far={5} color="#1a1a1a" />
          <CameraAim target={[0, 0.5, -2]} />
        </Canvas>
      </div>
    </div>
  )
}

