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
import GameUI from "./game-ui";
import { useGameState, PlayerStatus } from "@/contexts/GameStateContext"
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
  { name: Controls.jump, keys: ["ShiftLeft", "ShiftRight"] }, // Shift for jumping
  { name: Controls.peck, keys: ["Space", "Mouse0"] } // Spacebar or left mouse click for pecking
];

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
function ArenaFloor() {
  const floorTexture = useTexture("/textures/grass/coast_sand_rocks_02_diff_4k.jpg");

  // Apply texture settings directly to the loaded texture
  useEffect(() => {
    if (floorTexture) {
      floorTexture.wrapS = floorTexture.wrapT = THREE.RepeatWrapping;
      floorTexture.repeat.set(32, 32);
      floorTexture.anisotropy = 8;
      floorTexture.needsUpdate = true;
    }
  }, [floorTexture]);

  return (
    <Plane 
      args={[2000, 2000]} // Make it larger to cover the whole scene
      rotation={[-Math.PI / 2, 0, 0]} 
      position={[0, 0, 0]} // Set position to Y=0
      receiveShadow
    >
      <meshStandardMaterial map={floorTexture} roughness={0.9} />
    </Plane>
  );
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
  const { isLoading: texturesLoading, error: textureError } = useTexturePreloader([
    'ARENA_FLOOR',
    'STONE',
    'WOOD',
    // Add other critical texture keys here if needed
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

  // Get keyboard controls state directly (Drei hook)
  const forward = useKeyboardControls<Controls>(state => state.forward);
  const backward = useKeyboardControls<Controls>(state => state.backward);
  const left = useKeyboardControls<Controls>(state => state.left);
  const right = useKeyboardControls<Controls>(state => state.right);
  const jumpKey = useKeyboardControls<Controls>(state => state.jump);
  const peckKey = useKeyboardControls<Controls>(state => state.peck);

  // Store previous state for peck animation
  const wasPecking = useRef(false);

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

  // Access game state context for additional functionality if needed
  const gameStateContext = useGameState(); // Custom Hook
  const { lastDefeatedChickenId } = gameStateContext;

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
                    <sphereGeometry args={[100 * 1.5, 16, 16]} />
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
    
    // Skip if player is not alive
    if (playerChicken && !playerChicken.isAlive) return;

    const jumpPressed = jumpKey;
    const peckPressed = peckKey;
    const isPeckingNow = selfIsPecking;

    if (isPeckingNow && peckPressed) {
      wasPecking.current = true;
    } else if (wasPecking.current && !peckPressed) {
      wasPecking.current = false;
    }

    // Maximum movement speed
    const maxSpeed = jumpPressed ? 12.0 : 8.0; // Sprint with jump key

    // Handle jumping physics
    if (jumpPressed && selfPosition.y <= 0.85 + 0.1) { // Add small threshold
      selfVelocity.current.y = 12.0; // Increased jump force
      setSelfIsJumping(true);
      if (playSound) playSound("jump");
    } else if (selfPosition.y <= 0.85) {
      setSelfIsJumping(false);
    }

    // Peck handling
    if (peckPressed && !selfIsPecking && !wasPecking.current) {
      setSelfIsPecking(true);
      wasPecking.current = true;
      if (playSound) { playSound("punch"); playSound("hit"); }

      // Simple hit detection
      if (playerRef.current) {
        const playerPos = new THREE.Vector3();
        playerRef.current.getWorldPosition(playerPos);
        for (const opponent of opponents) {
          if (!opponent.position || !opponent.isAlive) continue;
          const opponentPos = opponent.position instanceof THREE.Vector3 ? opponent.position.clone() : new THREE.Vector3().fromArray(opponent.position as number[]);
          if (playerPos.distanceTo(opponentPos) <= 3.0) { // Hit distance
            if (onPlayerDamage) onPlayerDamage(opponent.id, 1); // Example damage
            break;
          }
        }
      }
      setTimeout(() => setSelfIsPecking(false), 250); // Peck duration
    }

    if (!peckPressed && wasPecking.current) {
      wasPecking.current = false;
    }

    // Apply gravity
    selfVelocity.current.y -= 15.0 * deltaTime; // Gravity strength
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


    // Handle rotation
    if (left) selfRotation.y += 0.1; // Rotate left (adjust speed as needed)
    if (right) selfRotation.y -= 0.1; // Rotate right

    if (moveVector.length() > 0) {
      moveVector.normalize();
      setIsWalking(true);
    } else {
      setIsWalking(false);
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

    selfPosition.x += selfVelocity.current.x * deltaTime;
    selfPosition.z += selfVelocity.current.z * deltaTime;

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

    // Player-opponent collision
    if (opponents.length > 0) {
      const playerBoundingRadius = 1.5;
      const minimumDistance = playerBoundingRadius * 2;
      const originalX = selfPosition.x; // Store before collision adjustments
      const originalZ = selfPosition.z;

      for (const opponent of opponents) {
        if (!opponent.position || !opponent.isAlive) continue;
        const opponentPos = opponent.position instanceof THREE.Vector3 ? opponent.position.clone() : new THREE.Vector3().fromArray(opponent.position as number[]);
        const dx = selfPosition.x - opponentPos.x;
        const dz = selfPosition.z - opponentPos.z;
        const distance = Math.sqrt(dx * dx + dz * dz);

        if (distance < minimumDistance) {
          const pushDirection = new THREE.Vector3(dx, 0, dz).normalize();
          selfPosition.x = opponentPos.x + pushDirection.x * minimumDistance;
          selfPosition.z = opponentPos.z + pushDirection.z * minimumDistance;
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
    
    // Update React state only if position/rotation changed significantly
    if (!prevPosition.current.equals(selfPosition) &&
        (Math.abs(prevPosition.current.x - selfPosition.x) > 0.01 ||
         Math.abs(prevPosition.current.y - selfPosition.y) > 0.01 ||
         Math.abs(prevPosition.current.z - selfPosition.z) > 0.01)) {
      prevPosition.current.copy(selfPosition);
      setSelfPosition(new THREE.Vector3(selfPosition.x, selfPosition.y, selfPosition.z));
      setSelfRotation(new THREE.Euler(selfRotation.x, selfRotation.y, selfRotation.z));
    }

    // Update Three.js object directly
    if (playerRef.current) {
      playerRef.current.position.copy(selfPosition);
      playerRef.current.rotation.copy(selfRotation);
    }

    // Update camera
    if (cameraRef.current && playerRef.current) {
      if (!cameraTargetPosition.current) cameraTargetPosition.current = new THREE.Vector3();
      if (!lookAtPosition.current) lookAtPosition.current = new THREE.Vector3();
      const cameraDistance = 8 * 1.5;
      const cameraHeight = 5 * 1.5;
      const camAngle = selfRotation.y;
      cameraTargetPosition.current.set(
        selfPosition.x - Math.sin(camAngle) * cameraDistance,
        selfPosition.y + cameraHeight,
        selfPosition.z - Math.cos(camAngle) * cameraDistance
      );
      cameraRef.current.position.lerp(cameraTargetPosition.current, 0.1);
      const lookAtVec = lookAtPosition.current;
      if (lookAtVec) { // Ensure it's not null
          lookAtVec.set(selfPosition.x, selfPosition.y + 1.5, selfPosition.z);
          cameraRef.current.lookAt(lookAtVec);
      }
    }

    // Drumstick Collection Logic (if any)
    if (playerRef.current && onDrumstickCollected) {
      // This logic seems to have been removed or was incomplete.
      // If you have drumsticks in the scene to collect, you'd check their positions against playerPosition here.
    }
  });


  // ----- CONDITIONAL EARLY RETURNS (MUST BE AFTER ALL HOOKS) -----
  if (texturesLoading) {
    return <Html center>Loading textures...</Html>;
  }

  if (textureError) {
    console.error("Texture loading error:", textureError);
    return <Html center>Error loading textures. Please try again.</Html>;
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
      {/* Lights */}
      <ambientLight intensity={0.5} />
      <directionalLight 
        position={[10, 20, 5]} 
        intensity={1.5} 
        castShadow 
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.5}
        shadow-camera-far={50}
        shadow-camera-left={-25}
        shadow-camera-right={25}
        shadow-camera-top={25}
        shadow-camera-bottom={-25}
      />

      <MemeSky />

      {/* Arena and surrounding area */}
      <ArenaFloor />
      <BarbedWireFence />
      {staticDecorations}

      {/* Opponent Chickens */}
      {players && playerChicken && (
        <ChickenInstances
          chickens={players.filter(p => p.isAlive && !p.isPlayer)}
          playerChickenId={playerChicken?.id || ''}
        />
      )}

      {/* Player Chicken */}
      {playerChicken && (
        <group
          ref={playerRef}
          // Position and rotation are now handled directly in useFrame via playerRef.current
        >
          <PixelChicken
            position={[0, 0, 0]} // Relative to the group
            colors={playerChicken?.colors}
            isPecking={selfIsPecking}
            isWalking={isWalking}
            isJumping={selfIsJumping}
            disableBobbing={true} // Player chicken should NOT bob
            isPlayer={true}
            health={playerChicken.hp} // Assuming hp is part of playerChicken
            maxHealth={playerChicken.maxHp} // Assuming maxHp is part of playerChicken
          />
        </group>
      )}
      
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
    </>
  );
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
  onDrumstickCollected // Destructure callback
}: EnhancedArenaSceneProps) {
  // Use the game state context for additional state if needed
  const gameStateContext = useGameState();
  
  // Game state for UI
  const [playerHealth, setPlayerHealth] = useState(3);
  const [remainingPlayers, setRemainingPlayers] = useState(8);
  const [matchTime, setMatchTime] = useState(180); // 3 minutes
  const [isWinner, setIsWinner] = useState(false);
  const [prizePool, setPrizePool] = useState(8); // 1 $COCK per player

  // Update player health from props when it changes
  useEffect(() => {
    if (playerChicken) {
      setPlayerHealth(playerChicken.hp);
    }
  }, [playerChicken]);

  // Update remaining players count from props when it changes
  useEffect(() => {
    if (players) {
      const alivePlayers = players.filter(p => p.isAlive).length;
      setRemainingPlayers(alivePlayers);
    }
  }, [players]);

  // Map the gameState to the values expected by GameUI
  const mappedGameState = useMemo(() => {
    if (gameState === "battle") return "playing";
    if (gameState === "gameOver") return "gameOver";
    return gameState;
  }, [gameState]);

  return (
    <div className="relative w-full h-full" style={{ backgroundColor: "#87CEEB" }}>
      {/* Game UI */}
      <GameUI
        gameState={mappedGameState}
        health={playerHealth}
        remaining={remainingPlayers}
        time={matchTime}
        prize={prizePool}
        peckCooldown={0} // Add this back to fix the type error
        isWinner={isWinner}
        onExit={onExit || (() => {})}
      />
      
      <KeyboardControls map={controlsMap}>
        <Canvas 
          shadows 
          camera={{ position: [0, 5, 8], fov: 75 }}
          style={{ background: "#87CEEB" }} // Set sky blue background
        >
          {/* Add a blue sky */}
          <color attach="background" args={["#87CEEB"]} />
          
          <Suspense fallback={null}>
            <SceneContent 
              playerChicken={playerChicken} 
              gameState={gameState}
              playerPosition={playerPosition}
              playerRotation={playerRotation}
              isJumping={isJumping}
              isPecking={isPecking}
              onExit={onExit}
              playSound={playSound}
              onPlayerDamage={onPlayerDamage}
              players={players}
              onDrumstickCollected={onDrumstickCollected} // Pass callback down
            />
          </Suspense>
        </Canvas>
      </KeyboardControls>
    </div>
  );
});

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
    playerChickenId 
  }: {
    chickens: PlayerStatus[], // Expects already filtered opponents if playerChickenId is also used for filtering
    playerChickenId: string 
  }) {

    return (
      <>
        {chickens.map((chicken) => {
          // Ensure chicken is alive (primary filter, could also be done before passing to this component)
          if (!chicken.isAlive) return null;
          // If this component receives all players, filter out the main player
          if (chicken.id === playerChickenId) return null;

          const chickenPos = chicken.position instanceof THREE.Vector3
            ? chicken.position
            : Array.isArray(chicken.position)
              ? new THREE.Vector3(chicken.position[0], chicken.position[1], chicken.position[2])
              : new THREE.Vector3(0, 0.85, 0); // Default if no position

          // Ensure Y position is correct for the ground
          chickenPos.y = 0.85;

          const chickenRot = chicken.rotation instanceof THREE.Euler
            ? chicken.rotation
            : new THREE.Euler(
                Array.isArray(chicken.rotation) ? chicken.rotation[0] : 0,
                Array.isArray(chicken.rotation) ? chicken.rotation[1] : 0,
                Array.isArray(chicken.rotation) ? chicken.rotation[2] : 0
              );

          return (
            <group
              key={chicken.id}
              position={chickenPos}
              rotation={chickenRot}
            >
              <PixelChicken
                position={[0,0,0]} 
                colors={chicken.colors} // Pass opponent's specific colors
                isWalking={chicken.isWalking || false} 
                isPecking={chicken.isPecking || false} 
                isJumping={chicken.isJumping || false} 
                isHitFlashing={chicken.isHitFlashing || false}
                isDying={!chicken.isAlive} 
                health={chicken.hp}
                maxHealth={chicken.maxHp}
                disableBobbing={true} // AI chickens should not bob
              />
            </group>
          );
        })}
      </>
    );
}
