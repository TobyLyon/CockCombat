"use client"

import { useEffect, useRef, useState, useMemo } from "react"
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber"
import * as THREE from "three"
import { TextureLoader } from "three"
import { PixelChicken } from "@/components/3d/pixel-chicken-viewer"

export default function ArenaBackground() {
  const [sceneIndex, setSceneIndex] = useState(0)
  const [isMounted, setIsMounted] = useState(false)
  const [isVisible, setIsVisible] = useState(true)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const sceneTimerRef = useRef<number | null>(null)
  const sceneStartAtRef = useRef<number>(Date.now())
  const sceneEndAtRef = useRef<number>(Date.now() + 10000)

  useEffect(() => {
    // Delay mount to reduce initial WebGL context pressure
    const mountTimer = setTimeout(() => setIsMounted(true), 100)
    
    const schedule = () => {
      const delay = 9000 + Math.random() * 3000
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

    const onVisibility = () => setIsVisible(!document.hidden)
    document.addEventListener('visibilitychange', onVisibility)
    
    return () => { 
      clearTimeout(mountTimer)
      if (sceneTimerRef.current) window.clearTimeout(sceneTimerRef.current)
      setIsMounted(false)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none select-none" aria-hidden>
      {isMounted && (
      <Canvas 
        camera={{ position: [0, 2.2, 6], fov: 45 }}
        style={{ width: '100%', height: '100%' }}
        dpr={typeof window !== 'undefined' && window.devicePixelRatio > 1.5 ? [1, 1.5] : [1, 1.25]}
        gl={{ 
          antialias: false, // Reduce GPU load
          alpha: false, 
          powerPreference: 'high-performance', 
          preserveDrawingBuffer: false, 
          outputColorSpace: THREE.SRGBColorSpace,
          failIfMajorPerformanceCaveat: false
        }}
        eventSource={containerRef.current || undefined}
        eventPrefix="client"
        onCreated={({ gl }) => {
          try {
            const canvas = gl.getContext()?.canvas as HTMLCanvasElement | undefined
            if (canvas) {
              canvas.addEventListener('webglcontextlost', (e) => {
                console.warn('⚠️ WebGL context lost in ArenaBackground, preventing default')
                e.preventDefault()
              }, false)
              canvas.addEventListener('webglcontextrestored', () => {
                console.log('✅ WebGL context restored in ArenaBackground')
              }, false)
            }
          } catch (err) {
            console.error('Error setting up WebGL context handlers:', err)
          }
        }}
        shadows={false}
      >
        {isVisible && (
        <CinematicCamera 
          index={sceneIndex}
          getProgress={() => {
            const now = Date.now()
            const start = sceneStartAtRef.current
            const end = sceneEndAtRef.current
            const duration = Math.max(1, end - start)
            const t = Math.max(0, Math.min(1, (now - start) / duration))
            return t * t * (3 - 2 * t)
          }}
        />)}
        <color attach="background" args={["#87CEEB"]} />
        <ambientLight intensity={0.9} />
        <directionalLight position={[8, 12, 6]} intensity={1.4} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} shadow-camera-far={50} shadow-camera-left={-15} shadow-camera-right={15} shadow-camera-top={15} shadow-camera-bottom={-15} />
        <hemisphereLight args={["#87CEEB", "#4a7c29", 0.3]} />
        <fog attach="fog" args={["#B0D4E3", 14, 38]} />
        {sceneIndex === 0 && <PastureScene />}
        {sceneIndex === 1 && <ForestScene />}
        {sceneIndex === 2 && <FarmyardScene />}
      </Canvas>
      )}
    </div>
  )
}

function CinematicCamera({ index, getProgress }: { index: number; getProgress: () => number }) {
  const { camera } = useThree()
  useFrame(() => {
    const t = getProgress()
    let fromPos: THREE.Vector3
    let toPos: THREE.Vector3
    let fromLook: THREE.Vector3
    let toLook: THREE.Vector3
    if (index === 0) {
      fromPos = new THREE.Vector3(-3.5, 2.0, 4.5)
      toPos = new THREE.Vector3(3.2, 2.0, 4.2)
      fromLook = new THREE.Vector3(0, 0.8, -1.8)
      toLook = new THREE.Vector3(0.2, 0.8, -1.8)
    } else if (index === 1) {
      fromPos = new THREE.Vector3(0, 1.9, 5.6)
      toPos = new THREE.Vector3(0, 2.5, 3.9)
      fromLook = new THREE.Vector3(0, 0.7, -1.5)
      toLook = new THREE.Vector3(0, 0.9, -1.5)
    } else {
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

function paletteByIndex(i: number) {
  const PALETTES = [
    { body: "#f97316", comb: "#ef4444", beak: "#FFD600", legs: "#FFD600", tail: "#6366f1", eyes: "#ffffff", pupils: "#222222" },
    { body: "#f59e0b", comb: "#b91c1c", beak: "#fbbf24", legs: "#fbbf24", tail: "#7c3aed", eyes: "#ffffff", pupils: "#111827" },
    { body: "#f8fafc", comb: "#dc2626", beak: "#facc15", legs: "#facc15", tail: "#3b82f6", eyes: "#ffffff", pupils: "#111827" },
    { body: "#1f2937", comb: "#ef4444", beak: "#f59e0b", legs: "#f59e0b", tail: "#10b981", eyes: "#e5e7eb", pupils: "#000000" },
  ]
  const idx = ((i % PALETTES.length) + PALETTES.length) % PALETTES.length
  return PALETTES[idx]
}

function PastureScene() {
  const grassTexture = useLoader(TextureLoader, '/textures/grass/Grass005_1K-PNG_Color.png')
  const dirtTexture = useMemo(() => {
    const loader = new TextureLoader()
    let loaded: THREE.Texture | null = null
    try {
      loaded = loader.load(
        '/textures/pixel-dirt.png',
        (t) => {
          t.colorSpace = THREE.SRGBColorSpace
          t.wrapS = t.wrapT = THREE.RepeatWrapping
          t.repeat.set(2, 2)
        },
        undefined,
        () => {
          // Fallback: mutate the same texture to a brown canvas so the material map remains valid
          const canvas = document.createElement('canvas')
          canvas.width = 4; canvas.height = 4
          const ctx = canvas.getContext('2d')
          if (ctx) {
            ctx.fillStyle = '#8B7355'
            ctx.fillRect(0, 0, 4, 4)
          }
          if (loaded) {
            ;(loaded as THREE.Texture).image = canvas
            loaded.needsUpdate = true
            loaded.colorSpace = THREE.SRGBColorSpace
            loaded.wrapS = loaded.wrapT = THREE.RepeatWrapping
            loaded.repeat.set(2, 2)
          }
        }
      )
    } catch {}
    return loaded as THREE.Texture
  }, [])
  grassTexture.colorSpace = THREE.SRGBColorSpace
  grassTexture.wrapS = grassTexture.wrapT = THREE.RepeatWrapping
  grassTexture.generateMipmaps = true
  grassTexture.minFilter = THREE.LinearMipmapLinearFilter
  grassTexture.magFilter = THREE.LinearFilter
  grassTexture.repeat.set(12, 12)
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial 
          map={grassTexture} 
          color="#4caf50" 
          emissive="#2e7d32" 
          emissiveIntensity={0.15}
          roughness={0.95} 
        />
      </mesh>
      {/* Sparse chickens */}
      <group position={[-3.2, 0.6, -2.2]} rotation={[0, -0.6, 0]}>
        <PixelChicken position={[0, 0, 0]} isPecking={true} colors={paletteByIndex(0)} health={3} maxHealth={3} isPlayer={false} />
      </group>
      <group position={[4.2, 0.6, -3.5]} rotation={[0, 1.2, 0]}>
        <PixelChicken position={[0, 0, 0]} colors={paletteByIndex(1)} health={3} maxHealth={3} isPlayer={false} />
      </group>
      {/* Distant path circle */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, -3.0]} receiveShadow>
        <circleGeometry args={[3.5, 32]} />
        <meshStandardMaterial map={dirtTexture} color="#D2B48C" roughness={0.95} />
      </mesh>
    </group>
  )
}

function ForestScene() {
  const grassTexture = useLoader(TextureLoader, '/textures/grass/Grass005_1K-PNG_Color.png')
  const barkTexture = useLoader(TextureLoader, '/textures/wood/WoodFloor044_1K-PNG_Color.png')
  grassTexture.colorSpace = THREE.SRGBColorSpace
  barkTexture.colorSpace = THREE.SRGBColorSpace
  grassTexture.wrapS = grassTexture.wrapT = THREE.RepeatWrapping
  grassTexture.generateMipmaps = true
  grassTexture.minFilter = THREE.LinearMipmapLinearFilter
  grassTexture.magFilter = THREE.LinearFilter
  grassTexture.repeat.set(12, 12)
  barkTexture.wrapS = barkTexture.wrapT = THREE.RepeatWrapping
  barkTexture.generateMipmaps = true
  barkTexture.minFilter = THREE.LinearMipmapLinearFilter
  barkTexture.magFilter = THREE.LinearFilter
  barkTexture.repeat.set(1, 3)
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial 
          map={grassTexture} 
          color="#4caf50" 
          emissive="#2e7d32" 
          emissiveIntensity={0.15}
          roughness={0.95} 
        />
      </mesh>
      {/* Few trees to frame edges */}
      {[
        [-4.2, -3.0, 1.0], [4.2, -3.5, 0.95], [-5.0, -5.5, 1.05], [5.0, -5.2, 0.9]
      ].map(([x, z, s], i) => (
        <group key={`t-${i}`} position={[x, 0, z]} scale={[s as number, s as number, s as number]}>
          <mesh castShadow position={[0, 1.3, 0]}>
            <cylinderGeometry args={[0.22, 0.28, 2.6, 10]} />
            <meshStandardMaterial map={barkTexture} color="#4a2511" roughness={0.9} />
          </mesh>
          <mesh position={[0, 2.7, 0]} castShadow>
            <coneGeometry args={[1.0, 1.6, 10]} />
            <meshStandardMaterial color="#2d5016" roughness={0.8} />
          </mesh>
        </group>
      ))}
      {/* Single curious chicken */}
      <group position={[0.5, 0.6, -2.8]} rotation={[0, -0.3, 0]}>
        <PixelChicken position={[0, 0, 0]} colors={paletteByIndex(2)} health={3} maxHealth={3} isPlayer={false} />
      </group>
    </group>
  )
}

function FarmyardScene() {
  const dirtTexture = useMemo(() => {
    const loader = new TextureLoader()
    let loaded: THREE.Texture | null = null
    try {
      loaded = loader.load(
        '/textures/pixel-dirt.png',
        (t) => {
          t.colorSpace = THREE.SRGBColorSpace
          t.wrapS = t.wrapT = THREE.RepeatWrapping
          t.repeat.set(18, 18)
        },
        undefined,
        () => {
          // Fallback: mutate the same texture to a brown canvas
          const canvas = document.createElement('canvas')
          canvas.width = 4; canvas.height = 4
          const ctx = canvas.getContext('2d')
          if (ctx) {
            ctx.fillStyle = '#8B7355'
            ctx.fillRect(0, 0, 4, 4)
          }
          if (loaded) {
            ;(loaded as THREE.Texture).image = canvas
            loaded.needsUpdate = true
            loaded.colorSpace = THREE.SRGBColorSpace
            loaded.wrapS = loaded.wrapT = THREE.RepeatWrapping
            loaded.repeat.set(18, 18)
          }
        }
      )
    } catch {}
    return loaded as THREE.Texture
  }, [])
  const woodTexture = useLoader(TextureLoader, '/textures/wood/WoodFloor044_1K-PNG_Color.png')
  woodTexture.colorSpace = THREE.SRGBColorSpace
  woodTexture.wrapS = woodTexture.wrapT = THREE.RepeatWrapping
  woodTexture.generateMipmaps = true
  woodTexture.minFilter = THREE.LinearMipmapLinearFilter
  woodTexture.magFilter = THREE.LinearFilter
  woodTexture.repeat.set(2, 4)
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[55, 55]} />
        <meshStandardMaterial map={dirtTexture} color="#8B7355" roughness={0.95} />
      </mesh>
      {/* Simple realistic barn */}
      <group position={[0, 0, -10]}>
        {/* Body */}
        <mesh position={[0, 2.5, 0]} castShadow receiveShadow>
          <boxGeometry args={[8, 5, 6]} />
          <meshStandardMaterial map={woodTexture} color="#B22222" roughness={0.8} />
        </mesh>
        {/* Gable roof */}
        <mesh position={[0, 5.5, 0]} rotation={[0, 0, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0, 5.5, 6.4, 4]} />
          <meshStandardMaterial color="#5b3a29" roughness={0.9} />
        </mesh>
        {/* Front door */}
        <mesh position={[0, 1.5, 3.05]} castShadow>
          <boxGeometry args={[2.2, 3, 0.1]} />
          <meshStandardMaterial color="#8B0000" roughness={0.85} />
        </mesh>
        {/* Simple windows */}
        {[-2.5, 2.5].map((x, i) => (
          <mesh key={`w-${i}`} position={[x, 2.8, 3.06]}>
            <boxGeometry args={[1.2, 0.9, 0.1]} />
            <meshStandardMaterial color="#f0f8ff" roughness={0.2} />
          </mesh>
        ))}
      </group>
      {/* Fence line */}
      {[-5, -2, 1, 4].map((x, i) => (
        <group key={`f-${i}`} position={[x, 0, -4.5]}>
          <mesh castShadow receiveShadow position={[0, 0.7, 0]}>
            <cylinderGeometry args={[0.1, 0.1, 1.4, 8]} />
            <meshStandardMaterial map={woodTexture} color="#6b4423" roughness={0.9} />
          </mesh>
          {i < 3 && (
            <>
              <mesh position={[1.5, 0.55, 0]} castShadow>
                <boxGeometry args={[3.0, 0.1, 0.1]} />
                <meshStandardMaterial color="#8B4513" roughness={0.85} />
              </mesh>
              <mesh position={[1.5, 0.9, 0]} castShadow>
                <boxGeometry args={[3.0, 0.1, 0.1]} />
                <meshStandardMaterial color="#8B4513" roughness={0.85} />
              </mesh>
            </>
          )}
        </group>
      ))}
      {/* A couple of chickens */}
      <group position={[-5.0, 0.6, -0.8]} rotation={[0, -2.0, 0]}>
        <PixelChicken position={[0, 0, 0]} colors={paletteByIndex(3)} health={3} maxHealth={3} isPlayer={false} />
      </group>
      <group position={[3.8, 0.6, -1.2]} rotation={[0, 0.8, 0]}>
        <PixelChicken position={[0, 0, 0]} colors={paletteByIndex(1)} health={3} maxHealth={3} isPlayer={false} />
      </group>
    </group>
  )
}


