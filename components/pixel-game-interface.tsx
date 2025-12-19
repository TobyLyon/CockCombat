"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Canvas, useFrame, useThree, useLoader } from "@react-three/fiber"
import * as THREE from "three"
import { TextureLoader } from "three"
import { PixelChicken } from "@/components/3d/pixel-chicken-viewer"
import { WalletMultiButton } from "@/components/wallet/wallet-multi-button"
import PixelChickenViewer from "@/components/3d/pixel-chicken-viewer"
import { useRouter } from "next/navigation"
import { useAudio } from "@/contexts/AudioContext"
import { useWallet } from "@/hooks/use-wallet"
import { useProfile } from "@/contexts/ProfileContext"
import { toast } from "sonner"
import { Loader2, Copy, Check } from "lucide-react"
// Removed WalletModal usage in EVM-only build

// Animated chicken in background
interface AnimatedChicken {
  id: number
  x: number
  y: number
  speed: number
  direction: number
  size: number
  color: string
  animation: 'walking' | 'pecking' | 'idle'
  animationTimer: number
}

export default function PixelGameInterface() {
  const router = useRouter()
  const { audioEnabled, volume, playSound } = useAudio()
  const { connected, publicKey } = useWallet()
  const { profile, needsSetup, setNeedsSetup, refreshProfile } = useProfile()
  const [isNavigating, setIsNavigating] = useState(false)
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const TOKEN_MINT = "8YFsrVXEt9ZBsPhxqcKYRZgUWh6d9kkZw3jpJPGnpump"
  const isMobile = useMemo(() => {
    if (typeof window === "undefined") return false
    return window.matchMedia && window.matchMedia('(max-width: 768px)').matches
  }, [])

  const handleCopyTokenAddress = async () => {
    try {
      await navigator.clipboard.writeText(TOKEN_MINT)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch (_err) {
      // ignore copy errors
    }
  }
  
  // Background chickens (sprite placeholders kept for sky-level ambience)
  const [backgroundChickens, setBackgroundChickens] = useState<AnimatedChicken[]>([])
  const animationFrameRef = useRef<number>()
  
  // Scene cycle state for real 3D chickens in the background
  const [sceneIndex, setSceneIndex] = useState(0)
  const sceneTimerRef = useRef<number | null>(null)
  const sceneStartAtRef = useRef<number>(Date.now())
  const sceneEndAtRef = useRef<number>(Date.now() + 8000)

  // Color palettes for chickens (keeps your orange but adds variety)
  const CHICKEN_PALETTES = [
    // Classic orange
    { body: "#f97316", comb: "#ef4444", beak: "#FFD600", legs: "#FFD600", tail: "#6366f1", eyes: "#ffffff", pupils: "#222222" },
    // Gold
    { body: "#f59e0b", comb: "#b91c1c", beak: "#fbbf24", legs: "#fbbf24", tail: "#7c3aed", eyes: "#ffffff", pupils: "#111827" },
    // White
    { body: "#f8fafc", comb: "#dc2626", beak: "#facc15", legs: "#facc15", tail: "#3b82f6", eyes: "#ffffff", pupils: "#111827" },
    // Black
    { body: "#1f2937", comb: "#ef4444", beak: "#f59e0b", legs: "#f59e0b", tail: "#10b981", eyes: "#e5e7eb", pupils: "#000000" },
    // Blue
    { body: "#60a5fa", comb: "#ef4444", beak: "#fbbf24", legs: "#fbbf24", tail: "#111827", eyes: "#ffffff", pupils: "#1f2937" },
    // Emerald
    { body: "#10b981", comb: "#dc2626", beak: "#fbbf24", legs: "#fbbf24", tail: "#2563eb", eyes: "#ffffff", pupils: "#111827" }
  ] as Array<{[k:string]: string}>
  // Timed flock sprint event controller
  interface FlockEvent {
    ids: number[]
    endAt: number
    direction: number // degrees, 0 = right, 180 = left
    y: number // track height band
    speed: number // temporary speed override
  }
  const flockRef = useRef<FlockEvent | null>(null)
  const flockTimerRef = useRef<number | null>(null)

  // Play click sound on any left mouse click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (e.button === 0) playSound('click')
    }
    window.addEventListener('mousedown', handleClick)
    return () => window.removeEventListener('mousedown', handleClick)
  }, [audioEnabled, volume, playSound])

  const handleNavigation = async (path: string) => {
    playSound("button")
    
    // Allow viewing lobbies without wallet connection
    // Only require wallet for actually joining matches (handled in lobby component)
    setIsNavigating(true)
    
    try {
      // Navigate directly to lobbies - no wallet check needed for viewing
      const toastLabel = (() => {
        if (path === "/arena") return "Entering the arena..."
        if (path === "/how-to-play") return "Opening How To Play..."
        return "Navigating..."
      })()
      toast.success(toastLabel, { duration: 1000 })
      router.push(path)
    } catch (error) {
      console.error("Navigation error:", error)
      toast.error("An unexpected error occurred. Please try again.")
    } finally {
      setIsNavigating(false)
    }
  }

  // Initialize background chickens
  useEffect(() => {
    const colors = ['#e63946', '#f77f00', '#fcbf49', '#eae2b7', '#d4a373', '#8b4513']
    const chickens: AnimatedChicken[] = Array.from({ length: 8 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: 50 + Math.random() * 30, // Keep them in the grass area
      speed: 0.02 + Math.random() * 0.03,
      direction: Math.random() * 360,
      size: 40 + Math.random() * 30,
      color: colors[Math.floor(Math.random() * colors.length)],
      animation: Math.random() > 0.7 ? 'pecking' : 'walking' as 'walking' | 'pecking' | 'idle',
      animationTimer: Math.random() * 5000
    }))
    setBackgroundChickens(chickens)
  }, [])

  // Schedule periodic flock sprint events (every 12–20s)
  useEffect(() => {
    const scheduleNext = () => {
      const delay = 12000 + Math.random() * 8000 // 12–20s
      flockTimerRef.current = window.setTimeout(() => {
        // Choose 3–6 unique chickens to sprint together
        setBackgroundChickens(prev => {
          const idsPool = prev.map(c => c.id)
          const count = Math.min(6, Math.max(3, Math.floor(Math.random() * 6)))
          const chosen: number[] = []
          while (chosen.length < count && idsPool.length) {
            const idx = Math.floor(Math.random() * idsPool.length)
            chosen.push(idsPool[idx])
            idsPool.splice(idx, 1)
          }
          // Create flock event across the back field
          const direction = Math.random() > 0.5 ? 0 : 180
          const y = 52 + Math.random() * 6 // keep a tight band near back field
          const speed = 0.08 + Math.random() * 0.05
          flockRef.current = {
            ids: chosen,
            endAt: Date.now() + (3000 + Math.random() * 2500), // 3–5.5s sprint
            direction,
            y,
            speed
          }
          return prev
        })
        scheduleNext()
      }, delay)
    }
    scheduleNext()
    return () => {
      if (flockTimerRef.current) window.clearTimeout(flockTimerRef.current)
      flockTimerRef.current = null
      flockRef.current = null
    }
  }, [])

  // Animate background chickens
  useEffect(() => {
    const animate = () => {
      const now = Date.now()
      const activeFlock = flockRef.current && now < flockRef.current.endAt ? flockRef.current : null
      if (flockRef.current && !activeFlock) {
        // Flock event finished
        flockRef.current = null
      }
      setBackgroundChickens(prev => prev.map(chicken => {
        let { x, y, direction, speed, animation, animationTimer } = chicken
        // Apply flock overrides if this chicken is in the current event
        if (activeFlock && activeFlock.ids.includes(chicken.id)) {
          // Force walking during sprint
          animation = 'walking'
          // Tighten Y band toward event Y
          y = y + (activeFlock.y - y) * 0.15
          // Align direction
          direction = activeFlock.direction
          // Temporarily increase speed
          speed = activeFlock.speed
        }
        
        // Update animation state
        animationTimer -= 16 // ~60fps
        if (animationTimer <= 0) {
          const rand = Math.random()
          animation = rand > 0.7 ? 'pecking' : rand > 0.3 ? 'walking' : 'idle'
          animationTimer = 2000 + Math.random() * 3000
          
          // Change direction occasionally
          if (Math.random() > 0.7) {
            direction = Math.random() * 360
          }
        }
        
        // Move only when walking
        if (animation === 'walking') {
          x += Math.cos(direction * Math.PI / 180) * speed
          y += Math.sin(direction * Math.PI / 180) * speed
          
          // Bounce off edges
          if (x < 5 || x > 95) direction = 180 - direction
          if (y < 45 || y > 85) direction = -direction
          
          x = Math.max(5, Math.min(95, x))
          y = Math.max(45, Math.min(85, y))
        }
        
        return { ...chicken, x, y, direction, speed, animation, animationTimer }
      }))
      
      animationFrameRef.current = requestAnimationFrame(animate)
    }
    
    animationFrameRef.current = requestAnimationFrame(animate)
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [])

  // Auto-navigate after wallet connection
  useEffect(() => {
    if (connected && pendingNavigation) {
      const path = pendingNavigation
      setPendingNavigation(null)
      handleNavigation(path)
    }
  }, [connected, pendingNavigation])

  // Cycle scenes every 7–10 seconds; record start/end for camera progress
  useEffect(() => {
    const schedule = () => {
      const delay = 7000 + Math.random() * 3000
      const now = Date.now()
      sceneStartAtRef.current = now
      sceneEndAtRef.current = now + delay
      if (sceneTimerRef.current) window.clearTimeout(sceneTimerRef.current)
      sceneTimerRef.current = window.setTimeout(() => {
        setSceneIndex((i) => (i + 1) % 3)
        schedule()
      }, delay)
    }
    schedule()
    return () => { if (sceneTimerRef.current) window.clearTimeout(sceneTimerRef.current) }
  }, [])

  return (
    <div className="h-screen w-screen overflow-hidden relative bg-gradient-to-b from-[#87CEEB] via-[#B0D4E3] to-[#E8F4F8] flex flex-col">
      {/* Epic Title */}
      <div className="absolute top-4 sm:top-8 left-1/2 transform -translate-x-1/2 z-30 text-center pointer-events-none">
        <div className="relative inline-block">
          <h1 className="text-4xl sm:text-5xl md:text-7xl font-black text-white drop-shadow-[0_0_40px_rgba(0,0,0,1)] [text-shadow:_8px_8px_0_rgb(0_0_0_/_80%)] mb-2 pixel-font leading-none">
            <span className="block">COCK</span>
            <span className="block">COMBAT</span>
          </h1>
          <span className="absolute -top-2 left-full ml-1 md:-top-3 md:ml-2 bg-yellow-400 text-black border-2 border-yellow-500 text-sm md:text-lg font-extrabold px-3 py-1 rounded-md leading-none shadow-lg rotate-[-6deg] pixel-font">
            BETA
          </span>
        </div>
        <p className="text-base sm:text-lg md:text-xl font-bold text-yellow-300 drop-shadow-lg [text-shadow:_3px_3px_0_rgb(0_0_0_/_80%)] pixel-font">
          Battle Royale on Solana
        </p>
        </div>

      {/* 3D Scene Background - cycles through mini-scenes of real chickens */}
      <div className="absolute inset-0 z-10 pointer-events-none" aria-hidden style={{ filter: 'blur(2px)' }}>
        <Canvas 
          camera={{ position: [0, 2.2, 6], fov: 45 }}
          style={{ width: '100%', height: '100%' }}
          dpr={isMobile ? [1, 1.25] : [1, 1.75]}
          gl={{ antialias: !isMobile, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false }}
          onCreated={({ gl }) => {
            try {
              const canvasEl = (gl as any)?.domElement as HTMLCanvasElement | undefined
              if (canvasEl) {
                const onLost = (e: any) => { try { e.preventDefault() } catch {} }
                const onRestored = () => { try { (gl as any)?.resetState?.() } catch {} }
                canvasEl.addEventListener('webglcontextlost', onLost, false)
                canvasEl.addEventListener('webglcontextrestored', onRestored, false)
              }
            } catch {}
          }}
          shadows={!isMobile}
        >
          <CinematicCamera 
            index={sceneIndex}
            getProgress={() => {
              const now = Date.now()
              const start = sceneStartAtRef.current
              const end = sceneEndAtRef.current
              const duration = Math.max(1, end - start)
              const t = Math.max(0, Math.min(1, (now - start) / duration))
              // Smoothstep
              return t * t * (3 - 2 * t)
            }}
          />
          <color attach="background" args={['#87CEEB']} />
          <ambientLight intensity={0.9} />
          <directionalLight position={[8, 12, 6]} intensity={1.4} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} shadow-camera-far={50} shadow-camera-left={-15} shadow-camera-right={15} shadow-camera-top={15} shadow-camera-bottom={-15} />
          <hemisphereLight args={['#87CEEB', '#4a7c29', 0.3]} />
          <fog attach="fog" args={['#B0D4E3', 12, 35]} />
          <SceneCycle index={sceneIndex} onComplete={() => setSceneIndex((i) => (i + 1) % 3)} />
        </Canvas>
      </div>

      {/* Center - Mouse-following chicken in foreground */}
      <div className="absolute top-[46%] sm:top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none">
        <div className="w-[240px] h-[240px] sm:w-[300px] sm:h-[300px] md:w-[400px] md:h-[400px]">
              <PixelChickenViewer />
            </div>
          </div>

      {/* Minimal UI - Bottom Center: three buttons side-by-side */}
      <div className="absolute left-1/2 transform -translate-x-1/2 z-30 hidden sm:flex items-center justify-center gap-2 sm:gap-4 bottom-20 sm:bottom-48">
        {/* Wallet connect button (chain aware) */}
        <WalletMultiButton className="h-8 px-3 text-xs sm:h-10 sm:px-4 sm:text-sm" />
        
        {/* Lobbies button */}
          <Button
            className="h-8 px-3 text-xs sm:h-12 sm:px-6 sm:text-base font-bold rounded-lg bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 text-white active:scale-[0.985] touch-manipulation select-none"
            onClick={() => handleNavigation("/arena")}
            onPointerDown={(e) => { try { (e.currentTarget as any).style.transform = 'scale(0.985)' } catch {} }}
            onPointerUp={(e) => { try { (e.currentTarget as any).style.transform = '' } catch {} }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleNavigation('/arena') }}
            disabled={isNavigating}
          >
            {isNavigating ? (<><Loader2 className="animate-spin mr-2" /> Loading...</>) : 'Lobbies'}
          </Button>

        {/* How To Play button */}
        <Button
          className="h-8 px-3 text-xs sm:h-12 sm:px-6 sm:text-base font-bold rounded-lg bg-yellow-400 hover:bg-yellow-500 text-white border-2 border-yellow-500 shadow-lg active:scale-[0.985] touch-manipulation select-none"
          onClick={() => handleNavigation("/how-to-play")}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleNavigation('/how-to-play') }}
          disabled={isNavigating}
        >
          How to Play
        </Button>
                  </div>

      {/* Mobile-only socials and token block */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 z-30 w-[calc(100%-1rem)] max-w-md sm:hidden pointer-events-auto pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
        {/* Minimal UI - Bottom Center: three buttons side-by-side */}
        <div className="flex items-center justify-center gap-2 mb-2">
          {/* Wallet connect button (chain aware) */}
          <WalletMultiButton className="h-8 px-3 text-xs" />
          
          {/* Lobbies button */}
            <Button
              className="h-8 px-3 text-xs font-bold rounded-lg bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 text-white active:scale-[0.985] touch-manipulation select-none"
              onClick={() => handleNavigation("/arena")}
              onPointerDown={(e) => { try { (e.currentTarget as any).style.transform = 'scale(0.985)' } catch {} }}
              onPointerUp={(e) => { try { (e.currentTarget as any).style.transform = '' } catch {} }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleNavigation('/arena') }}
              disabled={isNavigating}
            >
              {isNavigating ? (<><Loader2 className="animate-spin mr-2" /> Loading...</>) : 'Lobbies'}
            </Button>

          {/* How To Play button */}
          <Button
            className="h-8 px-3 text-xs font-bold rounded-lg bg-yellow-400 hover:bg-yellow-500 text-white border-2 border-yellow-500 shadow-lg active:scale-[0.985] touch-manipulation select-none"
            onClick={() => handleNavigation("/how-to-play")}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleNavigation('/how-to-play') }}
            disabled={isNavigating}
          >
            How to Play
          </Button>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/10 backdrop-blur-sm p-3 shadow">
          <button
            onClick={() => { handleCopyTokenAddress(); playSound("click") }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-full border transition-colors duration-150 border-white/20 bg-white/5 text-white/80 cursor-pointer hover:bg-white/10 focus:outline-none"
            aria-label="Copy token contract address"
            title={TOKEN_MINT}
            type="button"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-400" />
            ) : (
              <Copy className="h-3.5 w-3.5 text-yellow-300" />
            )}
            <span className="text-xs font-mono tracking-wide break-all leading-tight text-white">{copied ? 'Copied!' : `Token: ${TOKEN_MINT}`}</span>
          </button>
          <div className="flex items-center justify-end gap-2 mt-2">
            <a href="https://www.x.com/CockCombatSOL" target="_blank" rel="noopener noreferrer" aria-label="X" className="p-2 rounded-md border border-white/10 bg-white/5">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M22.46 5.924c-.793.352-1.645.59-2.54.697a4.48 4.48 0 001.963-2.475 8.959 8.959 0 01-2.828 1.082A4.478 4.478 0 0016.112 4c-2.482 0-4.495 2.013-4.495 4.495 0 .353.04.698.117 1.028-3.74-.188-7.055-1.98-9.273-4.702a4.49 4.49 0 00-.608 2.262c0 1.56.794 2.936 2.004 3.744a4.468 4.468 0 01-2.037-.563v .057c0 2.18 1.55 4.002 3.605 4.418a4.506 4.506 0 01-2.03 .077c.573 1.788 2.236 3.09 4.208 3.126A8.987 8.987 0 012 19.54a12.697 12.697 0 006.88 2.018c8.253 0 12.777-6.837 12.777-12.776 0-.195-.004-.39-.013-.583A9.14 9.14 0 0024 4.59a8.98 8.98 0 01-2.54 .697z" fill="#1DA1F2"/></svg>
            </a>
            <a href="https://discord.gg/Tj2vBPgbFP" target="_blank" rel="noopener noreferrer" aria-label="Discord" className="p-2 rounded-md border border-white/10 bg-white/5">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20.317 4.369a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.211.375-.444.864-.608 1.249a18.27 18.27 0 00-5.487 0 12.317 12.317 0 00-.617-1.249.077.077 0 00-.079-.037 19.736 19.736 0 00-4.885 1.515.07.07 0 00-.032.027C.533 9.045-.32 13.58.099 18.07a.082.082 0 00.031.056 19.9 19.9 0 006.014 3.06.08.08 0 00.087-.029c.463-.63.875-1.295 1.226-1.993a.076.076 0 00-.041-.104 12.795 12.795 0 01-1.806-.86.077.077 0 01-.008-.128c.122-.091.244-.186.361-.28a.074.074 0 01.078-.01c3.78 1.727 7.86 1.727 11.6 0a.074.074 0 01.079.009c.118.095.24.19.362.281a.077.077 0 01-.006.127 12.584 12.584 0 01-1.807.86.076.076 0 00-.04.105c.36.698.772 1.363 1.225 1.992a.08.08 0 00.087.03 19.876 19.876 0 006.015-3.06.08.08 0 00.031-.055c.5-5.177-.838-9.673-3.548-13.675a.061.061 0 00-.031-.028zM8.02 15.33c-1.163 0-2.11-1.06-2.11-2.366 0-1.307.94-2.367 2.11-2.367 1.18 0 2.12 1.07 2.11 2.367 0 1.306-.94 2.366-2.11 2.366zm7.975 0c-1.163 0-2.11-1.06-2.11-2.366 0-1.307.94-2.367 2.11-2.367 1.18 0 2.12 1.07 2.11 2.367 0 1.306-.93 2.366-2.11 2.366z" fill="#5865F2"/></svg>
            </a>
          </div>
        </div>
      </div>

    </div>
  )
}

// SceneCycle renders short background clips of real 3D chickens
function SceneCycle({ index, onComplete }: { index: number; onComplete: () => void }) {
  // Timed transitions inside scenes if needed
  useFrame(({ clock }) => {
    // Could add per-scene timed transitions here
  })

  const commonChickenProps = {
    rotation: [0, 0, 0] as [number, number, number],
    disableBobbing: false,
    isPecking: false,
    isWalking: false,
    isJumping: false,
    isPlayer: false,
    health: 3,
    maxHealth: 3,
  }

  // Predeclare refs for all scenes to avoid conditional hook usage
  const arenaC1Ref = useRef<THREE.Group>(null)
  const arenaC2Ref = useRef<THREE.Group>(null)
  const arenaC3Ref = useRef<THREE.Group>(null)

  const forestF1Ref = useRef<THREE.Group>(null)
  const forestF2Ref = useRef<THREE.Group>(null)
  const forestF3Ref = useRef<THREE.Group>(null)

  const farmP1Ref = useRef<THREE.Group>(null)
  const farmI1Ref = useRef<THREE.Group>(null)
  const farmP2Ref = useRef<THREE.Group>(null)
  const farmI2Ref = useRef<THREE.Group>(null)

  if (index === 0) {
    // Scene 1: Arena - wide spacing, no overlaps
    return (
      <group>
        <ArenaEnvironment />
        {/* Pecking left foreground - well outside ring */}
        <group ref={arenaC1Ref} position={new THREE.Vector3(-6.5, 0.6, 0.5)} rotation={[0, -0.8, 0]}>
          <PixelChicken position={[0, 0, 0]} {...commonChickenProps} isPecking={true} colors={paletteByIndex(0)} />
        </group>
        {/* Idle right foreground - clear space */}
        <group ref={arenaC2Ref} position={new THREE.Vector3(7.0, 0.6, -0.5)} rotation={[0, -2.5, 0]}>
          <PixelChicken position={[0, 0, 0]} {...commonChickenProps} colors={paletteByIndex(1)} />
        </group>
        {/* Walking far background - completely separate path */}
        <WalkingChicken start={[8.0, 0.6, -6.5]} end={[-8.0, 0.6, -7.0]} duration={8} paletteIndex={2} avoidRefs={[arenaC1Ref, arenaC2Ref, arenaC3Ref]} avoidDist={3.0} />
        {/* Pecking deep background left - isolated */}
        <group ref={arenaC3Ref} position={new THREE.Vector3(-7.5, 0.6, -6.0)} rotation={[0, 1.5, 0]}>
          <PixelChicken position={[0, 0, 0]} {...commonChickenProps} isPecking={true} colors={paletteByIndex(3)} />
        </group>
        <SeparationController refs={[arenaC1Ref, arenaC2Ref, arenaC3Ref]} minDist={3.5} strength={0.1} clampY={0.6} obstacleFn={(p) => avoidArenaRing(p)} />
      </group>
    )
  }

  if (index === 1) {
    // Scene 2: Forest - chickens well-spread in clearings
    return (
      <group>
        <ForestEnvironment />
        {/* Walking wide diagonal - completely clear path */}
        <WalkingChicken start={[-6.0, 0.6, -1.0]} end={[6.0, 0.6, -1.5]} duration={9} paletteIndex={3} obstacleFn={obstacleFieldForest} avoidRefs={[forestF1Ref, forestF2Ref, forestF3Ref]} avoidDist={3.5} />
        {/* Pecking right clearing - isolated */}
        <group ref={forestF1Ref} position={new THREE.Vector3(3.0, 0.6, -4.0)} rotation={[0, 1.2, 0]}>
          <PixelChicken position={[0, 0, 0]} {...commonChickenProps} isPecking={true} colors={paletteByIndex(4)} />
        </group>
        {/* Idle deep left - away from action */}
        <group ref={forestF2Ref} position={new THREE.Vector3(-4.5, 0.6, -4.5)} rotation={[0, -2.2, 0]}>
          <PixelChicken position={[0, 0, 0]} {...commonChickenProps} colors={paletteByIndex(5)} />
        </group>
        {/* Curious center clearing - lots of space */}
        <CuriousChicken position={[0.2, 0.6, -2.8]} paletteIndex={1} rotation={[0, -0.5, 0]} />
        {/* Pecking left foreground - clear zone */}
        <group ref={forestF3Ref} position={new THREE.Vector3(-5.5, 0.6, -0.8)} rotation={[0, -1.8, 0]}>
          <PixelChicken position={[0, 0, 0]} {...commonChickenProps} isPecking={true} colors={paletteByIndex(0)} />
        </group>
        <SeparationController refs={[forestF1Ref, forestF2Ref, forestF3Ref]} minDist={3.5} strength={0.1} clampY={0.6} />
      </group>
    )
  }

  // Scene 3: Farm yard - extreme spacing, natural placement
  return (
    <group>
      <FarmyardEnvironment />
      {/* Curious near foreground left - lots of space */}
      <CuriousChicken position={[-5.0, 0.6, -0.5]} paletteIndex={5} rotation={[0, -2.2, 0]} />
      {/* Pecking far left - isolated near hay */}
      <group ref={farmP1Ref} position={new THREE.Vector3(-6.5, 0.6, -3.0)} rotation={[0, 1.5, 0]}>
        <PixelChicken position={[0, 0, 0]} {...commonChickenProps} isPecking={true} colors={paletteByIndex(0)} />
      </group>
      {/* Idle far right - well clear of fence */}
      <group ref={farmI1Ref} position={new THREE.Vector3(6.0, 0.6, -2.5)} rotation={[0, 2.3, 0]}>
        <PixelChicken position={[0, 0, 0]} {...commonChickenProps} colors={paletteByIndex(2)} />
      </group>
      {/* Walking deep background - separate from all others */}
      <WalkingChicken start={[-7.0, 0.6, -5.0]} end={[4.0, 0.6, -4.5]} duration={8} paletteIndex={4} obstacleFn={obstacleFieldFarm} avoidRefs={[farmP1Ref, farmI1Ref, farmP2Ref, farmI2Ref]} avoidDist={3.5} />
      {/* Pecking center open area - clear of trough */}
      <group ref={farmP2Ref} position={new THREE.Vector3(-0.5, 0.6, -3.2)} rotation={[0, -2.8, 0]}>
        <PixelChicken position={[0, 0, 0]} {...commonChickenProps} isPecking={true} colors={paletteByIndex(3)} />
      </group>
      {/* Idle right foreground - wide clearance */}
      <group ref={farmI2Ref} position={new THREE.Vector3(4.5, 0.6, -0.8)} rotation={[0, 0.8, 0]}>
        <PixelChicken position={[0, 0, 0]} {...commonChickenProps} colors={paletteByIndex(1)} />
      </group>
      <SeparationController refs={[farmP1Ref, farmI1Ref, farmP2Ref, farmI2Ref]} minDist={3.5} strength={0.1} clampY={0.6} obstacleFn={obstacleFieldFarm} />
    </group>
  )
}

// Moves and aims the main camera on spline-like tracks per scene
function CinematicCamera({ index, getProgress }: { index: number; getProgress: () => number }) {
  const { camera } = useThree()
  useFrame(() => {
    const t = getProgress()
    // Define per-scene camera rails (start -> end)
    let fromPos: THREE.Vector3
    let toPos: THREE.Vector3
    let fromLook: THREE.Vector3
    let toLook: THREE.Vector3
    if (index === 0) {
      fromPos = new THREE.Vector3(-3.5, 2.0, 4.5)
      toPos = new THREE.Vector3(3.2, 2.0, 4.2)
      fromLook = new THREE.Vector3(0, 0.8, -1.3)
      toLook = new THREE.Vector3(0.2, 0.8, -1.3)
    } else if (index === 1) {
      fromPos = new THREE.Vector3(0, 1.8, 5.6)
      toPos = new THREE.Vector3(0, 2.6, 3.8)
      fromLook = new THREE.Vector3(0, 0.7, -1.5)
      toLook = new THREE.Vector3(0, 0.9, -1.5)
    } else {
      // Farmyard: frame the barn prominently
      fromPos = new THREE.Vector3(3.0, 2.4, 6.8)
      toPos = new THREE.Vector3(-3.0, 2.6, 6.2)
      fromLook = new THREE.Vector3(0, 1.6, -7.0)
      toLook = new THREE.Vector3(0, 1.6, -7.0)
    }
    const pos = fromPos.clone().lerp(toPos, t)
    const look = fromLook.clone().lerp(toLook, t)
    camera.position.copy(pos)
    camera.lookAt(look)
  })
  return null
}

function WalkingChicken({ start, end, duration, paletteIndex, obstacleFn, avoidRefs, avoidDist = 0.9 }: { start: [number, number, number]; end: [number, number, number]; duration: number; paletteIndex: number; obstacleFn?: (p: THREE.Vector3) => THREE.Vector3; avoidRefs?: React.RefObject<THREE.Group>[]; avoidDist?: number }) {
  const ref = useRef<THREE.Group>(null)
  const startVec = new THREE.Vector3(...start)
  const endVec = new THREE.Vector3(...end)
  const total = duration
  const startTimeRef = useRef<number | null>(null)
  const avoidOffsetRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 0))
  
  useFrame(({ clock }) => {
    // Initialize start time on first frame
    if (startTimeRef.current === null) {
      startTimeRef.current = clock.getElapsedTime()
    }
    
    const elapsed = clock.getElapsedTime() - startTimeRef.current
    // Clamp t to [0, 1] - no looping, just freeze at end
    const t = Math.min(1, elapsed / total)
    
    let next = startVec.clone().lerp(endVec, t)
    next.y = 0.6
    
    if (obstacleFn) {
      next = obstacleFn(next)
      next.y = 0.6
    }
    
    // Smoothed avoidance to prevent erratic pathing
    if (avoidRefs && avoidRefs.length) {
      const desired = new THREE.Vector3(0, 0, 0)
      const maxPush = 0.6 // absolute cap on avoidance push magnitude
      avoidRefs.forEach(r => {
        const o = r.current
        if (!o) return
        const delta = next.clone().sub(o.position)
        delta.y = 0
        const dist2D = Math.max(0.0001, Math.hypot(delta.x, delta.z))
        if (dist2D < avoidDist) {
          const overlap = (avoidDist - dist2D) / avoidDist // 0..1
          // Quadratic falloff for gentle steering far away, stronger when close
          const push = Math.min(maxPush, overlap * overlap * maxPush)
          delta.normalize().multiplyScalar(push)
          desired.add(delta)
        }
      })
      // Limit instantaneous change and smooth over time
      desired.clampLength(0, 0.15) // per-frame cap to avoid sudden jumps
      avoidOffsetRef.current.lerp(desired, 0.12)
      next.add(avoidOffsetRef.current)
    }
    
    if (ref.current) {
      ref.current.position.copy(next)
      const dir = endVec.clone().sub(startVec).normalize()
      const angle = Math.atan2(dir.x, dir.z)
      ref.current.rotation.y = angle
      
      // Stop walking animation when reached end
      if (t >= 1) {
        // Chicken stops walking at destination
      }
    }
  })
  
  return (
    <group ref={ref} position={[0, 0, 0]}>
      <PixelChicken position={[0, 0, 0]} rotation={[0, 0, 0]} isWalking={true} disableBobbing={false} health={3} maxHealth={3} isPlayer={false} colors={paletteByIndex(paletteIndex)} />
    </group>
  )
}

function CuriousChicken({ position, paletteIndex, rotation }: { position: [number, number, number]; paletteIndex: number; rotation?: [number, number, number] }) {
  const ref = useRef<THREE.Group>(null)
  const lookTimer = useRef(0)
  const headTarget = useRef({ x: 0, y: 0 })
  const actionTimer = useRef(0)
  const [action, setAction] = useState<'idle' | 'pecking'>('idle')
  
  useFrame((_, delta) => {
    // Look around behavior
    lookTimer.current -= delta
    if (lookTimer.current <= 0) {
      headTarget.current.x = -0.5 + Math.random()
      headTarget.current.y = -0.5 + Math.random()
      lookTimer.current = 1 + Math.random() * 1.5
    }
    
    // Random action switching (idle <-> pecking)
    actionTimer.current -= delta
    if (actionTimer.current <= 0) {
      setAction(prev => prev === 'idle' ? 'pecking' : 'idle')
      actionTimer.current = 2 + Math.random() * 3
    }
  })
  
  return (
    <group ref={ref} position={position} rotation={rotation || [0, 0, 0]}>
      <PixelChicken 
        position={[0, 0, 0]} 
        rotation={[0, 0, 0]} 
        disableBobbing={false} 
        isPlayer={false} 
        health={3} 
        maxHealth={3} 
        colors={paletteByIndex(paletteIndex)} 
        isPecking={action === 'pecking'}
      />
    </group>
  )
}

// Enhanced separation controller with hard collisions - no overlap allowed
function SeparationController({ refs, minDist, strength, clampY, obstacleFn }: { refs: React.RefObject<THREE.Group>[]; minDist: number; strength: number; clampY?: number; obstacleFn?: (p: THREE.Vector3) => THREE.Vector3 }) {
  useFrame(() => {
    // Iterate multiple times for harder collision resolution
    for (let iter = 0; iter < 3; iter++) {
      const positions = refs.map(r => r.current?.position.clone() || new THREE.Vector3())
      for (let i = 0; i < refs.length; i++) {
        const ri = refs[i].current
        if (!ri) continue
        let pos = ri.position.clone()
        
        // Pairwise hard separation - 2D collision in XZ plane
        for (let j = 0; j < refs.length; j++) {
          if (i === j) continue
          const rj = refs[j].current
          if (!rj) continue
          
          const delta = pos.clone().sub(rj.position)
          delta.y = 0 // Only consider horizontal distance
          const dist = Math.max(0.0001, delta.length())
          
          if (dist < minDist) {
            // Hard push - exponential force as chickens get closer
            const overlap = minDist - dist
            const pushStrength = strength * (1 + overlap * 2)
            delta.normalize().multiplyScalar(overlap * pushStrength)
            pos.add(delta)
          }
        }
        
        // Clamp Y
        if (typeof clampY === 'number') pos.y = clampY
        
        // Obstacles adjustment
        if (obstacleFn) {
          pos = obstacleFn(pos)
          pos.y = clampY || pos.y
        }
        
        ri.position.copy(pos)
      }
    }
  })
  return null
}

// Arena obstacle avoidance: keep chickens outside of fence radius centered at (0,-2.0)
function avoidArenaRing(p: THREE.Vector3) {
  const center = new THREE.Vector3(0, p.y, -2.0)
  const fenceRadius = 5.8 // Slightly larger than fence at 5.5 to keep chickens clear
  const v = p.clone().sub(center)
  v.y = 0
  const d = Math.max(0.0001, v.length())
  if (d < fenceRadius) {
    v.normalize().multiplyScalar(fenceRadius)
    const adjusted = center.clone().add(v)
    adjusted.y = p.y
    return adjusted
  }
  return p
}

// Farm boundaries: keep in front of fence z > -4.2
function clampFarmBoundaries(p: THREE.Vector3) {
  if (p.z < -4.2) p.z = -4.2
  return p
}

// Forest obstacle steering: avoid tree trunks and the fallen log by pushing out radially
function obstacleFieldForest(p: THREE.Vector3) {
  const trunks = [
    new THREE.Vector3(-4.5, p.y, -3.0), new THREE.Vector3(4.2, p.y, -3.5),
    new THREE.Vector3(-5.5, p.y, -5.5), new THREE.Vector3(5.0, p.y, -5.2),
    new THREE.Vector3(-3.5, p.y, -7.0), new THREE.Vector3(3.8, p.y, -7.5),
    new THREE.Vector3(0.5, p.y, -8.5), new THREE.Vector3(-6, p.y, -1.5),
    new THREE.Vector3(6.2, p.y, -2)
  ]
  let out = p.clone()
  const trunkRadius = 0.6
  trunks.forEach(center => {
    const v = out.clone().sub(center)
    const d = v.length()
    if (d < trunkRadius) {
      v.normalize().multiplyScalar(trunkRadius)
      out = center.clone().add(v)
    }
  })
  // Fallen log at approx [-2.5, -1.5], radius-like push
  const logCenter = new THREE.Vector3(-2.5, p.y, -1.5)
  const v = out.clone().sub(logCenter)
  if (v.length() < 0.7) {
    v.normalize().multiplyScalar(0.7)
    out = logCenter.clone().add(v)
  }
  return out
}

// Farm obstacle steering: avoid barn face, fence rail line, water trough, hay bales
function obstacleFieldFarm(p: THREE.Vector3) {
  let out = p.clone()
  // Keep in front of fence
  if (out.z < -4.0) out.z = -4.0
  // Avoid barn face at z ~ -8 spanning x in [-4,4]
  if (out.z < -6.8 && Math.abs(out.x) < 4.5) {
    out.z = -6.8
  }
  // Avoid water trough at ~ [1.8, -1.2]
  const trough = new THREE.Vector3(1.8, p.y, -1.2)
  let v = out.clone().sub(trough)
  if (v.length() < 1.1) {
    v.normalize().multiplyScalar(1.1)
    out = trough.clone().add(v)
  }
  // Avoid hay bales with larger radius
  const hay = [new THREE.Vector3(-3.2, p.y, -2.0), new THREE.Vector3(3.5, p.y, -2.5), new THREE.Vector3(-4.2, p.y, -3.5)]
  hay.forEach(h => {
    const dv = out.clone().sub(h)
    if (dv.length() < 1.1) {
      dv.normalize().multiplyScalar(1.1)
      out = h.clone().add(dv)
    }
  })
  return out
}

// Simple cloud planes moving across the sky
function Clouds({ y = 6, count = 5, speed = 0.003 }: { y?: number; count?: number; speed?: number }) {
  const refs = useRef<THREE.Mesh[]>([])
  // Initialize random positions
  const inited = useRef(false)
  useFrame((state, delta) => {
    if (!inited.current) {
      refs.current.forEach((m, i) => {
        if (!m) return
        m.position.set(-10 + Math.random() * 20, y + Math.random() * 1.5, -6 + Math.random() * 4)
        m.scale.set(1 + Math.random() * 2, 0.6 + Math.random() * 0.6, 1)
      })
      inited.current = true
    }
    refs.current.forEach((m, i) => {
      if (!m) return
      m.position.x += speed * (0.5 + (i % 3) * 0.3)
      if (m.position.x > 12) m.position.x = -12
    })
  })
  return (
    <group>
      {Array.from({ length: count }).map((_, i) => (
        <mesh key={i} ref={(el) => { if (el) refs.current[i] = el }} position={[0, y, -6]} rotation={[-0.1, 0, 0]}>
          <planeGeometry args={[2.4, 1.2]} />
          <meshStandardMaterial color="#ffffff" transparent opacity={0.75} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}

function paletteByIndex(i: number) {
  const PALETTES = [
    { body: "#f97316", comb: "#ef4444", beak: "#FFD600", legs: "#FFD600", tail: "#6366f1", eyes: "#ffffff", pupils: "#222222" },
    { body: "#f59e0b", comb: "#b91c1c", beak: "#fbbf24", legs: "#fbbf24", tail: "#7c3aed", eyes: "#ffffff", pupils: "#111827" },
    { body: "#f8fafc", comb: "#dc2626", beak: "#facc15", legs: "#facc15", tail: "#3b82f6", eyes: "#ffffff", pupils: "#111827" },
    { body: "#1f2937", comb: "#ef4444", beak: "#f59e0b", legs: "#f59e0b", tail: "#10b981", eyes: "#e5e7eb", pupils: "#000000" },
    { body: "#60a5fa", comb: "#ef4444", beak: "#fbbf24", legs: "#fbbf24", tail: "#111827", eyes: "#ffffff", pupils: "#1f2937" },
    { body: "#10b981", comb: "#dc2626", beak: "#fbbf24", legs: "#fbbf24", tail: "#2563eb", eyes: "#ffffff", pupils: "#111827" }
  ]
  const idx = ((i % PALETTES.length) + PALETTES.length) % PALETTES.length
  return PALETTES[idx]
}

// Arena Environment - minimal, clean, with textures
function ArenaEnvironment() {
  let dirtTexture, sandTexture
  try {
    // Load dirt without Suspense to avoid hard crashes if asset fails
    dirtTexture = useMemo(() => {
      const loader = new TextureLoader()
      let tex: THREE.Texture | null = null
      try {
        tex = loader.load(
          '/textures/pixel-dirt.png',
          (t) => {
            t.wrapS = t.wrapT = THREE.RepeatWrapping
            t.repeat.set(20, 20)
            t.colorSpace = THREE.SRGBColorSpace
          },
          undefined,
          () => {
            // Fallback: mutate to brown canvas
            const canvas = document.createElement('canvas')
            canvas.width = 4; canvas.height = 4
            const ctx = canvas.getContext('2d')
            if (ctx) {
              ctx.fillStyle = '#8B7355'
              ctx.fillRect(0, 0, 4, 4)
            }
            if (tex) {
              tex.image = canvas
              tex.needsUpdate = true
              tex.wrapS = tex.wrapT = THREE.RepeatWrapping
              tex.repeat.set(20, 20)
              tex.colorSpace = THREE.SRGBColorSpace
            }
          }
        )
      } catch {}
      return tex as THREE.Texture
    }, [])
    sandTexture = useLoader(TextureLoader, '/textures/grass/Grass005_1K-PNG_Color.png')
    
    // Configure texture repeating for tiling
    sandTexture.wrapS = sandTexture.wrapT = THREE.RepeatWrapping
    sandTexture.repeat.set(2, 2)
  } catch (e) {
    console.warn('Texture loading failed, using fallback colors', e)
  }
  
  return (
    <group>
      {/* Ground - textured dirt floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[50, 50]} />
        <meshStandardMaterial map={dirtTexture || undefined} color="#8B7355" roughness={0.9} />
      </mesh>
      
      {/* Ring floor - textured sand circle (minimal, no obstructions) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, -2.0]} receiveShadow>
        <circleGeometry args={[4, 32]} />
        <meshStandardMaterial map={sandTexture || undefined} color="#D2B48C" roughness={0.95} />
      </mesh>
      
      {/* Wooden fence surrounding the arena - circular rails with texture */}
      <group position={[0, 0, -2.0]}>
        {/* Bottom rail ring - rotated to be horizontal */}
        <mesh position={[0, 0.4, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
          <torusGeometry args={[5.5, 0.08, 8, 48]} />
          <meshStandardMaterial map={dirtTexture || undefined} color="#8B4513" roughness={0.85} />
        </mesh>
        {/* Top rail ring - rotated to be horizontal */}
        <mesh position={[0, 0.9, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
          <torusGeometry args={[5.5, 0.08, 8, 48]} />
          <meshStandardMaterial map={dirtTexture || undefined} color="#8B4513" roughness={0.85} />
        </mesh>
        {/* Support posts around the circle */}
        {Array.from({ length: 16 }).map((_, i) => {
          const angle = (i / 16) * Math.PI * 2
          const x = Math.cos(angle) * 5.5
          const z = Math.sin(angle) * 5.5
          return (
            <mesh key={`post-${i}`} position={[x, 0.7, z]} castShadow receiveShadow>
              <cylinderGeometry args={[0.1, 0.1, 1.4, 8]} />
              <meshStandardMaterial map={sandTexture || undefined} color="#6b4423" roughness={0.9} />
            </mesh>
          )
        })}
      </group>
    </group>
  )
}

// Forest Environment - trees, grass, natural lighting with textures
function ForestEnvironment() {
  let grassTexture, barkTexture
  try {
    grassTexture = useLoader(TextureLoader, '/textures/grass/Grass005_1K-PNG_Color.png')
    barkTexture = useLoader(TextureLoader, '/textures/wood/WoodFloor044_1K-PNG_Color.png')
    
    // Configure texture repeating for tiling
    grassTexture.wrapS = grassTexture.wrapT = THREE.RepeatWrapping
    grassTexture.repeat.set(15, 15)
    barkTexture.wrapS = barkTexture.wrapT = THREE.RepeatWrapping
    barkTexture.repeat.set(1, 3)
  } catch (e) {
    console.warn('Forest texture loading failed, using fallback', e)
  }
  
  return (
    <group>
      {/* Grass ground - large plane with texture */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial 
          map={grassTexture || undefined} 
          color="#4caf50" 
          emissive="#2e7d32" 
          emissiveIntensity={0.15}
          roughness={0.95} 
        />
      </mesh>
      
      {/* Darker grass patches for variety */}
      {[[-4, -2.5], [5, -4], [-3, -6], [4, -7]].map(([x, z], i) => (
        <mesh key={`patch-${i}`} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.01, z]} receiveShadow>
          <circleGeometry args={[1.2, 16]} />
          <meshStandardMaterial color="#2f6838" roughness={0.95} />
        </mesh>
      ))}
      
      {/* Trees scattered around - varied sizes */}
      {[
        [-4.5, -3.0, 1.0], [4.2, -3.5, 0.9], [-5.5, -5.5, 1.1], [5.0, -5.2, 0.85], 
        [-3.5, -7.0, 0.95], [3.8, -7.5, 1.05], [0.5, -8.5, 1.15], [-6, -1.5, 0.9], [6.2, -2, 1.0]
      ].map(([x, z, scale], i) => (
        <group key={`tree-${i}`} position={[x, 0, z]} scale={[scale, scale, scale]}>
          {/* Tree trunk with bark texture */}
          <mesh castShadow position={[0, 1.4, 0]}>
            <cylinderGeometry args={[0.25, 0.32, 2.8, 10]} />
            <meshStandardMaterial map={barkTexture || undefined} color="#4a2511" roughness={0.9} />
          </mesh>
          {/* Foliage - layered fuller canopy */}
          <mesh position={[0, 2.8, 0]} castShadow>
            <coneGeometry args={[1.1, 1.8, 10]} />
            <meshStandardMaterial color="#2d5016" roughness={0.8} />
          </mesh>
          <mesh position={[0, 3.6, 0]} castShadow>
            <coneGeometry args={[0.85, 1.5, 10]} />
            <meshStandardMaterial color="#3a6b1f" roughness={0.8} />
          </mesh>
          <mesh position={[0, 4.3, 0]} castShadow>
            <coneGeometry args={[0.55, 1.0, 8]} />
            <meshStandardMaterial color="#4a7c29" roughness={0.75} />
          </mesh>
        </group>
      ))}
      
      {/* Bushes - more varied placement */}
      {[[-2.2, -1.2, 0.5], [2.5, -1.8, 0.6], [-3.0, -2.8, 0.55], [3.2, -3.2, 0.65], [-1.8, -4.5, 0.5], [2.0, -4.8, 0.6]].map(([x, z, scale], i) => (
        <mesh key={`bush-${i}`} position={[x, 0.35 * scale, z]} castShadow scale={[scale, scale, scale]}>
          <sphereGeometry args={[0.5, 10, 8]} />
          <meshStandardMaterial color="#4a7c29" roughness={0.85} />
        </mesh>
      ))}
      
      {/* Fallen log with bark texture */}
      <mesh position={[-2.5, 0.2, -1.5]} rotation={[0, 0.4, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.22, 0.22, 2.5, 10]} />
        <meshStandardMaterial map={barkTexture || undefined} color="#5a3a1a" roughness={0.9} />
      </mesh>
    </group>
  )
}

// Farmyard Environment - barn, fence, hay bales with textures
function FarmyardEnvironment() {
  let dirtTexture, woodTexture, roofTexture
  try {
    // Load dirt without Suspense to avoid hard crashes if asset fails
    dirtTexture = useMemo(() => {
      const loader = new TextureLoader()
      let tex: THREE.Texture | null = null
      try {
        tex = loader.load(
          '/textures/pixel-dirt.png',
          (t) => {
            t.wrapS = t.wrapT = THREE.RepeatWrapping
            t.repeat.set(18, 18)
            t.colorSpace = THREE.SRGBColorSpace
          },
          undefined,
          () => {
            const canvas = document.createElement('canvas')
            canvas.width = 4; canvas.height = 4
            const ctx = canvas.getContext('2d')
            if (ctx) {
              ctx.fillStyle = '#8B7355'
              ctx.fillRect(0, 0, 4, 4)
            }
            if (tex) {
              tex.image = canvas
              tex.needsUpdate = true
              tex.wrapS = tex.wrapT = THREE.RepeatWrapping
              tex.repeat.set(18, 18)
              tex.colorSpace = THREE.SRGBColorSpace
            }
          }
        )
      } catch {}
      return tex as THREE.Texture
    }, [])
    woodTexture = useLoader(TextureLoader, '/textures/wood/WoodFloor044_1K-PNG_Color.png')
    roofTexture = useLoader(TextureLoader, '/textures/wood/WoodFloor044_1K-PNG_Color.png')
    
    // Configure texture repeating
    woodTexture.wrapS = woodTexture.wrapT = THREE.RepeatWrapping
    woodTexture.repeat.set(2, 4)
    roofTexture.wrapS = roofTexture.wrapT = THREE.RepeatWrapping
    roofTexture.repeat.set(3, 1)
  } catch (e) {
    console.warn('Farm texture loading failed, using fallback', e)
  }
  
  return (
    <group>
      {/* Dirt ground - large extending with texture */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[55, 55]} />
        <meshStandardMaterial map={dirtTexture || undefined} color="#8B7355" roughness={0.95} />
      </mesh>
      
      {/* Barn backdrop - realistic gable roof and framed doors */}
      <group position={[0, 0, -8]}>
        {/* Main barn box with wood texture */}
        <mesh position={[0, 2.5, 0]} castShadow receiveShadow>
          <boxGeometry args={[8, 5, 1.2]} />
          <meshStandardMaterial map={woodTexture || undefined} color="#8B2500" roughness={0.85} />
        </mesh>
        {/* Door frame */}
        <group position={[0, 1.2, 0.61]}>
          {/* Frame border */}
          <mesh position={[0, 0, 0]} castShadow>
            <boxGeometry args={[2.4, 2.6, 0.1]} />
            <meshStandardMaterial color="#5a1a00" roughness={0.9} />
          </mesh>
          {/* Double doors inside frame */}
          <mesh position={[-0.6, 0, 0.08]} castShadow>
            <boxGeometry args={[1.1, 2.2, 0.08]} />
            <meshStandardMaterial color="#703a17" roughness={0.9} />
          </mesh>
          <mesh position={[0.6, 0, 0.08]} castShadow>
            <boxGeometry args={[1.1, 2.2, 0.08]} />
            <meshStandardMaterial color="#703a17" roughness={0.9} />
          </mesh>
        </group>
        {/* Gable roof: clean pitched roof with texture (lowered to meet barn body) */}
        <group position={[0, 4.7, 0]}>
          {/* Left roof slope with shingles */}
          <mesh position={[-2.2, 0.8, 0]} rotation={[0, 0, 0.52]} castShadow receiveShadow>
            <boxGeometry args={[4.8, 0.15, 1.6]} />
            <meshStandardMaterial map={roofTexture || undefined} color="#654321" roughness={0.9} />
          </mesh>
          {/* Right roof slope with shingles */}
          <mesh position={[2.2, 0.8, 0]} rotation={[0, 0, -0.52]} castShadow receiveShadow>
            <boxGeometry args={[4.8, 0.15, 1.6]} />
            <meshStandardMaterial map={roofTexture || undefined} color="#654321" roughness={0.9} />
          </mesh>
          {/* Ridge cap - wooden beam */}
          <mesh position={[0, 2.15, 0]} castShadow>
            <boxGeometry args={[0.25, 0.2, 1.65]} />
            <meshStandardMaterial color="#5a3a1a" roughness={0.9} />
          </mesh>
        </group>
        {/* Windows */}
        <mesh position={[-2.5, 3.5, 0.65]} castShadow>
          <boxGeometry args={[0.8, 0.6, 0.1]} />
          <meshStandardMaterial color="#222" roughness={0.5} />
        </mesh>
        <mesh position={[2.5, 3.5, 0.65]} castShadow>
          <boxGeometry args={[0.8, 0.6, 0.1]} />
          <meshStandardMaterial color="#222" roughness={0.5} />
        </mesh>
      </group>
      
      {/* Fence line - continuous wooden fence */}
      {[-5, -3.5, -2, -0.5, 1, 2.5, 4].map((x, i) => {
        const nextX = i < 6 ? [-3.5, -2, -0.5, 1, 2.5, 4, 5.5][i + 1] : x + 1.5
        const midX = (x + nextX) / 2
        const railLength = nextX - x
        return (
          <group key={`fence-${i}`} position={[x, 0, -4.5]}>
            {/* Fence post with texture */}
            <mesh castShadow receiveShadow position={[0, 0.7, 0]}>
              <cylinderGeometry args={[0.1, 0.1, 1.4, 8]} />
              <meshStandardMaterial map={woodTexture || undefined} color="#6b4423" roughness={0.9} />
            </mesh>
            {/* Horizontal rails connecting to next post */}
            {i < 6 && (
              <>
                <mesh position={[railLength / 2, 0.55, 0]} castShadow>
                  <boxGeometry args={[railLength, 0.1, 0.1]} />
                  <meshStandardMaterial color="#8B4513" roughness={0.85} />
                </mesh>
                <mesh position={[railLength / 2, 0.9, 0]} castShadow>
                  <boxGeometry args={[railLength, 0.1, 0.1]} />
                  <meshStandardMaterial color="#8B4513" roughness={0.85} />
                </mesh>
              </>
            )}
          </group>
        )
      })}
      
      {/* Hay bales - stacked and scattered */}
      <group position={[-3.2, 0, -2.0]}>
        <mesh position={[0, 0.35, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.8, 0.7, 1.0]} />
          <meshStandardMaterial color="#DAA520" roughness={0.95} />
        </mesh>
        <mesh position={[0, 1.05, 0.1]} castShadow receiveShadow>
          <boxGeometry args={[0.75, 0.65, 0.95]} />
          <meshStandardMaterial color="#D4AA3A" roughness={0.95} />
        </mesh>
      </group>
      <mesh position={[3.5, 0.35, -2.5]} castShadow receiveShadow>
        <boxGeometry args={[0.8, 0.7, 1.0]} />
        <meshStandardMaterial color="#DAA520" roughness={0.95} />
      </mesh>
      <mesh position={[-4.2, 0.35, -3.5]} castShadow receiveShadow>
        <boxGeometry args={[0.75, 0.65, 0.95]} />
        <meshStandardMaterial color="#D4AA3A" roughness={0.95} />
      </mesh>
      
      {/* Water trough - larger, more detailed */}
      <group position={[1.8, 0, -1.2]}>
        <mesh position={[0, 0.25, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.6, 0.5, 0.7]} />
          <meshStandardMaterial color="#708090" roughness={0.6} metalness={0.3} />
        </mesh>
        {/* Water inside */}
        <mesh position={[0, 0.45, 0]}>
          <boxGeometry args={[1.5, 0.05, 0.65]} />
          <meshStandardMaterial color="#4682B4" roughness={0.2} metalness={0.5} transparent opacity={0.8} />
        </mesh>
      </group>
      
      {/* Feed bucket */}
      <mesh position={[-1.5, 0.2, -0.5]} castShadow>
        <cylinderGeometry args={[0.25, 0.22, 0.4, 12]} />
        <meshStandardMaterial color="#8B7355" roughness={0.8} />
      </mesh>
    </group>
  )
}
