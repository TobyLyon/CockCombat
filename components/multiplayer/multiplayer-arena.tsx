"use client"

import { useRef, useState, useEffect, useMemo, Suspense } from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import {
  OrbitControls,
  PerspectiveCamera,
  Text,
  Points,
} from "@react-three/drei"
import * as THREE from "three"
import { TextureLoader } from "three"
import { useMultiplayer } from "@/hooks/use-multiplayer"
import { Button } from "@/components/ui/button"
import { PlayerStatus } from "@/contexts/GameStateContext"

// Define types for better clarity
interface ArenaState {
  arena?: {
    items?: ArenaItemData[]
    hazards?: ArenaHazardData[]
  }
  roundTime?: number
  battleStatus?: string
  player1?: PlayerStatus
  player2?: PlayerStatus
}

interface ArenaItemData {
  id: string
  type: string
  position: { x: number; y: number; z: number }
  active: boolean
}

interface ArenaHazardData {
  id: string
  type: string
  position: { x: number; y: number; z: number }
}

interface MultiplayerArenaProps {
  gameState: ArenaState
  isPlayer1: boolean
  onExit: () => void
}

// Placeholder for spectator data, ensuring it has an id
interface SpectatorData {
  id: string; // Ensure spectators have an ID
  name: string;
  health: number;
  status: string;
}

// Combined type for player or spectator data
type PlayerOrSpectator = PlayerStatus | SpectatorData;

// Props for CircularPlayers
interface CircularPlayersProps {
  player1: PlayerStatus;
  player2: PlayerStatus;
  isCurrentPlayer1: boolean;
}

// Player chicken component props
interface PlayerChickenProps {
  position: [number, number, number];
  rotation: [number, number, number];
  player: PlayerOrSpectator;
  isCurrentPlayer: boolean;
  isSpectator: boolean;
}

// Arena component props
interface ArenaProps {
  floorTexture: THREE.Texture;
}

// Arena item component props
interface ArenaItemProps {
  item: ArenaItemData;
}

// Arena hazard component props
interface ArenaHazardProps {
  hazard: ArenaHazardData;
}

// Main multiplayer arena component
export default function MultiplayerArena({ gameState, isPlayer1, onExit }: MultiplayerArenaProps) {
  const { sendAction } = useMultiplayer()
  const [localGameState, setLocalGameState] = useState<ArenaState>(gameState)
  const [battleTime, setBattleTime] = useState<number>(gameState?.roundTime || 120)
  const [showCountdown, setShowCountdown] = useState(true)
  const [countdown, setCountdown] = useState(3)
  const [showControls, setShowControls] = useState(false)
  const [actionCooldown, setActionCooldown] = useState(0)

  // Load the floor texture here in the main component
  const floorTexture = useMemo(() => {
    const loader = new TextureLoader();
    const texture = loader.load('/textures/sandy_gravel_02_diff_4k.jpg');
    // Configure texture wrapping and repetition
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 4); // Reduced repeat for the higher resolution texture
    return texture;
  }, []); // Empty dependency array means this runs once

  // Update local game state when props change
  useEffect(() => {
    if (gameState) {
      setLocalGameState(gameState)
    }
  }, [gameState])

  // Initial countdown
  useEffect(() => {
    if (showCountdown) {
      const timer = setInterval(() => {
        setCountdown((prev: number) => {
          if (prev <= 1) {
            clearInterval(timer);
            setShowCountdown(false);
            setShowControls(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [showCountdown]);

  // Battle timer
  useEffect(() => {
    if (!showCountdown && localGameState?.battleStatus === "active") {
      const timer = setInterval(() => {
        setBattleTime((prev: number) => {
          if (prev <= 0) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [showCountdown, localGameState]);

  // Action cooldown
  useEffect(() => {
    if (actionCooldown > 0) {
      const timer = setInterval(() => {
        setActionCooldown((prev: number) => Math.max(0, prev - 0.1));
      }, 100);
      return () => clearInterval(timer);
    }
  }, [actionCooldown]);

  // Handle player actions
  const handleAction = (action: string) => {
    if (actionCooldown > 0) return;
    let cd = 0;
    switch (action) {
      case "peck": cd = 1; break;
      case "special": cd = 3; break;
      case "taunt": cd = 2; break;
    }
    setActionCooldown(cd);
    sendAction(action);
  };

  // Format time
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Calculate health percentage safely
  const getHealthPercent = (player: PlayerStatus | undefined): number => {
    if (!player) return 0;
    return ((player.hp ?? 0) / (player.maxHp ?? 100)) * 100;
  };

  return (
    <div className="w-full h-full relative">
      {/* 3D Arena */}
      <Canvas shadows>
        <PerspectiveCamera makeDefault position={[0, 10, 15]} fov={50} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} castShadow />

        <Suspense fallback={null}>
          <Arena floorTexture={floorTexture} />
        </Suspense>

        {localGameState?.player1 && localGameState?.player2 && (
          <CircularPlayers 
            player1={localGameState.player1} 
            player2={localGameState.player2} 
            isCurrentPlayer1={isPlayer1}
          />
        )}

        {localGameState?.arena?.items?.map((item: ArenaItemData) => (
          <ArenaItem key={item.id} item={item} />
        ))}
        {localGameState?.arena?.hazards?.map((hazard: ArenaHazardData) => (
          <ArenaHazard key={hazard.id} hazard={hazard} />
        ))}

        <OrbitControls
          enablePan={false} enableZoom={true} minDistance={5} maxDistance={20}
          minPolarAngle={Math.PI / 6} maxPolarAngle={Math.PI / 2.5}
        />
      </Canvas>

      {/* UI Overlays */} 
      {showCountdown && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-10">
          <div className="text-8xl font-bold text-yellow-400 bg-black/50 p-8 rounded-full w-40 h-40 flex items-center justify-center pixel-font">
            {countdown}
          </div>
        </div>
      )}

      {showControls && localGameState && (
        <>
          {/* Top HUD */}
          <div className="absolute top-4 left-4 right-4 flex justify-between items-start z-10">
            <div className="bg-black/70 p-3 rounded-lg border border-yellow-500">
              <div className="text-yellow-400 font-bold pixel-font">Time</div>
              <div className="text-white text-xl">{formatTime(battleTime)}</div>
            </div>
            <div className="bg-black/70 p-3 rounded-lg border border-yellow-500">
              <div className="text-yellow-400 font-bold pixel-font">
                {isPlayer1 ? localGameState?.player1?.name : localGameState?.player2?.name} vs{" "}
                {isPlayer1 ? localGameState?.player2?.name : localGameState?.player1?.name}
              </div>
            </div>
          </div>

          {/* Bottom HUD */}
          <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end z-10">
            {/* Player 1 / Current Player HUD */}
            <div className="bg-black/70 p-3 rounded-lg border border-yellow-500 w-1/3">
              <div className="text-yellow-400 font-bold mb-1 pixel-font">
                {isPlayer1 ? localGameState.player1?.name : localGameState.player2?.name}
              </div>
              <div className="text-white mb-1">Health</div>
              <div className="w-full h-4 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full"
                  style={{ width: `${getHealthPercent(isPlayer1 ? localGameState.player1 : localGameState.player2)}%` }}
                ></div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <Button onClick={() => handleAction("peck")} disabled={actionCooldown > 0} className="bg-red-600 hover:bg-red-700 text-white">Peck Attack</Button>
              <Button onClick={() => handleAction("special")} disabled={actionCooldown > 0 /* Add energy check */} className="bg-purple-600 hover:bg-purple-700 text-white">Special</Button>
              <Button onClick={() => handleAction("taunt")} disabled={actionCooldown > 0} className="bg-yellow-600 hover:bg-yellow-700 text-white">Taunt</Button>
            </div>

            {/* Player 2 / Opponent HUD */}
            <div className="bg-black/70 p-3 rounded-lg border border-yellow-500 w-1/3">
              <div className="text-yellow-400 font-bold mb-1 pixel-font">
                {isPlayer1 ? localGameState.player2?.name : localGameState.player1?.name}
              </div>
              <div className="text-white mb-1">Health</div>
              <div className="w-full h-4 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full"
                  style={{ width: `${getHealthPercent(isPlayer1 ? localGameState.player2 : localGameState.player1)}%` }}
                ></div>
              </div>
            </div>
          </div>
        </>
      )}

      {actionCooldown > 0 && (
        <div className="absolute bottom-20 left-1/2 transform -translate-x-1/2 bg-black/70 p-2 rounded-lg border border-yellow-500 z-10">
          <div className="text-yellow-400">Cooldown: {actionCooldown.toFixed(1)}s</div>
        </div>
      )}

      <Button className="absolute top-4 right-4 bg-red-600 hover:bg-red-700 text-white z-10" onClick={onExit}>
        Exit Battle
      </Button>

      {localGameState?.battleStatus === "ended" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20">
          <div className="bg-[#333333] border-4 border-yellow-500 rounded-lg p-8 max-w-md text-center">
            <h2 className="text-3xl font-bold mb-4 text-yellow-400 pixel-font">
              {getHealthPercent(isPlayer1 ? localGameState.player1 : localGameState.player2) > 0 ? "VICTORY!" : "DEFEAT!"}
            </h2>
            <p className="text-white text-xl mb-6">
              {getHealthPercent(isPlayer1 ? localGameState.player1 : localGameState.player2) > 0
                ? `You defeated ${isPlayer1 ? localGameState.player2?.name : localGameState.player1?.name}!`
                : `You were defeated by ${isPlayer1 ? localGameState.player2?.name : localGameState.player1?.name}!`}
            </p>
            <Button
              className="bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-3 px-6 text-lg"
              onClick={onExit}
            >
              Return to Arena
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// Arena component
function Arena({ floorTexture }: ArenaProps) {
  const arenaSize = 20 * 1.5; // Scaled from 20 to 30
  const { scene } = useThree()

  return (
    <group>
      {/* Arena floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]} receiveShadow>
        <planeGeometry args={[arenaSize, arenaSize]} />
        <meshStandardMaterial map={floorTexture} /> {/* Apply texture */}
      </mesh>

      {/* Arena boundary */}
      <mesh position={[0, 1 * 1.5, 0]}> {/* Scale height as well */} 
        <ringGeometry args={[arenaSize / 2 - 0.5 * 1.5, arenaSize / 2, 64]} /> {/* Scale thickness */} 
        <meshStandardMaterial color="#8B4513" side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

// Props for CircularPlayers
interface CircularPlayersProps {
  player1: PlayerStatus;
  player2: PlayerStatus;
  isCurrentPlayer1: boolean;
}

// CircularPlayers component for showing players in a circular formation
function CircularPlayers({ player1, player2, isCurrentPlayer1 }: CircularPlayersProps) {
  const groupRef = useRef<THREE.Group>(null);
  const { clock } = useThree()
  
  // Calculate the positions in a circle
  const playerPositions = useMemo(() => {
    const totalPlayers = 8; 
    const radius = 8 * 1.5; // Apply 1.5x scaling to the radius (was 8, now 12)
    const baseGroundY = -0.25; // Base Y position to keep feet slightly above ground
    
    const positions: {
      position: [number, number, number];
      rotation: [number, number, number];
      player: PlayerOrSpectator | null;
      isCurrentPlayer: boolean;
      isSpectator: boolean;
    }[] = [];
    
    for (let i = 0; i < totalPlayers; i++) {
      const angle = (i / totalPlayers) * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const rotationY = -angle + Math.PI;
      const rotation: [number, number, number] = [0, rotationY, 0];
      
      let playerData: PlayerOrSpectator | null = null;
      let isCurrentPlayer = false;
      let isSpectator = true;
      
      if (i === 0 && player1) { playerData = player1; isCurrentPlayer = isCurrentPlayer1; isSpectator = false; }
      else if (i === 4 && player2) { playerData = player2; isCurrentPlayer = !isCurrentPlayer1; isSpectator = false; }
      else { playerData = { id: `spectator-${i}`, name: `Spectator ${i}`, health: 100, status: "watching" } as SpectatorData; }
      
      positions.push({ position: [x, baseGroundY, z], rotation, player: playerData, isCurrentPlayer, isSpectator });
    }
    return positions;
  }, [player1, player2, isCurrentPlayer1]);
  
  // Simple subtle animation for the circle of players
  useFrame(() => {
    if (groupRef.current) {
      // Very subtle rotation of the whole formation
      groupRef.current.rotation.y = Math.sin(clock.getElapsedTime() * 0.1) * 0.03;
    }
  })
  
  return (
    <group ref={groupRef}>
      {playerPositions.map((playerData, i) => (
        playerData.player && (
          <PlayerChicken
            key={playerData.player.id} // Use ID for key
            position={playerData.position}
            rotation={playerData.rotation}
            player={playerData.player}
            isCurrentPlayer={playerData.isCurrentPlayer}
            isSpectator={playerData.isSpectator}
          />
        )
      ))}
    </group>
  )
}

// Player chicken component props
interface PlayerChickenProps {
  position: [number, number, number];
  rotation: [number, number, number];
  player: PlayerOrSpectator;
  isCurrentPlayer: boolean;
  isSpectator: boolean;
}

// Player chicken component
function PlayerChicken({ position, rotation, player, isCurrentPlayer, isSpectator }: PlayerChickenProps) {
  const chickenRef = useRef<THREE.Group>(null);
  const healthBarRef = useRef<THREE.Mesh>(null); // Ref for the health bar mesh
  const { clock } = useThree()

  // Update health bar color based on health
  useEffect(() => {
    if (healthBarRef.current && !isSpectator && 'hp' in player && healthBarRef.current.material instanceof THREE.MeshBasicMaterial) { // Check if player has hp and material is correct type
      const material = healthBarRef.current.material as THREE.MeshBasicMaterial;
      const healthRatio = (player.hp ?? 0) / (player.maxHp ?? 100);
      if (healthRatio > 0.66) {
        material.color.set("#22c55e"); // green
      } else if (healthRatio > 0.33) {
        material.color.set("#eab308"); // yellow
      } else {
        material.color.set("#ef4444"); // red
      }
      // Update geometry scale for health bar width
      if (healthBarRef.current.geometry instanceof THREE.PlaneGeometry) {
        healthBarRef.current.scale.x = Math.max(0, healthRatio); // Use scale instead of recreating geometry
      }
    }
  }, [player, isSpectator]) // Depend on player object for hp/maxHp changes

  // Animate chicken
  useFrame((state, delta) => {
    if (chickenRef.current) {
      // Apply player status animations
      if ('status' in player && player.status === "attacking") {
        chickenRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 20) * 0.2
      } else {
        chickenRef.current.rotation.x = 0
      }
    }
  })

  // Get chicken color based on player role
  const getChickenColor = () => {
    if (isCurrentPlayer) return "#f59e0b" // Current player color
    if (isSpectator) return "#9ca3af" // Gray for spectators
    // Use player's defined color if available
    if ('colors' in player && player.colors?.body) return player.colors.body;
    return "#f97316" // Default opponent color
  }

  const chickenColor = getChickenColor();
  const beakColor = ('colors' in player && player.colors?.beak) ? player.colors.beak : "#ef4444";
  const combColor = ('colors' in player && player.colors?.comb) ? player.colors.comb : "#ef4444";
  const legColor = ('colors' in player && player.colors?.legs) ? player.colors.legs : "#fbbf24";

  return (
    <group position={position} rotation={rotation}>
      {/* Chicken body */}
      <group ref={chickenRef} position={[0, 0.5, 0]}> {/* Set fixed Y offset for model */}
        {/* Main body */}
        <mesh castShadow position={[0, 0.6, 0]}>
          <boxGeometry args={[1, 1, 1.5]} />
          <meshStandardMaterial color={chickenColor} />
        </mesh>

        {/* Head */}
        <mesh castShadow position={[0, 1.2, 0.5]}>
          <boxGeometry args={[0.8, 0.8, 0.8]} />
          <meshStandardMaterial color={chickenColor} />
        </mesh>

        {/* Beak */}
        <mesh castShadow position={[0, 1.2, 0.9]} rotation={[0, 0, 0]}>
          <coneGeometry args={[0.1, 0.3, 4]} />
          <meshStandardMaterial color={beakColor} />
        </mesh>

        {/* Comb */}
        <mesh castShadow position={[0, 1.5, 0.5]}>
          <boxGeometry args={[0.1, 0.2, 0.4]} />
          <meshStandardMaterial color={combColor} />
        </mesh>

        {/* Legs */}
        <mesh castShadow position={[-0.3, 0, 0]}>
          <boxGeometry args={[0.1, 0.6, 0.1]} />
          <meshStandardMaterial color={legColor} />
        </mesh>
        <mesh castShadow position={[0.3, 0, 0]}>
          <boxGeometry args={[0.1, 0.6, 0.1]} />
          <meshStandardMaterial color={legColor} />
        </mesh>
      </group>

      {/* Only show health bars for actual players */}
      {!isSpectator && 'hp' in player && (
        <>
          {/* Health bar */}
          <mesh ref={healthBarRef} position={[0, 2, 0]}>
            <planeGeometry args={[1, 0.1]} /> {/* Base geometry, scale updates width */}
            <meshBasicMaterial color="#22c55e" side={THREE.DoubleSide} transparent depthWrite={false} /> {/* Basic material for UI */}
          </mesh>

          {/* Player name */}
          <Text
            position={[0, 2.3, 0]}
            fontSize={0.3}
            color={isCurrentPlayer ? "#f59e0b" : "#ffffff"}
            anchorX="center"
            anchorY="middle"
          >
            {player.name}
          </Text>

          {/* Current player indicator */}
          {isCurrentPlayer && (
            <mesh position={[0, 2.6, 0]}>
              <sphereGeometry args={[0.1, 8, 8]} />
              <meshStandardMaterial color="#3b82f6" emissive="#3b82f6" emissiveIntensity={0.5} />
            </mesh>
          )}
        </>
      )}
    </group>
  )
}

// Arena item component props
interface ArenaItemProps {
  item: ArenaItemData;
}

// Arena item component
function ArenaItem({ item }: ArenaItemProps) {
  const itemRef = useRef<THREE.Group>(null);
  const { clock } = useThree()

  // Get color based on item type
  const getItemColor = () => {
    switch (item.type) {
      case "health":
        return "#ef4444" // red
      case "energy":
        return "#3b82f6" // blue
      case "damage":
        return "#f97316" // orange
      case "speed":
        return "#22c55e" // green
      case "shield":
        return "#a855f7" // purple
      default:
        return "#ffffff" // white
    }
  }

  // Animate item
  useFrame(() => {
    if (itemRef.current) {
      // Floating animation
      itemRef.current.position.y = Math.sin(clock.getElapsedTime() * 2) * 0.2 + 0.5
      // Rotation
      itemRef.current.rotation.y += 0.01
    }
  })

  if (!item.active) return null

  return (
    <group ref={itemRef} position={[item.position.x, item.position.y, item.position.z]}>
      <mesh castShadow>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshStandardMaterial color={getItemColor()} emissive={getItemColor()} emissiveIntensity={0.5} />
      </mesh>
    </group>
  )
}

// Arena hazard component props
interface ArenaHazardProps {
  hazard: ArenaHazardData;
}

// Arena hazard component
function ArenaHazard({ hazard }: ArenaHazardProps) {
  const hazardRef = useRef<THREE.Mesh>(null);
  const { clock } = useThree()

  // Get hazard properties
  const getHazardProps = () => {
    switch (hazard.type) {
      case "spikes":
        return {
          geometry: <icosahedronGeometry args={[0.4, 0]} />, // Use Icosahedron for a rock-like shape
          color: "#71717a", // gray
        }
      case "fire":
        return {
          geometry: <cylinderGeometry args={[0.3, 0.5, 0.4, 8]} />,
          color: "#ef4444", // red
        }
      case "water":
        return {
          geometry: <cylinderGeometry args={[0.5, 0.5, 0.1, 16]} />,
          color: "#3b82f6", // blue
        }
      default:
        return {
          geometry: <boxGeometry args={[0.5, 0.5, 0.5]} />,
          color: "#ffffff",
        }
    }
  }

  const props = getHazardProps()

  // Animate hazard
  useFrame(() => {
    if (hazardRef.current) {
      if (hazard.type === "fire") {
        // Fire flicker
        hazardRef.current.scale.y = 0.8 + Math.sin(clock.getElapsedTime() * 10) * 0.2
        hazardRef.current.scale.x = 0.8 + Math.cos(clock.getElapsedTime() * 8) * 0.2
      } else if (hazard.type === "water") {
        // Water ripple
        hazardRef.current.scale.x = 0.9 + Math.sin(clock.getElapsedTime() * 2) * 0.1
        hazardRef.current.scale.z = 0.9 + Math.cos(clock.getElapsedTime() * 2) * 0.1
      }
    }
  })

  return (
    <group position={[hazard.position.x, 0, hazard.position.z]}>
      <mesh ref={hazardRef} castShadow>
        {props.geometry}
        <meshStandardMaterial
          color={props.color}
          emissiveIntensity={0.5}
          transparent={hazard.type === "water"}
          opacity={hazard.type === "water" ? 0.7 : 1}
        />
      </mesh>
    </group>
  )
}
