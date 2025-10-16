"use client"

import React, { Suspense } from "react"
import { useRef, useState, useEffect, useMemo, useCallback } from "react"
import * as THREE from "three"
import { useFrame, useThree, Canvas } from "@react-three/fiber"
import { 
  OrbitControls, 
  PerspectiveCamera, 
  Plane, 
  Box, 
  Text, 
  useKeyboardControls, 
  Environment,
  Cylinder,
  Billboard,
  KeyboardControls,
  useTexture,
  Sphere,
  SpotLight,
  Instances,
  Instance,
  Html
} from "@react-three/drei"
import { PixelChicken } from "../3d/pixel-chicken-viewer"
import { ArrowLeft } from "lucide-react";
import { PlayerStatus } from "@/contexts/GameStateContext"
import { useSocket } from "@/hooks/use-socket"
import { ARENA_CONFIG } from "@/mocks/game-data"
import PoofEffect from '../effects/poof-effect'; // Import the poof effect
import { useTexturePreloader } from '@/hooks/use-texture-preloader';

// Define the arena props interface - Keep for now, might simplify later
interface EnhancedArenaSceneProps {
  gameState: string;
  playerPosition?: THREE.Vector3; // Make optional instead of null
  playerRotation?: THREE.Euler | [number, number, number]; // Accept Euler or array
  playerChicken: any; // Use any type for now until we define ChickenData properly
  isJumping?: boolean; // Add jumping animation flag
  isPecking?: boolean; // Add pecking animation flag
  onExit?: () => void;
  playSound?: (sound: string) => void;
  onPlayerDamage?: (targetPlayerId: string, damageAmount?: number) => void; // Add damage callback prop
  players?: PlayerStatus[]; // Add players array prop
  onDrumstickCollected?: (id: string) => void; // Add collection callback
}

// Define controls
enum Controls {
  forward = "forward",
  backward = "backward",
  left = "left",
  right = "right",
  jump = "jump",
  peck = "peck", // Attack control
}

// Define keyboard controls map type explicitly
type ControlMapItem = { name: Controls; keys: string[] };

const controlsMap: ControlMapItem[] = [
  { name: Controls.forward, keys: ["ArrowUp", "KeyW"] },
  { name: Controls.backward, keys: ["ArrowDown", "KeyS"] },
  { name: Controls.left, keys: ["ArrowLeft", "KeyA"] },
  { name: Controls.right, keys: ["ArrowRight", "KeyD"] },
  { name: Controls.jump, keys: ["Space"] }, // Space for jumping
  { name: Controls.peck, keys: ["ShiftLeft", "ShiftRight", "Mouse0"] } // Shift or left mouse click for pecking
];

// Rotation sensitivity (radians per second)
const ROTATION_SPEED = 1.2;

interface SceneContentAndLogicProps extends EnhancedArenaSceneProps {
  onPlayerDamage?: (targetPlayerId: string, damageAmount?: number) => void;
  players?: PlayerStatus[]; // Ensure players is also defined here (or inherit properly)
}

// Game states
enum GameState {
  PREVIEW = 'preview',
  COUNTDOWN = 'countdown',
  PLAYING = 'playing',
  ENDED = 'ended'
}

// Arena configuration constants are now imported from mocks/game-data.ts

// Replace the ArenaFloor component to use the optimized texture loading
function ArenaFloor({ lowPerf = false }: { lowPerf?: boolean }) {
  const floorTexture = useTexture("/textures/grass/Grass005_1K-PNG_Color.png");
  const dirtTexture = useTexture("/textures/ground/Ground085_1K-PNG_Color.png");

  // Apply texture settings directly to the loaded texture
  useEffect(() => {
    if (floorTexture) {
      // Ensure correct color space for PBR albedo
      try { (floorTexture as any).colorSpace = THREE.SRGBColorSpace } catch {}
      floorTexture.wrapS = floorTexture.wrapT = THREE.RepeatWrapping;
      floorTexture.repeat.set(12, 12);
      floorTexture.anisotropy = lowPerf ? 2 : 4;
      floorTexture.generateMipmaps = true;
      floorTexture.minFilter = THREE.LinearMipmapLinearFilter;
      floorTexture.magFilter = THREE.LinearFilter;
      floorTexture.needsUpdate = true;
    }
    if (dirtTexture) {
      // Ensure correct color space for PBR albedo
      try { (dirtTexture as any).colorSpace = THREE.SRGBColorSpace } catch {}
      dirtTexture.wrapS = dirtTexture.wrapT = THREE.RepeatWrapping;
      dirtTexture.repeat.set(10, 10);
      dirtTexture.anisotropy = lowPerf ? 2 : 4;
      dirtTexture.generateMipmaps = true;
      dirtTexture.minFilter = THREE.LinearMipmapLinearFilter;
      dirtTexture.magFilter = THREE.LinearFilter;
      dirtTexture.needsUpdate = true;
    }
  }, [floorTexture, dirtTexture, lowPerf]);

  return (
    <group>
      {/* Grass annulus (reduced extent) */}
      <Plane args={[600, 600]} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow castShadow>
        <meshStandardMaterial map={floorTexture} roughness={0.95} metalness={0.05} />
      </Plane>
      {/* Dirt in-fighting ring (slightly smaller circle) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow castShadow>
        <circleGeometry args={[ARENA_CONFIG.ringRadius * 0.9, 64]} />
        <meshStandardMaterial map={dirtTexture} roughness={0.98} metalness={0.02} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
      </mesh>
    </group>
  );
}

// Simple, realistic barn component reused across scenes
function SimpleBarn({ position = [0,0,0] as [number, number, number] }) {
  const woodTexture = useTexture("/textures/wood/WoodFloor044_1K-PNG_Color.png");
  useEffect(() => {
    if (woodTexture) {
      woodTexture.wrapS = woodTexture.wrapT = THREE.RepeatWrapping;
      woodTexture.generateMipmaps = true;
      woodTexture.minFilter = THREE.LinearMipmapLinearFilter;
      woodTexture.magFilter = THREE.LinearFilter;
      woodTexture.needsUpdate = true;
    }
  }, [woodTexture]);
  return (
    <group position={position}>
      {/* Body */}
      <mesh position={[0, 2.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[8, 5, 6]} />
        <meshStandardMaterial map={woodTexture} color="#B22222" roughness={0.8} />
      </mesh>
      {/* Gable roof: two sloped panels + ridge cap to avoid clipping */}
      {/* Left slope */}
      <mesh position={[-2.2, 5.6, 0]} rotation={[0, 0, Math.PI / 6]} castShadow receiveShadow>
        <boxGeometry args={[4.6, 0.2, 6.4]} />
        <meshStandardMaterial color="#5b3a29" roughness={0.9} />
      </mesh>
      {/* Right slope */}
      <mesh position={[2.2, 5.6, 0]} rotation={[0, 0, -Math.PI / 6]} castShadow receiveShadow>
        <boxGeometry args={[4.6, 0.2, 6.4]} />
        <meshStandardMaterial color="#5b3a29" roughness={0.9} />
      </mesh>
      {/* Ridge cap */}
      <mesh position={[0, 6.05, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.25, 0.2, 6.5]} />
        <meshStandardMaterial color="#4a3621" roughness={0.85} />
      </mesh>
      {/* Front door */}
      <mesh position={[0, 1.5, 3.05]} castShadow>
        <boxGeometry args={[2.2, 3, 0.1]} />
        <meshStandardMaterial color="#8B0000" roughness={0.85} />
      </mesh>
      {/* Simple windows */}
      {[-2.5, 2.5].map((x, i) => (
        <mesh key={`w2-${i}`} position={[x, 2.8, 3.06]}>
          <boxGeometry args={[1.2, 0.9, 0.1]} />
          <meshStandardMaterial color="#f0f8ff" roughness={0.2} />
        </mesh>
      ))}
    </group>
  )
}

function SceneContent({
  playerChicken,
  gameState,
  onExit,
  playSound,
  onPlayerDamage,
  players = [],
  onDrumstickCollected // Destructure callback
}: SceneContentAndLogicProps) {
  // ALL HOOKS MUST BE CALLED AT THE TOP, UNCONDITIONALLY
  // Track player death position for static corpse rendering when spectating
  const deathPosRef = useRef<THREE.Vector3 | null>(null)
  const { isLoading: texturesLoading, error: textureError } = useTexturePreloader([
    'ARENA_FLOOR',
    'STONE',
    'WOOD',
    'DIRT',
  ]);

  const playerRef = useRef<THREE.Group>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  const { camera } = useThree(); // R3F hook

  // Movement and physics state
  const [velocity, setVelocity] = useState(new THREE.Vector3(0, 0, 0));
  const [onGround, setOnGround] = useState(true);
  const [isWalking, setIsWalking] = useState(false);
  const [isCollidingWithBoundary, setIsCollidingWithBoundary] = useState(false);

  // Track previous position to detect movement
  const prevPosition = useRef(new THREE.Vector3());
  const prevRotationY = useRef<number>(0);
  const lastEmitAtRef = useRef<number>(0);
  const lastSentRef = useRef({ x: 0, y: 0.85, z: 0, ry: 0, pk: false, jp: false });
  const remoteHumansRef = useRef<Record<string, { pos: THREE.Vector3; rotY: number; isPecking: boolean; ts: number }>>({})
  // Synced round start epoch for universal countdown
  const roundStartAtMsRef = useRef<number | null>(null)
  const [syncedCountdown, setSyncedCountdown] = useState<number | null>(null)

  // Get keyboard controls state directly (Drei hook)
  const forward = useKeyboardControls<Controls>(state => state.forward);
  const backward = useKeyboardControls<Controls>(state => state.backward);
  const left = useKeyboardControls<Controls>(state => state.left);
  const right = useKeyboardControls<Controls>(state => state.right);
  const jumpKey = useKeyboardControls<Controls>(state => state.jump);
  const peckKey = useKeyboardControls<Controls>(state => state.peck);

  // Store previous state for peck animation
  const wasPecking = useRef(false);
  const lastWalkingRef = useRef<boolean>(false);
  const lastWalkingSetAtRef = useRef<number>(0);

  // Self-contained movement state
  const [selfPosition, setSelfPosition] = useState(() => {
    return playerChicken?.position ?
      new THREE.Vector3(playerChicken.position.x, playerChicken.position.y, playerChicken.position.z) :
      new THREE.Vector3(0, 0.85, 0); // Default fallback
  });
  const [selfRotation, setSelfRotation] = useState(() => {
    return playerChicken?.rotation ?
      new THREE.Euler(playerChicken.rotation.x, playerChicken.rotation.y, playerChicken.rotation.z) :
      new THREE.Euler(0, 0, 0); // Default fallback
  });
  const [selfIsJumping, setSelfIsJumping] = useState(false);
  const [selfIsPecking, setSelfIsPecking] = useState(false);
  const selfVelocity = useRef(new THREE.Vector3(0, 0, 0));

  // Reusable vector objects to reduce garbage collection
  const cameraTargetPosition = useRef<THREE.Vector3 | null>(null);
  const lookAtPosition = useRef<THREE.Vector3 | null>(null);

  const lastUpdateTime = useRef(Date.now());
  // Round start freeze/invulnerability (driven by server epoch)
  const freezeUntilRef = useRef<number>(0)
  const invulnerableUntilRef = useRef<number>(0)
  const hasArmedCountdownRef = useRef<boolean>(false)

  // Do NOT locally arm countdown; rely on server-provided epoch broadcast
  useEffect(() => {
    if (gameState === 'battle' && !hasArmedCountdownRef.current) {
      // Keep armed flag to avoid re-initialization loops; actual times set when socket events arrive
      hasArmedCountdownRef.current = true
    }
  }, [gameState])

  // Remove synthesized local countdown; wait for server epoch via socket events
  useEffect(() => {
    // Intentional no-op: countdown will be set from 'arena_lock_roster'/'round_start' events only
    if (gameState !== 'battle') {
      roundStartAtMsRef.current = null
      setSyncedCountdown(null)
    }
  }, [gameState])

  // Initialize from cached start epoch if present (guards late scene entry)
  useEffect(() => {
    if (gameState === 'battle') {
      try {
        const startAt = (window as any)?.__last_round_start_at
        if (typeof startAt === 'number' && startAt > Date.now()) {
          roundStartAtMsRef.current = startAt
          freezeUntilRef.current = startAt
          invulnerableUntilRef.current = startAt + 1000
          setSyncedCountdown(Math.max(0, Math.ceil((startAt - Date.now()) / 1000)))
        }
      } catch {}
    }
  }, [gameState])

  // Snap player to assigned spawn when battle starts or spawn data changes
  useEffect(() => {
    if (gameState !== 'battle') return
    const toVec3 = (p: any): THREE.Vector3 | null => {
      if (!p) return null
      if (p instanceof THREE.Vector3) return p.clone()
      if (Array.isArray(p) && p.length >= 3) return new THREE.Vector3(p[0], p[1], p[2])
      if (typeof p === 'object' && 'x' in p && 'y' in p && 'z' in p) return new THREE.Vector3(p.x, p.y, p.z)
      return null
    }
    const toEuler = (r: any): THREE.Euler | null => {
      if (!r) return null
      if (r instanceof THREE.Euler) return new THREE.Euler(r.x, r.y, r.z)
      if (Array.isArray(r) && r.length >= 3) return new THREE.Euler(r[0], r[1], r[2])
      if (typeof r === 'object' && 'x' in r && 'y' in r && 'z' in r) return new THREE.Euler(r.x, r.y, r.z)
      return null
    }
    const spawnPos = toVec3(playerChicken?.position)
    const spawnRot = toEuler(playerChicken?.rotation)
    if (spawnPos) {
      setSelfPosition(spawnPos.clone())
      if (playerRef.current) playerRef.current.position.copy(spawnPos)
    }
    if (spawnRot) {
      setSelfRotation(new THREE.Euler(spawnRot.x, spawnRot.y, spawnRot.z))
      if (playerRef.current) playerRef.current.rotation.set(spawnRot.x, spawnRot.y, spawnRot.z)
    }
  }, [gameState, playerChicken?.position, playerChicken?.rotation])

  // Note: Do not access app contexts inside R3F Canvas; it runs on a separate React root.

  // Game state (consider if these should come from context or props if they are managed elsewhere)
  const [playerHealth, setPlayerHealth] = useState(3);
  const [remainingPlayers, setRemainingPlayers] = useState(8);
  const [matchTime, setMatchTime] = useState(180); // 3 minutes
  const [isWinner, setIsWinner] = useState(false);
  const [prizePool, setPrizePool] = useState(8); // 1 $COCK per player

  // Collision objects
  const collisionObjects = useRef<THREE.Object3D[]>([]);

  // MemeSky definition using useMemo
  const MemeSky = useMemo(() => {
    return function SkyComponent() { 
        return (
            <group>
                {/* Sky dome */}
                <mesh position={[0, 0, 0]}>
                    <sphereGeometry args={[80, 16, 16]} />
                    <meshBasicMaterial color="#5DADE2" side={THREE.BackSide} />
                </mesh>
                {/* Meme sun */}
                <group position={[40, 50, -60]}>
                    <mesh><sphereGeometry args={[10, 16, 16]} /><meshBasicMaterial color="#FFD700" /></mesh>
                    <mesh position={[-3, 2, 9]}><sphereGeometry args={[1.5, 8, 8]} /><meshBasicMaterial color="#000000" /></mesh>
                    <mesh position={[3, 2, 9]}><sphereGeometry args={[1.5, 8, 8]} /><meshBasicMaterial color="#000000" /></mesh>
                    <mesh position={[0, -2, 9]}><torusGeometry args={[4, 0.8, 8, 12, Math.PI]} /><meshBasicMaterial color="#000000" /></mesh>
                    {[...Array(8)].map((_, i) => {
                        const angle = (i / 8) * Math.PI * 2; const r = 14;
                        return <mesh key={`ray-${i}`} position={[Math.cos(angle) * r, Math.sin(angle) * r, 0]} rotation={[0, 0, angle]}><boxGeometry args={[5, 1, 1]} /><meshBasicMaterial color="#FFD700" /></mesh>;
                    })}
                </group>
                {/* Clouds */}
                {[...Array(5)].map((_, i) => {
                    const ox = (i - 2) * 30; const oz = (Math.sin(i * 0.7) * 40) - 30;
                    const oy = 35 + (i * 2); const s = 0.6 + (Math.random() * 0.6);
                    return (
                        <group key={`cloud-${i}`} position={[ox, oy, oz]} scale={[s, s, s]}>
                            <mesh position={[0,0,0]}><sphereGeometry args={[7,8,8]}/><meshBasicMaterial color="white"/></mesh>
                            <mesh position={[-6,0,0]}><sphereGeometry args={[5,8,8]}/><meshBasicMaterial color="white"/></mesh>
                            <mesh position={[6,0,0]}><sphereGeometry args={[5,8,8]}/><meshBasicMaterial color="white"/></mesh>
                            <mesh position={[-3,4,0]}><sphereGeometry args={[5,8,8]}/><meshBasicMaterial color="white"/></mesh>
                            <mesh position={[3,4,0]}><sphereGeometry args={[5,8,8]}/><meshBasicMaterial color="white"/></mesh>
                        </group>
                    );
                })}
                {/* Hills */}
                {[...Array(5)].map((_, i) => {
                    const oz = -(i * 30) - 50; const w = 500; const h = 15 + (i * 2);
                    const hillColor = i % 2 === 0 ? "#4a7c59" : "#3e6b4c";
                    return <mesh key={`hill-${i}`} position={[0,-10+(i*1.5),oz]}><cylinderGeometry args={[w,w,h,32,1,true,0,Math.PI]}/><meshBasicMaterial color={hillColor} side={THREE.DoubleSide}/></mesh>;
                })}
                {/* Farm */}
                <group position={[-50,-5,-100]}>
                    <mesh position={[0,10,0]}><boxGeometry args={[20,20,20]}/><meshBasicMaterial color="#E74C3C"/></mesh>
                    <mesh position={[0,25,0]} rotation={[0,Math.PI/4,0]}><coneGeometry args={[20,15,4]}/><meshBasicMaterial color="#7F8C8D"/></mesh>
                    <mesh position={[20,15,0]}><cylinderGeometry args={[5,5,30,16]}/><meshBasicMaterial color="#F0E68C"/></mesh>
                    <mesh position={[20,32,0]}><coneGeometry args={[6,8,16]}/><meshBasicMaterial color="#E67E22"/></mesh>
                </group>
            </group>
        );
    }
}, []); // Add dependencies if ARENA_CONFIG or other external values are used inside MemeSky's JSX

  const staticDecorations = useMemo<React.ReactNode[]>(() => {
    // Farm decorations - intentionally "shitty" looking for humor
    const decorations: React.ReactNode[] = [];

    // Create static positions for hay bales - rectangular, more realistic
    const hayPositions = [
      { pos: [35, 0, 20], rot: 0.2 }, { pos: [-30, 0, 25], rot: 1.1 },
      { pos: [25, 0, -40], rot: 0.5 }, { pos: [-45, 0, -15], rot: 0.9 },
      { pos: [50, 0, 5], rot: 0.3 }, { pos: [-20, 0, -50], rot: 1.5 },
      { pos: [15, 0, 55], rot: 0.7 }, { pos: [-40, 0, -45], rot: 0.1 },
    ];

    hayPositions.forEach((hayPos, i) => {
      const [x, y, z] = hayPos.pos;
      decorations.push(
        <group key={`hay-${i}`} position={[x, 0, z]} rotation={[0, hayPos.rot, 0]}>
          {/* Main hay bale - rectangular shape */}
          <mesh position={[0, 1, 0]}>
            <boxGeometry args={[4, 2, 2]} />
            <meshStandardMaterial color="#D4B886" roughness={0.9} />
          </mesh>

          {/* Hay strands sticking out */}
          {[...Array(8)].map((_, j) => {
            const strandX = (Math.random() - 0.5) * 4;
            const strandY = (Math.random() * 0.5) + 1;
            const strandZ = (Math.random() - 0.5) * 2;
            return (
              <mesh key={`strand-${i}-${j}`} position={[strandX, strandY, strandZ]} rotation={[0, Math.random() * Math.PI, 0]}>
                <boxGeometry args={[0.1, 0.1, 0.5 + Math.random()]} />
                <meshStandardMaterial color="#E6C88A" roughness={1.0} />
              </mesh>
            );
          })}

          {/* Optional second hay bale nearby */}
          {i % 2 === 0 && (
            <mesh position={[3, 1, 1]} rotation={[0, Math.PI / 3, 0]}>
              <boxGeometry args={[4, 2, 2]} />
              <meshStandardMaterial color="#D4B886" roughness={0.9} />
            </mesh>
          )}
        </group>
      );
    });

    // Add hilariously bad scarecrows
    const scarecrowPositions = [
      { pos: [42, 0, -30], rot: 0.3 }, { pos: [-35, 0, 42], rot: 1.2 },
      { pos: [28, 0, 48], rot: 2.1 }, { pos: [-48, 0, -28], rot: 0.7 },
    ];

    scarecrowPositions.forEach((scarecrowPos, i) => {
      decorations.push(
        <group key={`scarecrow-${i}`} position={[scarecrowPos.pos[0], 0, scarecrowPos.pos[2]]} rotation={[0, scarecrowPos.rot, 0]}>
          {/* Pole */}
          <mesh position={[0, 5, 0]}><cylinderGeometry args={[0.3, 0.3, 10, 6]} /><meshStandardMaterial color="#8B4513" roughness={1} /></mesh>
          {/* Cross beam */}
          <mesh position={[0, 6, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.2, 0.2, 5, 6]} /><meshStandardMaterial color="#8B4513" roughness={1} /></mesh>
          {/* Head - intentionally crude */}
          <mesh position={[0, 9, 0]}><sphereGeometry args={[1, 6, 6]} /><meshStandardMaterial color="#F0E68C" roughness={0.8} /></mesh>
          {/* Face features - deliberately simplistic */}
          <mesh position={[-0.3, 9.2, 0.9]} rotation={[0, 0, 0.3]}><boxGeometry args={[0.2, 0.1, 0.1]} /><meshBasicMaterial color="black" /></mesh>
          <mesh position={[0.3, 9.2, 0.9]} rotation={[0, 0, -0.3]}><boxGeometry args={[0.2, 0.1, 0.1]} /><meshBasicMaterial color="black" /></mesh>
          <mesh position={[0, 8.8, 0.9]} rotation={[0, 0, 0]}><boxGeometry args={[0.4, 0.1, 0.1]} /><meshBasicMaterial color="black" /></mesh>
          {/* Body - old clothes */}
          <mesh position={[0, 6, 0]}><boxGeometry args={[2, 3, 1]} /><meshStandardMaterial color="#6A8759" roughness={1} /></mesh>
          {/* Hat */}
          <mesh position={[0, 10, 0]} rotation={[0.1, 0.2, 0.1]}><cylinderGeometry args={[1.2, 1.5, 1, 8]} /><meshStandardMaterial color="#8B4513" roughness={0.9} /></mesh>
        </group>
      );
    });

    // Add poorly drawn chickens (blocky minecraft style)
    const chickenPositions = [
      { pos: [38, 0, 35], rot: 1.1 }, { pos: [-28, 0, -39], rot: 0.5 },
      { pos: [45, 0, -40], rot: 2.3 }, { pos: [-45, 0, 30], rot: 3.0 },
      { pos: [10, 0, 60], rot: 0.8 }, { pos: [-60, 0, 10], rot: 1.9 },
    ];

    chickenPositions.forEach((chickenPos, i) => {
      const [x, y, z] = chickenPos.pos;
      decorations.push(
        <group key={`blocky-chicken-${i}`} position={[x, 0, z]} rotation={[0, chickenPos.rot, 0]}>
          {/* Body */}
          <mesh position={[0, 1.2, 0]}><boxGeometry args={[1.2, 1, 1.8]} /><meshStandardMaterial color="#FFFFFF" roughness={0.8} /></mesh>
          {/* Head */}
          <mesh position={[0, 2.2, 0.7]}><boxGeometry args={[0.8, 0.8, 0.8]} /><meshStandardMaterial color="#FFFFFF" roughness={0.8} /></mesh>
          {/* Beak */}
          <mesh position={[0, 2.2, 1.2]}><boxGeometry args={[0.3, 0.3, 0.3]} /><meshStandardMaterial color="#FFA500" roughness={0.8} /></mesh>
          {/* Comb */}
          <mesh position={[0, 2.6, 0.7]}><boxGeometry args={[0.5, 0.3, 0.3]} /><meshStandardMaterial color="#FF0000" roughness={0.8} /></mesh>
          {/* Legs */}
          <mesh position={[-0.4, 0.4, 0]}><boxGeometry args={[0.2, 0.8, 0.2]} /><meshStandardMaterial color="#FFA500" roughness={0.8} /></mesh>
          <mesh position={[0.4, 0.4, 0]}><boxGeometry args={[0.2, 0.8, 0.2]} /><meshStandardMaterial color="#FFA500" roughness={0.8} /></mesh>
        </group>
      );
    });

    // Add crude farm equipment
    const equipmentPositions = [
      { pos: [55, 0, 0], rot: 2.8, type: 'tractor' }, { pos: [-55, 0, 0], rot: 0.2, type: 'wheelbarrow' },
      { pos: [0, 0, 55], rot: 1.5, type: 'pitchfork' }, { pos: [0, 0, -55], rot: 3.9, type: 'bucket' },
    ];

    equipmentPositions.forEach((equip, i) => {
      if (equip.type === 'tractor') {
        decorations.push(
          <group key={`tractor-${i}`} position={[equip.pos[0], 0, equip.pos[2]]} rotation={[0, equip.rot, 0]}>
            {/* Main body */}
            <mesh position={[0, 2, 0]}><boxGeometry args={[4, 2, 3]} /><meshStandardMaterial color="#FF0000" roughness={0.9} /></mesh>
            {/* Wheels */}
            <mesh position={[-1.5, 1, -1.5]}><cylinderGeometry args={[1, 1, 0.5, 8]} /><meshStandardMaterial color="#333333" roughness={0.9} /></mesh>
            <mesh position={[-1.5, 1, 1.5]}><cylinderGeometry args={[1, 1, 0.5, 8]} /><meshStandardMaterial color="#333333" roughness={0.9} /></mesh>
            <mesh position={[1.5, 1, -1.5]}><cylinderGeometry args={[1, 1, 0.5, 8]} /><meshStandardMaterial color="#333333" roughness={0.9} /></mesh>
            <mesh position={[1.5, 1, 1.5]}><cylinderGeometry args={[1, 1, 0.5, 8]} /><meshStandardMaterial color="#333333" roughness={0.9} /></mesh>
            {/* Exhaust pipe */}
            <mesh position={[0, 3.5, -1]}><cylinderGeometry args={[0.2, 0.2, 2, 6]} /><meshStandardMaterial color="#666666" roughness={0.8} /></mesh>
          </group>
        );
      }
      // Placeholder for other equipment types to keep it shorter for the example
      if (equip.type === 'wheelbarrow') { /* ... wheelbarrow JSX ... */ }
      if (equip.type === 'pitchfork') { /* ... pitchfork JSX ... */ }
      if (equip.type === 'bucket') { /* ... bucket JSX ... */ }
    });

    const rockPositions = [
      { pos: [30, 0, 40], scale: 0.8, type: 0 }, { pos: [-35, 0, 35], scale: 0.6, type: 1 },
      { pos: [45, 0, -25], scale: 0.9, type: 2 }, { pos: [-40, 0, -30], scale: 0.7, type: 0 },
      { pos: [15, 0, -50], scale: 0.5, type: 1 }, { pos: [-20, 0, 50], scale: 0.6, type: 2 },
      { pos: [50, 0, 10], scale: 0.8, type: 0 }, { pos: [-50, 0, -10], scale: 0.5, type: 1 },
      { pos: [25, 0, 60], scale: 0.6, type: 2 }, { pos: [-60, 0, 20], scale: 0.9, type: 0 },
      { pos: [60, 0, -15], scale: 0.7, type: 1 }, { pos: [-15, 0, -60], scale: 0.8, type: 2 },
    ];

    rockPositions.forEach((rock, i) => {
      const rockScale = rock.scale;
      const rockType = rock.type;
      const rockColor = ['#777777', '#888888', '#696969'][Math.floor(i % 3)];
      decorations.push(
        <group
          key={`rock-${i}`}
          position={[rock.pos[0], 0 + (rockScale * 1.5), rock.pos[2]]}
          rotation={[Math.random() * Math.PI, Math.random() * Math.PI * 2, Math.random() * Math.PI]}
          scale={[rockScale, rockScale, rockScale]}
        >
          {rockType === 0 && (<mesh><dodecahedronGeometry args={[3, 0]} /><meshStandardMaterial color={rockColor} roughness={0.9} /></mesh>)}
          {rockType === 1 && (<mesh><cylinderGeometry args={[3, 2.5, 1.5, 6]} /><meshStandardMaterial color={rockColor} roughness={0.9} /></mesh>)}
          {rockType === 2 && (<mesh><octahedronGeometry args={[2.5, 0]} /><meshStandardMaterial color={rockColor} roughness={0.9} /></mesh>)}
        </group>
      );
    });
    return decorations;
  }, [/* Add dependencies for staticDecorations if any, e.g., if ARENA_CONFIG.someValue is used inside */]);

  const opponents = useMemo(() =>
    players.filter(p => p.id !== playerChicken?.id && p.isAlive),
    [players, playerChicken?.id]
  );

  // Maintain a brief decay window for remote jump flags to avoid flicker
  const remoteJumpUntilRef = useRef<Record<string, number>>({})
  // Maintain a brief window for remote hit flash to guarantee visibility even if context lags
  const remoteHitUntilRef = useRef<Record<string, number>>({})
  // Live Three.js groups for all non-player chickens; used for accurate hit positions
  const opponentGroupsRef = useRef<Record<string, THREE.Group | null>>({})

  // Track my own player id for damage overlay checks
  const selfIdRef = useRef<string | null>(null)
  useEffect(() => { try { selfIdRef.current = playerChicken?.id || null } catch {} }, [playerChicken])

  // Lightweight screen red flash when the local player is hit
  const [selfHitActive, setSelfHitActive] = useState(false)
  const selfHitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Discrete input request flags to guarantee 1 key press => 1 action locally
  const jumpRequestRef = useRef<boolean>(false)
  const peckRequestRef = useRef<boolean>(false)
  const lastJumpAtRef = useRef<number>(0)
  const lastPeckAtRef = useRef<number>(0)
  // Peck timing windows: active swing + recovery, to prevent spam between animations
  const selfPeckUntilRef = useRef<number>(0)
  const selfPeckRecoverUntilRef = useRef<number>(0)
  const lastPeckEdgeAtRef = useRef<number>(0)

  // Capture rising-edge inputs at the DOM level for responsiveness
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (e.code === 'Space') jumpRequestRef.current = true
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') peckRequestRef.current = true
    }
    // Clear any stuck input on visibility/blur changes
    const onBlur = () => { peckRequestRef.current = false }
    const onVisibility = () => { if (document.hidden) peckRequestRef.current = false }
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) peckRequestRef.current = true
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('blur', onBlur)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  // Socket hookup for consuming remote transforms and applying remote hits
  const { socket } = useSocket() as any
  useEffect(() => {
    if (!socket) return
    // Ensure we are in the match room on mount if we have a session id
    try {
      const msid = (window as any)?.__last_match_session_id
      if (msid) socket.emit('join_match_room', { matchSessionId: msid })
    } catch {}
    const onPlayerState = (payload: any) => {
      try {
        const id = String(payload?.playerId || '')
        if (!id) return
        if (!remoteHumansRef.current[id]) {
          remoteHumansRef.current[id] = { pos: new THREE.Vector3(), rotY: 0, isPecking: false, ts: 0 }
        }
        const rec = remoteHumansRef.current[id]
        const nextX = Number(payload.position?.x)||0
        const nextY = Number(payload.position?.y)||0.85
        const nextZ = Number(payload.position?.z)||0
        // Prepare short tween for Y to smooth between packets (~20Hz)
        try {
          const now = Date.now()
          ;(rec as any).yAnim = { start: rec.pos?.y ?? nextY, end: nextY, startAt: now, endAt: now + 100 }
        } catch {}
        rec.pos.set(nextX, nextY, nextZ)
        rec.rotY = Number(payload.rotationY)||0
        rec.isPecking = Boolean(payload.isPecking)
        // Capture peck event instant
        try { if (payload.isPecking) (rec as any).peckAt = Date.now() } catch {}
        ;(rec as any).isJumping = Boolean(payload.isJumping)
        if ((rec as any).isJumping) {
          remoteJumpUntilRef.current[id] = Date.now() + 500 // keep jumping true a bit longer to avoid flicker
        }
        rec.ts = Number(payload.ts)||Date.now()
      } catch {}
    }
    const lastAppliedDamageRef: Record<string, number> = Object.create(null)
    const onRemotePlayerDamage = (payload: any) => {
      try {
        const targetId = String(payload?.targetId || '')
        const amount = Math.max(1, Math.min(3, Number(payload?.amount)||1))
        if (!targetId || !onPlayerDamage) return
        const byId = typeof payload?.by === 'string' ? payload.by : undefined
        // Client-side de-dupe by target
        const now = Date.now()
        if ((lastAppliedDamageRef[targetId]||0) && now - (lastAppliedDamageRef[targetId]||0) < 120) return
        lastAppliedDamageRef[targetId] = now
        // Ensure a guaranteed flash window for remote target
        try { remoteHitUntilRef.current[targetId] = now + 600 } catch {}
        // If this client is the target, also trigger a brief screen red flash
        try {
          if (selfIdRef.current && targetId === selfIdRef.current) {
            if (selfHitTimerRef.current) { clearTimeout(selfHitTimerRef.current); selfHitTimerRef.current = null }
            setSelfHitActive(true)
            selfHitTimerRef.current = setTimeout(() => { setSelfHitActive(false); selfHitTimerRef.current = null }, 220)
          }
        } catch {}
        onPlayerDamage(targetId, amount, byId)
      } catch {}
    }
    socket.on('player_state', onPlayerState)
    socket.on('player_damage', onRemotePlayerDamage)
    const onArenaLockJoin = (payload: any) => {
      try {
        const msid = payload?.matchSessionId
        if (msid) {
          try { (window as any).__last_match_session_id = msid } catch {}
          socket.emit('join_match_room', { matchSessionId: msid })
        }
        const startAt = Number(payload?.roundStartAtEpochMs) || 0
        if (startAt > 0) {
          try { (window as any).__last_round_start_at = startAt } catch {}
          roundStartAtMsRef.current = startAt
          freezeUntilRef.current = startAt
          invulnerableUntilRef.current = startAt + 1000
        }
      } catch {}
    }
    const onRoundStartJoin = (payload: any) => {
      try {
        const msid = payload?.matchSessionId
        if (msid) {
          try { (window as any).__last_match_session_id = msid } catch {}
          socket.emit('join_match_room', { matchSessionId: msid })
        }
        const startAt = Number((payload as any)?.roundStartAtEpochMs) || 0
        if (startAt > 0) {
          roundStartAtMsRef.current = startAt
          freezeUntilRef.current = startAt
          invulnerableUntilRef.current = startAt + 1000
        }
      } catch {}
    }
    socket.on('arena_lock_roster', onArenaLockJoin)
    socket.on('round_start', onRoundStartJoin)
    // Fallback countdown handler when epoch wasn't received
    const onRoundCountdown = (payload: any) => {
      try {
        const c = Number(payload?.count)
        if (!Number.isFinite(c)) return
        setSyncedCountdown(Math.max(0, c))
        // If we never received a startAt epoch, estimate it from the countdown
        if (!roundStartAtMsRef.current || roundStartAtMsRef.current < Date.now()) {
          const estimate = Date.now() + Math.max(0, c) * 1000
          roundStartAtMsRef.current = estimate
          freezeUntilRef.current = estimate
          invulnerableUntilRef.current = estimate + 1000
          try { (window as any).__last_round_start_at = estimate } catch {}
        }
      } catch {}
    }
    socket.on('round_countdown', onRoundCountdown)
    // Fallback: if server only emits 'match_started' without epoch, unfreeze immediately
    const onMatchStarted = () => {
      if (!roundStartAtMsRef.current) {
        freezeUntilRef.current = Date.now()
        invulnerableUntilRef.current = Date.now() + 1000
      }
    }
    socket.on('match_started', onMatchStarted)
    const onDebug = (p: any) => console.log('[ARENA][DEBUG]', p)
    socket.on('debug_trace', onDebug)
    // Lightweight HP delta updates (authoritative)
    const onStateUpdate = (payload: any) => {
      try {
        const msid = String((payload && payload.matchSessionId) || '')
        if (!msid) return
        const targetId = String(payload?.targetId || '')
        if (!targetId) return
        const hp = Number(payload?.hp)
        if (!Number.isFinite(hp)) return
        // If this update targets the local player, show a brief hit flash
        try {
          if (selfIdRef.current && targetId === selfIdRef.current) {
            if (selfHitTimerRef.current) { clearTimeout(selfHitTimerRef.current); selfHitTimerRef.current = null }
            setSelfHitActive(true)
            selfHitTimerRef.current = setTimeout(() => { setSelfHitActive(false); selfHitTimerRef.current = null }, 220)
          }
        } catch {}
        // Apply via damage handler by inferring delta; prefer direct set when delta cannot be inferred
        try {
          if (onPlayerDamage) {
            // We only know target and new hp; call onPlayerDamage repeatedly until hp matches
            // Bound to max 3 for safety
            const desired = Math.max(0, Math.min(3, Math.round(hp)))
            // We do not have direct access to current hp; rely on a brief sequence of 1-damage applications as a best-effort
            const applyTicks = () => {
              try { onPlayerDamage(targetId, 1) } catch {}
            }
            if (desired <= 2) applyTicks()
          }
        } catch {}
      } catch {}
    }
    socket.on('state_update', onStateUpdate)
    // On-demand full state snapshot after tab resumes
    const onMatchState = (payload: any) => {
      try {
        const arr = Array.isArray(payload?.players) ? payload.players : []
        // Coerce any dead players immediately
        for (const p of arr) {
          try {
            const id = String(p?.wallet || p?.playerId || '')
            const hp = Number(p?.hp)
            if (!id || !Number.isFinite(hp)) continue
            const missing = Math.max(0, Math.min(3, Math.round(hp)))
            // Apply damage ticks up to 3 to force local state under onPlayerDamage path
            if (missing <= 2 && onPlayerDamage) onPlayerDamage(id, 1)
          } catch {}
        }
      } catch {}
    }
    socket.on('match_state', onMatchState)
    return () => {
      socket.off('player_state', onPlayerState)
      socket.off('player_damage', onRemotePlayerDamage)
      socket.off('arena_lock_roster', onArenaLockJoin)
      socket.off('round_start', onRoundStartJoin)
      socket.off('round_countdown', onRoundCountdown)
      socket.off('match_started', onMatchStarted)
      socket.off('debug_trace', onDebug)
      socket.off('state_update', onStateUpdate)
      socket.off('match_state', onMatchState)
    }
  }, [socket, onPlayerDamage])

  // Synced countdown updater
  useEffect(() => {
    const id = setInterval(() => {
      const startAt = roundStartAtMsRef.current
      if (typeof startAt === 'number' && startAt > Date.now()) {
        setSyncedCountdown(Math.max(0, Math.ceil((startAt - Date.now()) / 1000)))
      } else {
        if (syncedCountdown !== null) setSyncedCountdown(null)
      }
    }, 100)
    return () => clearInterval(id)
  }, [syncedCountdown])

  // Background/visibility resync: request snapshot when tab gains focus or on mount
  useEffect(() => {
    const sendRequest = () => {
      try {
        const msid = (typeof window !== 'undefined') ? (window as any).__last_match_session_id : null
        if (socket && msid) socket.emit('get_match_state', { matchSessionId: msid })
      } catch {}
    }
    sendRequest()
    const onVis = () => { if (!document.hidden) sendRequest() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', sendRequest)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('focus', sendRequest)
    }
  }, [socket])

  // Arena overlay countdown
  const CountdownOverlay = useMemo(() => {
    return function Overlay() {
      if (typeof syncedCountdown !== 'number' || syncedCountdown < 0) return null
      return (
        <Html
          position={[0, 8, 0]}
          center
          style={{ pointerEvents: 'none' }}
        >
          <div className="text-7xl sm:text-9xl font-bold text-yellow-400 pixel-font drop-shadow-[4px_4px_0_rgba(0,0,0,0.8)]">
            {syncedCountdown}
          </div>
        </Html>
      )
    }
  }, [syncedCountdown])

  // MAIN RENDER LOOP HOOK (useFrame)
  // The useFrame hook itself must be called unconditionally.
  // The logic *inside* its callback can, of course, be conditional.
  useFrame((state, delta) => {
    // Calculate delta time for frame-rate independent movement
    const now = Date.now();
    const deltaTime = Math.min((now - lastUpdateTime.current) / 1000, 0.1); // Cap at 0.1 to prevent large jumps
    lastUpdateTime.current = now;

    // Skip if game is not in battle state
    if (gameState !== 'battle') return; // Note: 'battle' might need to be GameState.PLAYING or similar

    // Arm a 3s freeze and 4s invulnerability once at mount
    if (!hasArmedCountdownRef.current) {
      const nowMs = Date.now()
      freezeUntilRef.current = nowMs + 3000
      invulnerableUntilRef.current = nowMs + 4000
      hasArmedCountdownRef.current = true
    }
    
    // Skip if player is not alive
    if (playerChicken && !playerChicken.isAlive) return;

    const nowMs = Date.now()
    const jumpPressed = nowMs < freezeUntilRef.current ? false : (jumpKey || jumpRequestRef.current);
    // Drive peck from discrete requests only; then hold via time window
    const peckPressed = nowMs < freezeUntilRef.current ? false : Boolean(peckRequestRef.current);
    const isPeckingNow = selfIsPecking;

    if (isPeckingNow && peckPressed) {
      wasPecking.current = true;
    } else if (wasPecking.current && !peckPressed) {
      wasPecking.current = false;
    }

    // Maximum movement speed
    const maxSpeed = jumpPressed ? 12.0 : 8.0; // Sprint with jump key

    // Handle jumping physics (consume discrete request once)
    if (jumpRequestRef.current && selfPosition.y <= 0.85 + 0.05) {
      lastJumpAtRef.current = Date.now()
      selfVelocity.current.y = 12.0;
      setSelfIsJumping(true);
      if (playSound) playSound("jump");
      jumpRequestRef.current = false
    } else if (selfPosition.y <= 0.85) {
      setSelfIsJumping(false);
    }

    // Peck handling
    // Peck handling (edge -> fixed-duration window), mirrors jump reliability
    const peckActive = nowMs < selfPeckUntilRef.current
    const inRecovery = nowMs < selfPeckRecoverUntilRef.current
    if (peckPressed && !peckActive && !inRecovery) {
      // Local cooldown to avoid rapid-fire and server throttling
      if (nowMs - (lastPeckAtRef.current || 0) < 220) {
        peckRequestRef.current = false
      } else {
        lastPeckEdgeAtRef.current = nowMs
        // Active swing duration, then recovery
        const swingMs = 200
        const recoverMs = 120
        selfPeckUntilRef.current = nowMs + swingMs
        selfPeckRecoverUntilRef.current = nowMs + swingMs + recoverMs
        if (!selfIsPecking) setSelfIsPecking(true)

          // Improved hit detection: use horizontal (XZ) distance and slightly larger reach
      if (playerRef.current) {
        const playerPos = new THREE.Vector3();
        playerRef.current.getWorldPosition(playerPos);
        for (const opponent of opponents) {
          if (!opponent.position || !opponent.isAlive) continue;
          // Prefer actual world position from rendered group; fallback to net pos, then static
          const net = remoteHumansRef.current[opponent.id]
          let opponentPos = new THREE.Vector3()
          const g = opponentGroupsRef.current[opponent.id]
          if (g && typeof g.getWorldPosition === 'function') {
            g.getWorldPosition(opponentPos)
          } else if (net && net.pos) {
            opponentPos = net.pos.clone()
          } else if (opponent.position instanceof THREE.Vector3) {
            opponentPos = opponent.position.clone()
          } else {
            opponentPos = new THREE.Vector3().fromArray(opponent.position as number[])
          }

          // Compute horizontal distance only to avoid Y glitches during jumps
          const dx = playerPos.x - opponentPos.x;
          const dz = playerPos.z - opponentPos.z;
          const horizontalDistance = Math.sqrt(dx * dx + dz * dz);

          // Require vertical alignment: hits only when target's body height overlaps player's peck plane
          // Both chickens use feet at y≈0.85; constrain vertical delta to a small window
          const dy = Math.abs(playerPos.y - opponentPos.y);
          const verticalWindow = 0.45; // ~same height band; avoids hitting air under/over jumping chickens

          // Slightly reduced reach to be stricter now that vertical alignment is enforced
          const peckReach = 3.2;
          if (horizontalDistance <= peckReach && dy <= verticalWindow) {
            // Respect invulnerability window at round start for opponents
            const isInvulnerable = Date.now() < invulnerableUntilRef.current
            if (isInvulnerable) break
            // Emit damage over network when the target is a human; otherwise apply locally.
            // If the opponent isn't explicitly flagged, fall back to network emit (symmetric rules).
            if ((opponent as any).isAi === false && socket) {
              try {
                const msid = (window as any)?.__last_match_session_id
                // Send once and locally show hit flash immediately
                // Emit once; also trigger a local visual-only flash for immediate feedback
                socket.emit('player_damage', { matchSessionId: msid, targetId: opponent.id, amount: 1 })
                try { if (onPlayerDamage) onPlayerDamage(opponent.id, 0.5) } catch {}
              } catch {}
            } else if ((opponent as any).isAi === true && onPlayerDamage) {
              onPlayerDamage(opponent.id, 1)
            } else if (socket) {
              // Unknown type: prefer networked damage to keep consistency
              try {
                const msid = (window as any)?.__last_match_session_id
                socket.emit('player_damage', { matchSessionId: msid, targetId: opponent.id, amount: 1 })
                try { if (onPlayerDamage) onPlayerDamage(opponent.id, 0.5) } catch {}
              } catch {}
            } else if (onPlayerDamage) {
              // Fallback: apply locally
              onPlayerDamage(opponent.id, 1)
            }
            break;
          }
        }
      }
        lastPeckAtRef.current = nowMs
        peckRequestRef.current = false
      }
    }
    // Time-window driven peck state maintenance and release
    if (selfIsPecking && !peckActive) setSelfIsPecking(false)

    // Apply gravity (slightly lower for smoother arc at low frame rates)
    selfVelocity.current.y -= 13.5 * deltaTime; // Gravity strength
    selfPosition.y += selfVelocity.current.y * deltaTime;

    // Ground collision
    if (selfPosition.y < 0.85) {
      selfPosition.y = 0.85; // Ground level
      selfVelocity.current.y = 0;
    }

    // Handle movement
    let moveVector = new THREE.Vector3(0, 0, 0);
    if (forward) moveVector.z -= 1;
    if (backward) moveVector.z += 1;
    // Removed direct L/R move for rotation-based movement
    // if (left) moveVector.x -= 1;
    // if (right) moveVector.x += 1;


    // Handle rotation with deltaTime scaling and clamping (disabled during freeze)
    if (Date.now() >= freezeUntilRef.current) {
      const turn = (right ? -1 : 0) + (left ? 1 : 0)
      if (turn !== 0) {
        // Normalize current angle to [-PI, PI]
        while (selfRotation.y > Math.PI) selfRotation.y -= Math.PI * 2
        while (selfRotation.y < -Math.PI) selfRotation.y += Math.PI * 2
        // Apply turn
        const nextAngle = selfRotation.y + (ROTATION_SPEED * deltaTime) * turn * (selfIsJumping ? 0.85 : 1.0)
        // Wrap to avoid jumps across the branch cut
        selfRotation.y = ((nextAngle + Math.PI) % (Math.PI * 2)) - Math.PI
      }
    }

    if (moveVector.length() > 0) {
      moveVector.normalize();
      const nowMs = Date.now();
      if (!lastWalkingRef.current || nowMs - lastWalkingSetAtRef.current > 120) {
        setIsWalking(true);
        lastWalkingRef.current = true;
        lastWalkingSetAtRef.current = nowMs;
      }
    } else {
      const nowMs = Date.now();
      if (lastWalkingRef.current && nowMs - lastWalkingSetAtRef.current > 120) {
        setIsWalking(false);
        lastWalkingRef.current = false;
        lastWalkingSetAtRef.current = nowMs;
      }
    }

    // Calculate movement direction based on rotation
    const angle = selfRotation.y;
    const movementDirection = new THREE.Vector3(
      -Math.sin(angle) * moveVector.z * maxSpeed,
      0,
      -Math.cos(angle) * moveVector.z * maxSpeed
    );
    // If re-adding strafe:
    // movementDirection.x += Math.cos(angle) * moveVector.x * maxSpeed;
    // movementDirection.z += Math.sin(angle) * moveVector.x * maxSpeed;


    selfVelocity.current.x = movementDirection.x;
    selfVelocity.current.z = movementDirection.z;

    // Apply movement (disabled during freeze)
    if (Date.now() >= freezeUntilRef.current) {
      selfPosition.x += selfVelocity.current.x * deltaTime;
      selfPosition.z += selfVelocity.current.z * deltaTime;
    }

    // Arena bounds
    const currentRingRadius = ARENA_CONFIG.ringRadius; // Use configured radius
    const maxBounds = currentRingRadius - 2; // Character radius/offset
    const distanceFromCenter = Math.sqrt(selfPosition.x * selfPosition.x + selfPosition.z * selfPosition.z);

    if (distanceFromCenter > maxBounds) {
      const directionFromCenter = new THREE.Vector3(selfPosition.x, 0, selfPosition.z).normalize();
      selfPosition.x = directionFromCenter.x * maxBounds;
      selfPosition.z = directionFromCenter.z * maxBounds;
      selfVelocity.current.x = 0;
      selfVelocity.current.z = 0;
    }

    // Player-opponent collision (reduced radius + short grace after round start)
    if (opponents.length > 0) {
      const playerBoundingRadius = 0.9; // smaller to avoid "invisible wall" feel
      const minimumDistance = playerBoundingRadius * 2;
      const originalX = selfPosition.x; // Store before collision adjustments
      const originalZ = selfPosition.z;

      // Skip collision pushes for a short grace after the round begins
      const collisionsEnabled = Date.now() > (freezeUntilRef.current + 300);

      for (const opponent of opponents) {
        if (!opponent.position || !opponent.isAlive) continue;
        const opponentPos = opponent.position instanceof THREE.Vector3 ? opponent.position.clone() : new THREE.Vector3().fromArray(opponent.position as number[]);
        const dx = selfPosition.x - opponentPos.x;
        const dz = selfPosition.z - opponentPos.z;
        const distance = Math.sqrt(dx * dx + dz * dz);

        if (collisionsEnabled && distance < minimumDistance) {
          const pushDirection = new THREE.Vector3(dx, 0, dz).normalize();
          // Nudge outward instead of snapping exactly to min distance for smoother passage
          const targetDist = Math.max(distance, minimumDistance * 0.96);
          selfPosition.x = opponentPos.x + pushDirection.x * targetDist;
          selfPosition.z = opponentPos.z + pushDirection.z * targetDist;
          selfVelocity.current.x *= 0.8; // Dampen velocity
          selfVelocity.current.z *= 0.8;

          if (distance < minimumDistance * 0.8) { // Stronger collision
            selfVelocity.current.x += pushDirection.x * 2; // Bump reaction
            selfVelocity.current.z += pushDirection.z * 2;
            if (playSound && distance < minimumDistance * 0.6) playSound("bump");
          }
        }
      }
      // Re-check bounds after collision adjustments
      const newDistanceFromCenter = Math.sqrt(selfPosition.x * selfPosition.x + selfPosition.z * selfPosition.z);
      if (newDistanceFromCenter > maxBounds) {
        selfPosition.x = originalX; // Revert to pre-collision position if pushed out
        selfPosition.z = originalZ;
      }
    }
    
    // Update refs only (avoid per-frame setState thrash)
    const posChanged = (
      Math.abs(prevPosition.current.x - selfPosition.x) > 0.01 ||
      Math.abs(prevPosition.current.y - selfPosition.y) > 0.01 ||
      Math.abs(prevPosition.current.z - selfPosition.z) > 0.01
    )
    const rotChanged = Math.abs(prevRotationY.current - selfRotation.y) > 0.01
    if (posChanged || rotChanged) {
      prevPosition.current.set(selfPosition.x, selfPosition.y, selfPosition.z)
      prevRotationY.current = selfRotation.y
    }

    // Update Three.js object directly
    if (playerRef.current) {
      playerRef.current.position.copy(selfPosition);
      playerRef.current.rotation.copy(selfRotation);
    }

    // Update camera (support spectate following when local player is dead)
    if (cameraRef.current && playerRef.current) {
      if (!cameraTargetPosition.current) cameraTargetPosition.current = new THREE.Vector3();
      if (!lookAtPosition.current) lookAtPosition.current = new THREE.Vector3();

      // Determine if local player is dead (spectate mode eligibility)
      let isLocalDead = false
      try {
        const selfP = (players as any[] || []).find(p => p && (p as any).isPlayer)
        if (selfP) isLocalDead = !Boolean((selfP as any).isAlive)
      } catch {}

      // Resolve follow target: either self, or current spectate target if local is dead
      let followPos = new THREE.Vector3(selfPosition.x, selfPosition.y, selfPosition.z)
      let followRotY = selfRotation.y
      if (isLocalDead) {
        try {
          let spectateId = (typeof window !== 'undefined') ? (window as any).__spectate_target_id : null
          // Auto-pick a spectate target if none selected
          if (!spectateId) {
            try {
              const firstAlive = (players as any[] || []).find(p => p && !p.isPlayer && p.isAlive)
              if (firstAlive && typeof window !== 'undefined') {
                spectateId = firstAlive.id
                ;(window as any).__spectate_target_id = spectateId
              }
            } catch {}
          }
          if (spectateId) {
            const tgt = (players as any[] || []).find(p => p && p.id === spectateId && p.isAlive)
            if (tgt) {
              // Prefer latest networked transform for remote humans
              const rec = remoteHumansRef.current?.[spectateId]
              if (rec && rec.pos) {
                followPos.set(rec.pos.x, 0.85, rec.pos.z)
                followRotY = typeof rec.rotY === 'number' ? rec.rotY : 0
              } else if ((tgt as any).position) {
                const p = (tgt as any).position
                if (p instanceof THREE.Vector3) {
                  followPos.set(p.x, 0.85, p.z)
                } else if (Array.isArray(p) && p.length >= 3) {
                  followPos.set(Number(p[0])||0, 0.85, Number(p[2])||0)
                }
                if ((tgt as any).rotation && typeof (tgt as any).rotation.y === 'number') {
                  followRotY = (tgt as any).rotation.y
                } else {
                  followRotY = 0
                }
              }
            }
          }
        } catch {}
      }

      const cameraDistance = 8 * 1.5
      const cameraHeight = 5 * 1.5
      const camAngle = followRotY
      cameraTargetPosition.current.set(
        followPos.x - Math.sin(camAngle) * cameraDistance,
        followPos.y + cameraHeight,
        followPos.z - Math.cos(camAngle) * cameraDistance
      )
      cameraRef.current.position.lerp(cameraTargetPosition.current, 0.1)
      const lookAtVec = lookAtPosition.current
      if (lookAtVec) {
        lookAtVec.set(followPos.x, followPos.y + 1.5, followPos.z)
        cameraRef.current.lookAt(lookAtVec)
      }
    }

    // Drumstick Collection Logic (if any)
    if (playerRef.current && onDrumstickCollected) {
      // This logic seems to have been removed or was incomplete.
      // If you have drumsticks in the scene to collect, you'd check their positions against playerPosition here.
    }

    // Emit local player transform at ~20 Hz (only on meaningful deltas)
    try {
      const nowMs = Date.now()
      if (socket && nowMs - lastEmitAtRef.current > 50) {
        const msid = (window as any)?.__last_match_session_id
        const sent = lastSentRef.current
        const posDelta = Math.hypot(selfPosition.x - sent.x, selfPosition.z - sent.z)
        const yDelta = Math.abs(selfPosition.y - sent.y)
        const rotDelta = Math.abs(selfRotation.y - sent.ry)
        // Only send peck when it flips from false->true to avoid multi-peck
        // More responsive peck: allow sending peck state as long as active, but still edge-preferential
        const peckEdge = (!sent.pk && selfIsPecking)
        const stateChanged = peckEdge || (selfIsJumping !== sent.jp) || (selfIsPecking && !sent.pk)
        if (posDelta > 0.02 || yDelta > 0.015 || rotDelta > 0.02 || stateChanged) {
          lastEmitAtRef.current = nowMs
          // Quantize to 2 decimals to reduce bandwidth while keeping smoothness
          const q = (n: number) => Math.round(n * 100) / 100
          sent.x = selfPosition.x; sent.y = selfPosition.y; sent.z = selfPosition.z
          sent.ry = selfRotation.y; sent.pk = selfIsPecking; sent.jp = selfIsJumping
          socket.emit('player_state', {
            matchSessionId: msid,
            position: [q(selfPosition.x), q(selfPosition.y), q(selfPosition.z)],
            rotationY: q(selfRotation.y),
            isPecking: selfIsPecking,
            isJumping: selfIsJumping,
          })
        }
      }
    } catch {}
  });


  // Do not block rendering if textures fail; show overlay but continue
  if (textureError) {
    console.warn("Texture loading error (continuing with fallbacks):", textureError);
  }

  // ----- Non-hook constants that might depend on ARENA_CONFIG (safe after hooks) -----
  const ringRadius = ARENA_CONFIG.ringRadius;
  const wallHeight = ARENA_CONFIG.wallHeight;
  // Physics constants are fine here too if not used in initial state of hooks
  const gravity = 9.8;
  const jumpForce = 6;
  const cameraOffset = new THREE.Vector3(0, 5, 8);
  const chickenFeetOffsetY = 0.85;


  // ----- Helper functions (can be defined after hooks and conditional returns) -----
  const addToCollisionList = (obj: THREE.Object3D) => {
    if (obj && !collisionObjects.current.includes(obj)) {
      collisionObjects.current.push(obj);
    }
  };
  

  // ----- JSX to render the scene -----
  return (
    <>
      {gameState === 'battle' && typeof syncedCountdown === 'number' && (
        <Html center style={{ pointerEvents: 'none' }}>
          <div className="pixel-font" style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            fontSize: '72px', color: '#FFD400', textShadow: '6px 6px 0 rgba(0,0,0,0.85)', zIndex: 9999
          }}>
            {syncedCountdown}
          </div>
        </Html>
      )}
      {/* Lights */}
      <ambientLight intensity={0.35} />
      <directionalLight
        position={[18, 38, 14]}
        intensity={1.35}
        castShadow
        shadow-mapSize-width={4096}
        shadow-mapSize-height={4096}
        shadow-camera-near={0.5}
        shadow-camera-far={400}
        // Expand orthographic shadow frustum to cover fence
        shadow-camera-left={-80}
        shadow-camera-right={80}
        shadow-camera-top={80}
        shadow-camera-bottom={-80}
      />
      <hemisphereLight args={["#87CEEB", "#8B7355", 0.25]} />

      <MemeSky />

      {/* Arena and surrounding area */}
      <ArenaFloor lowPerf={true} />
      <BarbedWireFence />
      {staticDecorations}

      {/* Simple Barn placed outside the ring */}
      <SimpleBarn position={[ARENA_CONFIG.ringRadius + 8, 0, -ARENA_CONFIG.ringRadius - 6]} />

      {/* Opponent Chickens */}
      {players && playerChicken && (
        <ChickenInstances
          chickens={players.filter(p => p.isAlive && !p.isPlayer).map(p => {
            // For non-AI humans, blend towards latest networked transforms
            if (!p.isAi && p.id && remoteHumansRef.current[p.id]) {
              const rec = remoteHumansRef.current[p.id]
              const blended = {
                ...p,
                position: rec.pos.clone(),
                rotation: new THREE.Euler(0, rec.rotY, 0),
                isAi: false,
                isJumping: Boolean((rec as any).isJumping) || ((remoteJumpUntilRef.current[p.id]||0) > Date.now()),
              } as PlayerStatus
              return blended
            }
            return p
          })}
          playerChickenId={playerChicken?.id || ''}
          playerRef={playerRef}
          freezeUntilMs={freezeUntilRef.current}
          invulnerableUntilMs={invulnerableUntilRef.current}
          remoteHumans={remoteHumansRef.current}
          remoteHitUntil={remoteHitUntilRef.current}
          // Expose live group refs of opponents so player hit detection can use accurate positions
          groupMapRef={opponentGroupsRef}
          onAiDamagePlayer={() => { 
            try {
              if (playerChicken?.id) {
                setSelfHitActive(true)
                setTimeout(() => setSelfHitActive(false), 150)
              }
            } catch {}
            if (onPlayerDamage && playerChicken?.id) onPlayerDamage(playerChicken.id, 1)
          }}
          onAiDamageTarget={(targetId, amount = 1, byId) => {
            try {
              if (targetId && onPlayerDamage) onPlayerDamage(String(targetId), amount, byId)
              // Also set a guaranteed flash window for AI targets to surface hits visually
              if (targetId) (remoteHitUntilRef.current as any)[String(targetId)] = Date.now() + 600
            } catch {}
          }}
        />
      )}

      {/* Player Chicken (alive) or corpse (dead) */}
      {playerChicken && (
        playerChicken.isAlive ? (
          <group ref={playerRef}>
            <PixelChicken
              position={[0, 0, 0]}
              colors={playerChicken?.colors}
              isPecking={selfIsPecking}
              isWalking={isWalking || Math.hypot(selfVelocity.current.x, selfVelocity.current.z) > 0.05}
              isJumping={selfIsJumping}
              isHitFlashing={Boolean((playerChicken as any)?.isHitFlashing) || (((remoteHitUntilRef.current||{})[playerChicken.id]||0) > Date.now())}
              disableBobbing={true}
              isPlayer={true}
              health={playerChicken.hp}
              maxHealth={playerChicken.maxHp}
            />
          </group>
        ) : (
          (() => {
            if (!deathPosRef.current) {
              try { if (playerRef.current) deathPosRef.current = playerRef.current.position.clone() } catch {}
              if (!deathPosRef.current) deathPosRef.current = new THREE.Vector3(0, 0.85, 0)
            }
            const pos = deathPosRef.current?.clone() || new THREE.Vector3(0, 0.85, 0)
            pos.y = 0.85
            return (
              <group position={pos} rotation={[0, 0, -Math.PI / 2]}>
                <PixelChicken
                  position={[0, 0, 0]}
                  colors={playerChicken?.colors}
                  isPecking={false}
                  isWalking={false}
                  isJumping={false}
                  isHitFlashing={false}
                  disableBobbing={true}
                  isPlayer={true}
                  health={0}
                  maxHealth={playerChicken.maxHp}
                />
              </group>
            )
          })()
        )
      )}

      {/* Corpses for KO'd opponents (static, no collisions) */}
      {players && playerChicken && players.filter(p => !p.isAlive && !p.isPlayer).map((p) => {
        const pos = (() => {
          try {
            const rec = (remoteHumansRef.current || {})[p.id]
            if (rec && rec.pos) return rec.pos.clone()
          } catch {}
          try {
            if (p.position instanceof THREE.Vector3) return p.position.clone()
            if (Array.isArray(p.position)) return new THREE.Vector3(p.position[0], p.position[1], p.position[2])
          } catch {}
          return new THREE.Vector3(0, 0.85, 0)
        })()
        pos.y = 0.85
        return (
          <group key={`corpse-${p.id}`} position={pos} rotation={[0, 0, -Math.PI / 2]}>
            <PixelChicken
              position={[0, 0, 0]}
              colors={p.colors}
              isPecking={false}
              isWalking={false}
              isJumping={false}
              isHitFlashing={false}
              disableBobbing={true}
              health={0}
              maxHealth={p.maxHp}
            />
          </group>
        )
      })}
      
      {/* Drumstick models would be rendered here based on their state */}
      {/* Example: drumsticks.map(stick => <DrumstickModel key={stick.id} position={stick.position} />) */}


      <PerspectiveCamera
        ref={cameraRef}
        makeDefault
        position={[0, 5, 10]} // Initial position, will be updated by useFrame
        fov={60}
        near={0.1}
        far={1000} // Adjusted far plane
      />
      {selfHitActive && (
        <Html fullscreen style={{ pointerEvents: 'none' }}>
          <div className="fixed inset-0 z-[10050]" style={{ background: 'rgba(255,0,0,0.22)', transition: 'opacity 120ms ease-out' }} />
        </Html>
      )}
    </>
  );
}

// Simple 3s countdown shown in the arena when the battle scene first mounts
function FinalArenaCountdownWithPings({ playPing }: { playPing?: (s: string) => void }) {
  const [value, setValue] = useState(3)
  const [done, setDone] = useState(false)
  useEffect(() => {
    let v = 3
    setValue(v)
    // Immediate soft ping for the initial '3'
    try { if (playPing) playPing('countdown') } catch {}
    const t = setInterval(() => {
      v -= 1
      setValue(v)
      try {
        if (v > 0 && playPing) playPing('countdown'); // louder ping for 3..2..1
      } catch {}
      if (v <= 0) { clearInterval(t); setDone(true) }
    }, 1000)
    return () => clearInterval(t)
  }, [])
  if (done) return null
  return (
    <div className="pixel-font" style={{
      position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
      fontSize: '72px', color: '#FFD400', textShadow: '6px 6px 0 rgba(0,0,0,0.85)', zIndex: 9999, pointerEvents: 'none'
    }}>
      {value}
    </div>
  )
}

// BarbedWireFence component
const BarbedWireFence = React.memo(() => {
    const posts = 24;
    const radius = ARENA_CONFIG.ringRadius * 1.05;
    const postHeight = 1.0 * 1.5;
    const postSize = 0.15 * 1.5;

    const postMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: "#604020", roughness: 0.8 }), []);
    const wireMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: "#888888", metalness: 0.6, roughness: 0.3 }), []);

    const fencePosts = useMemo(() => {
      return [...Array(posts)].map((_, i) => {
        const angle = (i / posts) * Math.PI * 2;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        return (
          <mesh key={`post-${i}`} position={[x, postHeight / 2, z]} castShadow receiveShadow>
            <boxGeometry args={[postSize, postHeight, postSize]} />
            <primitive object={postMaterial} attach="material" />
          </mesh>
        );
      });
    }, [posts, radius, postHeight, postSize, postMaterial]);

    return (
      <group name="BarbedWireFence">
        <group>{fencePosts}</group>
        <mesh position={[0, 0.7 * 1.5, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
          <torusGeometry args={[radius, 0.015 * 1.5, 6, posts]} />
          <primitive object={wireMaterial} attach="material" />
        </mesh>
        <mesh position={[0, 0.4 * 1.5, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
          <torusGeometry args={[radius, 0.015 * 1.5, 6, posts]} />
          <primitive object={wireMaterial} attach="material" />
        </mesh>
      </group>
    );
});
BarbedWireFence.displayName = 'BarbedWireFence';

// ChickenInstances component (Modified)
function ChickenInstances({
    chickens, 
    playerChickenId,
    playerRef,
    freezeUntilMs,
    invulnerableUntilMs,
    remoteHumans,
    remoteHitUntil,
      groupMapRef,
      onAiDamagePlayer,
      onAiDamageTarget
  }: {
    chickens: PlayerStatus[],
    playerChickenId: string,
    playerRef?: React.RefObject<THREE.Group>,
    freezeUntilMs?: number,
    invulnerableUntilMs?: number,
    remoteHumans?: Record<string, { pos: THREE.Vector3; rotY: number; isPecking: boolean; ts: number }>,
    remoteHitUntil?: Record<string, number>,
      groupMapRef?: React.RefObject<Record<string, THREE.Group | null>>,
      onAiDamagePlayer?: () => void,
      onAiDamageTarget?: (targetId: string, amount?: number, byId?: string) => void
  }) {
    const groupsRef = useRef<Record<string, THREE.Group | null>>({})
    const lastPeckRef = useRef<Record<string, number>>({})
    const wanderTargetRef = useRef<Record<string, THREE.Vector3>>({})
    const wanderUntilRef = useRef<Record<string, number>>({})
  // Limit how many AIs actively engage the player at once to avoid ganging up
  const engagedWithPlayerRef = useRef<Record<string, number>>({}) // id -> untilMs
  const lastEngagementRecalcAtRef = useRef<number>(0)
  // Reduce simultaneous pressure on the human player
  const MAX_ACTIVE_ATTACKERS = 1
    // Free-for-all targeting: allow AIs to target non-player opponents with per-target caps
    const aiFocusRef = useRef<Record<string, string>>({}) // aiId -> targetId (non-player preferred)
    const aiRetargetAfterRef = useRef<Record<string, number>>({}) // aiId -> timestamp
  const MAX_ATTACKERS_PER_TARGET = 2

    useFrame((_, delta) => {
      const playerPos = (() => {
        try {
          const v = new THREE.Vector3()
          if (playerRef?.current) { playerRef.current.getWorldPosition(v); return v }
        } catch {}
        return new THREE.Vector3(0, 0.85, 0)
      })()

      const now = Date.now()
      const ringRadius = ARENA_CONFIG.ringRadius
      const maxBounds = ringRadius - 2

      // Periodically rebalance which AIs are allowed to actively engage the player
      if (now >= (lastEngagementRecalcAtRef.current || 0)) {
        // Prune expired engagements
        try {
          for (const [k, until] of Object.entries(engagedWithPlayerRef.current)) {
            if (!until || until < now) delete engagedWithPlayerRef.current[k]
          }
        } catch {}
        // Fill remaining slots with nearest AI within a reasonable radius
        const slotsOpen = Math.max(0, MAX_ACTIVE_ATTACKERS - Object.keys(engagedWithPlayerRef.current).length)
        if (slotsOpen > 0) {
          try {
            const candidates: Array<{ id: string; d: number; isHuman: boolean }> = []
            for (const c of chickens) {
              if (!(c as any).isAi || !c.isAlive || c.id === playerChickenId) continue
              const g = groupsRef.current[c.id]
              if (!g) continue
              const dx = g.position.x - playerPos.x
              const dz = g.position.z - playerPos.z
              const d = Math.hypot(dx, dz)
              if (d <= 9) candidates.push({ id: c.id, d, isHuman: false })
            }
            // Prefer AIs to engage first; then nearest
            candidates.sort((a, b) => (Number(a.isHuman) - Number(b.isHuman)) || (a.d - b.d))
            const pick = candidates
              .filter(c => !(engagedWithPlayerRef.current[c.id] || 0))
              .slice(0, slotsOpen)
            const engageForMs = 2200
            for (const c of pick) engagedWithPlayerRef.current[c.id] = now + engageForMs
          } catch {}
        }
        // Recalculate roughly a few times per second
        lastEngagementRecalcAtRef.current = now + 450
      }

      // Build focus counts for anti-gang on non-player targets (humans or AIs)
      const focusCounts: Record<string, number> = {}
      try {
        for (const [aid, tid] of Object.entries(aiFocusRef.current)) {
          if (!aid || !tid) continue
          if (tid === playerChickenId) continue
          focusCounts[tid] = (focusCounts[tid] || 0) + 1
        }
      } catch {}

      for (const chicken of chickens) {
        if (!chicken.isAlive || chicken.id === playerChickenId) continue
        const g = groupsRef.current[chicken.id]
        if (!g) continue

        // For network humans, pull last known transform and smooth
        const net = remoteHumans && chicken.id ? remoteHumans[chicken.id] : undefined
        const pos = (net && net.pos ? net.pos.clone() : g.position.clone())
        // Keep network-reported Y to show jumps; clamp only if absurd
        if (!isFinite(pos.y) || pos.y < -5 || pos.y > 50) pos.y = 0.85
        // Human opponents are network-driven: do not apply local AI movement
        const isAI = Boolean((chicken as any).isAi)
        if (!isAI) {
          // Apply smoothing toward remote transform and set anim hints
          const prevX = g.position.x
          const prevZ = g.position.z
          // Smooth X/Z; ease Y via short tween captured on packet for fluid jump
          const prevX2 = g.position.x
          const prevZ2 = g.position.z
          // Adapt smoothing based on local performance: slightly faster blend to avoid trailing
          const ease = Math.max(0.2, Math.min(0.5, delta * 14))
          g.position.x += (pos.x - g.position.x) * ease
          g.position.z += (pos.z - g.position.z) * ease
          try {
            const ya = (net as any)?.yAnim
            if (ya && typeof ya.start === 'number' && typeof ya.end === 'number' && typeof ya.startAt === 'number' && typeof ya.endAt === 'number') {
              const now = Date.now()
              const t = Math.max(0, Math.min(1, (now - ya.startAt) / Math.max(1, ya.endAt - ya.startAt)))
              // smoothstep
              const s = t * t * (3 - 2 * t)
              g.position.y = ya.start + (ya.end - ya.start) * s
            } else {
              g.position.y = pos.y
            }
          } catch { g.position.y = pos.y }
          if (net) {
            const targetY = net.rotY
            const lerpAngle = (a: number, b: number, t: number) => {
              let diff = (b - a + Math.PI) % (Math.PI * 2)
              if (diff < 0) diff += Math.PI * 2
              diff -= Math.PI
              return a + diff * t
            }
            g.rotation.y = lerpAngle(g.rotation.y, targetY, 0.35)
            // Drive walk/peck anims from deltas and net flags
            const dx = g.position.x - prevX2
            const dz = g.position.z - prevZ2
            try { g.userData.vx = dx / Math.max(0.016, delta); g.userData.vz = dz / Math.max(0.016, delta) } catch {}
            try {
              const peckEventAt = (net as any)?.peckAt
              if (peckEventAt && Date.now() - peckEventAt < 250) {
                lastPeckRef.current[chicken.id] = Date.now()
              }
              if (net.isPecking) lastPeckRef.current[chicken.id] = Date.now()
            } catch {}
          } else {
            try { if (g) { g.userData.vx = 0; g.userData.vz = 0 } } catch {}
          }
          continue
        }

        // Determine target for this AI: prefer assigned focus; otherwise player if engaged
        const engagedUntil = engagedWithPlayerRef.current[chicken.id] || 0
        const engagedWithPlayer = engagedUntil > now

        // Resolve current non-player target
        let targetId: string | null = engagedWithPlayer ? playerChickenId : (aiFocusRef.current[chicken.id] || null)
        let targetPos: THREE.Vector3 | null = null
        if (targetId === playerChickenId) {
          targetPos = playerPos.clone()
        } else if (targetId) {
          const tg = groupsRef.current[targetId]
          if (tg) targetPos = tg.position.clone()
        }

        // Retarget non-player target when needed
        if (!engagedWithPlayer) {
          const shouldRetarget = (!targetId || !targetPos || (aiRetargetAfterRef.current[chicken.id] || 0) < now)
          if (shouldRetarget) {
            try {
              const candidates: Array<{ id: string; d: number; pos: THREE.Vector3; isHuman: boolean }> = []
              for (const other of chickens) {
                if (!other.isAlive) continue
                if (other.id === chicken.id) continue
                const og = groupsRef.current[other.id]
                if (!og) continue
                const dx = og.position.x - pos.x
                const dz = og.position.z - pos.z
                const d = Math.hypot(dx, dz)
                if (d <= 20) candidates.push({ id: other.id, d, pos: og.position.clone(), isHuman: !Boolean((other as any).isAi) })
              }
              // Prefer AI-vs-AI skirmishes first; then nearest
              candidates.sort((a, b) => (Number(a.isHuman) - Number(b.isHuman)) || (a.d - b.d))
              let picked: { id: string; pos: THREE.Vector3 } | null = null
              for (const c of candidates) {
                const cur = focusCounts[c.id] || 0
                const cap = c.isHuman ? 1 : MAX_ATTACKERS_PER_TARGET
                if (cur < cap) { picked = { id: c.id, pos: c.pos }; break }
              }
              if (picked) {
                targetId = picked.id
                targetPos = picked.pos
                aiFocusRef.current[chicken.id] = picked.id
                aiRetargetAfterRef.current[chicken.id] = now + 1000
                focusCounts[picked.id] = (focusCounts[picked.id] || 0) + 1
              } else {
                // No valid target; clear focus
                aiFocusRef.current[chicken.id] = ''
                targetId = null
                targetPos = null
              }
            } catch {}
          }
        }

        // Compute vector to chosen target; fall back to player for orientation
        const actualTargetPos = targetPos || playerPos
        const toTarget = actualTargetPos.clone().sub(pos)
        const dist = Math.hypot(toTarget.x, toTarget.z)

        // Face player - custom angle lerp (THREE.MathUtils.lerpAngle not available)
        const targetAngle = Math.atan2(toTarget.x, toTarget.z)
        const lerpAngle = (a: number, b: number, t: number) => {
          let diff = (b - a + Math.PI) % (Math.PI * 2)
          if (diff < 0) diff += Math.PI * 2
          diff -= Math.PI
          return a + diff * t
        }
        g.rotation.y = lerpAngle(g.rotation.y, targetAngle, 0.15)

        // Slightly slower when chasing the human; normal vs other AIs
        let speed = targetId === playerChickenId ? 1.6 : 2.2
        let moveVec = new THREE.Vector3(0, 0, 0)

        const isFrozen = typeof freezeUntilMs === 'number' && now < freezeUntilMs
        const isInvulnerable = typeof invulnerableUntilMs === 'number' && now < invulnerableUntilMs
        const isEngaged = engagedWithPlayer || Boolean(targetId)

        if (isFrozen) {
          moveVec.set(0, 0, 0)
        } else if (dist > 6) {
          // Wander when far: pick a temporary target and stroll
          if (!wanderTargetRef.current[chicken.id] || (wanderUntilRef.current[chicken.id] || 0) < now) {
            const angle = Math.random() * Math.PI * 2
            const r = Math.min(maxBounds - 1, 6 + Math.random() * 6)
            wanderTargetRef.current[chicken.id] = new THREE.Vector3(
              Math.cos(angle) * r,
              0.85,
              Math.sin(angle) * r
            )
            wanderUntilRef.current[chicken.id] = now + 2500 + Math.random() * 2000
          }
          const w = wanderTargetRef.current[chicken.id].clone().sub(pos)
          const len = Math.hypot(w.x, w.z) || 1
          moveVec.set((w.x / len) * 1.2, 0, (w.z / len) * 1.2)
        } else if (dist > 2.6) {
          // Near: only engaged AIs directly chase; others orbit to avoid dogpiling
          if (isEngaged) {
            const len = Math.max(0.0001, Math.hypot(toTarget.x, toTarget.z))
            moveVec.set((toTarget.x / len) * speed, 0, (toTarget.z / len) * speed)
          } else {
            // Orbit around target clockwise at a comfortable radius
            const tangent = new THREE.Vector3(-toTarget.z, 0, toTarget.x)
            const len = Math.max(0.0001, Math.hypot(tangent.x, tangent.z))
            moveVec.set((tangent.x / len) * 1.2, 0, (tangent.z / len) * 1.2)
            // Light keep-distance behavior: nudge outward if getting too close
            if (dist < 3.2) {
              const baseLen = Math.max(0.0001, Math.hypot(toTarget.x, toTarget.z))
              moveVec.x += (toTarget.x / baseLen) * 0.6
              moveVec.z += (toTarget.z / baseLen) * 0.6
            }
          }
        } else {
          // In range: try to peck with cooldown
          const last = lastPeckRef.current[chicken.id] || 0
          const cdMs = (targetId === playerChickenId ? 2000 : 1200)
          if (isEngaged && !isFrozen && !isInvulnerable && now - last > cdMs) {
            // Require vertical alignment similar to player hits
            const dy = Math.abs(pos.y - actualTargetPos.y)
            const verticalWindow = 0.45
            if (dy <= verticalWindow) {
            lastPeckRef.current[chicken.id] = now
            try {
              if (targetId && targetId !== playerChickenId && onAiDamageTarget) {
                onAiDamageTarget(targetId, 1, chicken.id)
              } else if (targetId === playerChickenId && onAiDamagePlayer) {
                onAiDamagePlayer()
              }
            } catch {}
            }
          }
          // If not engaged, back off slightly to let others take turns
          if (!isEngaged) {
            const len = Math.max(0.0001, Math.hypot(toTarget.x, toTarget.z))
            moveVec.set((toTarget.x / len) * 0.8, 0, (toTarget.z / len) * 0.8)
          }
        }

        // Apply movement
        if (!isFrozen) {
          pos.x += moveVec.x * delta
          pos.z += moveVec.z * delta
          // record magnitude to drive animation
          try { if (g) g.userData.vx = moveVec.x; if (g) g.userData.vz = moveVec.z } catch {}
        } else {
          try { if (g) g.userData.vx = 0; if (g) g.userData.vz = 0 } catch {}
        }

        // Keep inside ring
        const d = Math.hypot(pos.x, pos.z)
        if (d > maxBounds) {
          pos.x = (pos.x / d) * maxBounds
          pos.z = (pos.z / d) * maxBounds
        }
        g.position.copy(pos)
      }
    })

    return (
      <>
        {chickens.map((chicken) => {
          if (!chicken.isAlive) return null
          if (chicken.id === playerChickenId) return null
          const chickenPos = chicken.position instanceof THREE.Vector3
            ? chicken.position
            : Array.isArray(chicken.position)
              ? new THREE.Vector3(chicken.position[0], chicken.position[1], chicken.position[2])
              : new THREE.Vector3(0, 0.85, 0)
          chickenPos.y = 0.85
          const chickenRot = chicken.rotation instanceof THREE.Euler
            ? chicken.rotation
            : new THREE.Euler(
                Array.isArray(chicken.rotation) ? chicken.rotation[0] : 0,
                Array.isArray(chicken.rotation) ? chicken.rotation[1] : 0,
                Array.isArray(chicken.rotation) ? chicken.rotation[2] : 0
              )
          return (
            <group
              key={chicken.id}
              ref={(el) => { groupsRef.current[chicken.id] = el; try { if (groupMapRef && groupMapRef.current) groupMapRef.current[chicken.id] = el } catch {} }}
              position={chickenPos}
              rotation={chickenRot}
            >
              <PixelChicken
                position={[0,0,0]} 
                colors={chicken.colors}
                isWalking={Math.hypot((groupsRef.current[chicken.id]?.userData?.vx||0), (groupsRef.current[chicken.id]?.userData?.vz||0)) > 0.05}
                isPecking={(lastPeckRef.current[chicken.id] || 0) > (Date.now() - 300)}
                isJumping={Boolean((chicken as any).isJumping)}
                isHitFlashing={Boolean(chicken.isHitFlashing) || (((remoteHitUntil||{})[chicken.id]||0) > Date.now())}
                isDying={!chicken.isAlive} 
                health={chicken.hp}
                maxHealth={chicken.maxHp}
                disableBobbing={true}
              />
            </group>
          )
        })}
      </>
    )
}

// Optimize main component with React.memo
export default React.memo(function EnhancedArenaScene({ 
  gameState, 
  playerChicken,
  playerPosition,
  playerRotation,
  isJumping,
  isPecking,
  onExit,
  playSound,
  onPlayerDamage,
  players,
  onDrumstickCollected
}: EnhancedArenaSceneProps) {
  
  // Ensure all required props have defaults
  const safeGameState = gameState || GameState.PREVIEW;
  const safePlayerChicken = playerChicken || {
    id: "player",
    name: "Player",
    position: { x: 0, y: 0.85, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    colors: {
      body: '#e63946',
      beak: '#ffb703',
      comb: '#e63946',
      legs: '#ffb703',
      tail: '#e63946',
      eyes: '#ffffff',
      pupils: '#000000'
    }
  };
  
  const safePlayers = players || [];
  const safePlayerPosition = playerPosition || new THREE.Vector3(0, 0.85, 0);
  const safePlayerRotation = playerRotation || new THREE.Euler(0, 0, 0);
  
  return (
    <div className="w-full h-full overflow-hidden">
      <KeyboardControls map={controlsMap}>
      <Canvas 
          style={{ width: '100%', height: '100%', display: 'block' }}
          shadows={typeof window !== 'undefined' ? window.innerWidth >= 768 : true}
          camera={{ 
            fov: 75, 
            near: 0.1, 
            far: 50000,
            position: [0, 10, 20] 
          }}
          gl={{ 
            antialias: !(typeof window !== 'undefined' && window.innerWidth < 768),
            alpha: false,
            preserveDrawingBuffer: false,
            powerPreference: "high-performance",
            stencil: false
          }}
          frameloop="always"
          dpr={typeof window !== 'undefined' && window.devicePixelRatio > 1.5 ? (window.innerWidth < 768 ? [1, 1.25] : [1, 1.5]) : [1, 1.25]}
          onCreated={({ gl }) => {
            try {
              const canvas = gl.domElement as HTMLCanvasElement;
              const onLost = (e: Event) => { e.preventDefault?.(); console.warn('⚠️ WebGL context lost in EnhancedArena, preventing default'); };
              const onRestored = () => { console.info('✅ WebGL context restored in EnhancedArena'); };
              canvas.addEventListener('webglcontextlost', onLost as any, { passive: false } as any);
              canvas.addEventListener('webglcontextrestored', onRestored as any, { passive: true } as any);
              // Ensure consistent color management and shadow quality
              try { (gl as any).outputColorSpace = THREE.SRGBColorSpace } catch {}
              try { (gl as any).toneMapping = THREE.ACESFilmicToneMapping } catch {}
              try { (gl as any).toneMappingExposure = 0.9 } catch {}
              try { gl.shadowMap.enabled = true; (gl.shadowMap as any).type = THREE.PCFSoftShadowMap } catch {}
            } catch {}
          }}
        >
          <color attach="background" args={['#87CEEB']} />
          {/* Optional spectate camera hint: bias playerPos toward selected target when dead */}
          {(() => {
            try {
              const targetId = (typeof window !== 'undefined') ? (window as any).__spectate_target_id : null
              if (targetId) {
                const tgt = (safePlayers as any[]).find(p => p && p.id === targetId)
                if (tgt && (tgt.position as any)) {
                  const v = new THREE.Vector3(
                    Array.isArray((tgt as any).position) ? (tgt as any).position[0] : ((tgt as any).position?.x||0),
                    0.85,
                    Array.isArray((tgt as any).position) ? (tgt as any).position[2] : ((tgt as any).position?.z||0),
                  )
                  // Nudge initial camera position closer; rest of logic uses playerRef fallback
                  // This is a gentle bias and will not break gameplay
                  // eslint-disable-next-line @typescript-eslint/no-unused-vars
                  const _bias = v
                }
              }
            } catch {}
            return null
          })()}
          <fog attach="fog" args={['#87CEEB', 30, 500]} />
          
          <Suspense fallback={<Html center className="text-white">Loading Arena...</Html>}>
            <SceneContent
              gameState={safeGameState}
              playerChicken={safePlayerChicken}
              playerPosition={safePlayerPosition}
              playerRotation={safePlayerRotation}
              isJumping={isJumping}
              isPecking={isPecking}
              onExit={onExit}
              playSound={playSound}
              onPlayerDamage={onPlayerDamage}
              players={safePlayers}
              onDrumstickCollected={onDrumstickCollected}
            />
          </Suspense>
        </Canvas>
      </KeyboardControls>
    </div>
  );
});

