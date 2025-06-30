"use client"

import { useRef, useState, useEffect } from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { OrbitControls } from "@react-three/drei"
import * as THREE from "three"
import { motion } from "framer-motion"

export default function PixelChickenViewer() {
  const [isLoading, setIsLoading] = useState(true)
  const [isRotating, setIsRotating] = useState(true)

  useEffect(() => {
    // Simulate loading time for 3D assets
    const timer = setTimeout(() => {
      setIsLoading(false)
    }, 1000)

    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="w-full h-full relative">
      {isLoading ? (
        <div className="absolute inset-0 flex items-center justify-center bg-[#333333]/50 rounded-lg">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-t-yellow-400 border-r-yellow-400 border-b-transparent border-l-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-white pixel-font">Loading Chicken...</p>
          </div>
        </div>
      ) : (
        <motion.div
          className="w-full h-full flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          <Canvas
            camera={{ position: [0, 1.4, 6], fov: 32 }}
            style={{ 
              width: 420, 
              height: 420, 
              background: 'transparent', 
              display: 'block', 
              margin: '0 auto', 
              padding: 0, 
              border: 'none', 
              boxSizing: 'border-box',
              imageRendering: 'pixelated'
            }}
            shadows
          >
            {/* Scene lighting: increase brightness */}
            <ambientLight intensity={2.0} />
            <pointLight position={[6, 10, 6]} intensity={2.6} castShadow />
            {/* Chicken follows mouse movement */}
            <PixelChickenWithMouseFollow />
          </Canvas>
        </motion.div>
      )}
    </div>
  )
}

// Chicken that follows the mouse
function PixelChickenWithMouseFollow() {
  const [target, setTarget] = useState({ x: 0, y: 0 });
  const { size } = useThree();

  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      // Get bounding rect of the canvas to properly calibrate center
      const canvas = document.querySelector('canvas');
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      // Mouse position relative to canvas
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      setTarget({ x, y });
    }
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [size]);

  // Scale set to exactly 0.7 to match the memory requirements
  // Positioned to be horizontally centered
  // Pass undefined for health and maxHealth to hide the health bar in the viewer
  return (
    <group scale={[0.7, 0.7, 0.7]} position={[0, -0.2, 0]}>
      <PixelChicken 
        position={[0, 0, 0]} 
        headTarget={target} 
        health={undefined} 
        maxHealth={undefined} 
      />
    </group>
  );
}

type PixelChickenProps = {
  position: THREE.Vector3 | [number, number, number]; // Accept Vector3 or array
  rotation?: THREE.Euler | [number, number, number]; // Accept Euler or array
  colors?: { [key: string]: string }; // Optional colors override
  headTarget?: { x: number; y: number };
  isPecking?: boolean; // Flag for peck attack animation
  isWalking?: boolean; // Flag for walking animation
  isJumping?: boolean; // Flag for jumping animation
  disableBobbing?: boolean; // Flag to disable bobbing animation
  isHitFlashing?: boolean; // Flag for hit flash effect
  isDying?: boolean; // Flag for death animation
  health?: number; // Current health for health bar
  maxHealth?: number; // Max health for health bar
  isPlayer?: boolean; // Flag to indicate if this is the player
};

// Export the PixelChicken component for use in other files
export function PixelChicken({ 
  position, 
  rotation, 
  colors: inputColors, 
  headTarget, 
  isPecking = false, 
  isWalking = false,
  isJumping = false,
  disableBobbing = false,
  isHitFlashing = false,
  isDying = false,
  health = 3,
  maxHealth = 3,
  isPlayer = false
}: PixelChickenProps) {
  const chickenRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);
  const neckRef = useRef<THREE.Group>(null);
  const tailRef = useRef<THREE.Group>(null);
  const leftLegRef = useRef<THREE.Group>(null);
  const rightLegRef = useRef<THREE.Group>(null);
  const beakRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null);
  const healthBarRef = useRef<THREE.Mesh>(null);
  
  // Default colors for the chicken parts
  const defaultColors: { [key: string]: string } = {
    body: "#f97316", // Original orange body
    comb: "#ef4444", // Original red
    beak: "#FFD600", // Brighter yellow
    legs: "#FFD600", // Brighter yellow
    tail: "#6366f1", // Original muted blue
    eyes: "#fff", // White
    pupils: "#222"
  };

  // Use provided colors or defaults
  const parts = { ...defaultColors, ...(inputColors || {}) }; // Merge defaults with input colors

  // Create a ref for all materials to apply hit flash effect
  const materialsRef = useRef<THREE.MeshStandardMaterial[]>([]);
  
  // Store original colors to restore after flash
  const originalColorsRef = useRef<{[key: string]: string}>(parts);

  // Death animation state
  const [deathAnimProgress, setDeathAnimProgress] = useState(0); // 0 to 1 for death animation
  const deathAnimDuration = 0.5; // seconds

  // Apply hit flash effect
  useEffect(() => {
    if (!materialsRef.current) return;
    
    // Apply red flash to all materials when hit
    materialsRef.current.forEach(material => {
      if (isHitFlashing) {
        material.color.set('#FF0000'); // Bright red for hit flash
        material.emissive.set('#FF3333'); // Add emissive glow for more impact
        material.emissiveIntensity = 0.5;
      } else {
        // Restore original colors
        const partName = material.userData.partName;
        if (partName && originalColorsRef.current[partName]) {
          material.color.set(originalColorsRef.current[partName]);
          material.emissive.set('#000000');
          material.emissiveIntensity = 0;
        }
      }
    });
  }, [isHitFlashing]);

  // Reset death animation state and model scale when isDying changes
  useEffect(() => {
    if (isDying) {
      setDeathAnimProgress(0); // Start animation from beginning
    } else {
      // Reset scale if transitioning out of dying state
      if (chickenRef.current) {
        chickenRef.current.scale.set(1, 1, 1);
      }
      // Reset progress if needed (e.g., if revival happens)
      if (deathAnimProgress !== 0) {
        setDeathAnimProgress(0);
      }
    }
  }, [isDying]);

  // Update health bar
  useEffect(() => {
    if (healthBarRef.current) {
      const healthPercent = Math.max(0, Math.min(1, health / maxHealth));
      
      // Scale the health bar based on current health
      if (healthBarRef.current.scale) {
        healthBarRef.current.scale.x = healthPercent;
      }
      
      // Update health bar color based on health
      const material = healthBarRef.current.material as THREE.MeshStandardMaterial;
      if (material) {
        if (healthPercent > 0.66) {
          material.color.set("#22c55e"); // green
        } else if (healthPercent > 0.33) {
          material.color.set("#eab308"); // yellow
        } else {
          material.color.set("#ef4444"); // red
        }
      }
    }
  }, [health, maxHealth]);

  const { clock } = useThree();

  // Convert position if it's an array
  const currentPosition = position instanceof THREE.Vector3 ? position : new THREE.Vector3(...position);

  let flapTime = 0;
  const flapSpeed = 4;

  // Peck animation state
  const [peckProgress, setPeckProgress] = useState(0);
  const [isPeckAnimating, setIsPeckAnimating] = useState(false);
  const peckDuration = 0.2; // Reduced duration for faster animation
  const peckAnimRef = useRef({ lastTime: 0 });

  // Walking animation state
  const [walkTime, setWalkTime] = useState(0);
  const walkSpeed = 8; // Speed of leg movement

  // Wing animation state
  const [wingState, setWingState] = useState('rest');
  const [wingTimer, setWingTimer] = useState(0);
  const [randomFlapTimer, setRandomFlapTimer] = useState(0);
  const restAngle = 0; // Wings by the side
  const maxFlapAngle = Math.PI / 3; // Flap 60 degrees outwards/upwards (adjust as needed)

  // Animate the chicken - PERFORMANCE OPTIMIZED
  useFrame((state, delta) => {
    if (!chickenRef.current) return;
    
    const time = state.clock.getElapsedTime();
    
    if (isDying) {
      if (deathAnimProgress < 1) {
        const newProgress = Math.min(1, deathAnimProgress + delta / deathAnimDuration);
        setDeathAnimProgress(newProgress);
        const flashColor = Math.sin(time * 50) > 0 ? "#ff0000" : "#ffffff";
        const scale = Math.max(0, 1 - newProgress);
        materialsRef.current.forEach(material => {
          material.emissive.set(flashColor);
          material.emissiveIntensity = 3;
          material.needsUpdate = true;
        });
        if (chickenRef.current) {
          chickenRef.current.scale.set(scale, scale, scale);
          chickenRef.current.rotation.y += delta * 10;
          chickenRef.current.rotation.x += delta * 5;
        }
      }
      return;
    }
    
    // --- PERFORMANCE OPTIMIZATION: Use delta time for smoother animations ---
    // This reduces dependency on frame rate and improves performance
    
    // --- Body Animation ---
    if (!disableBobbing && !isPecking) {
      chickenRef.current.position.y = Math.sin(time * 1.2) * 0.05;
      chickenRef.current.rotation.z = Math.sin(time * 0.4) * 0.02;
    } else {
      chickenRef.current.position.y = 0.05;
      chickenRef.current.rotation.z = 0;
    }

    // Head tracking - OPTIMIZED
    if (headRef.current && neckRef.current && headTarget) {
      const targetRotationX = Math.max(-0.4, Math.min(0.4, -headTarget.y * 0.5));
      const targetRotationY = Math.max(-0.4, Math.min(0.4, headTarget.x * 0.5));
      const headBob = Math.sin(time * 1.5) * 0.03;
      headRef.current.position.y = 0.05 + headBob;
      const lerpFactor = Math.min(1, delta * 5);
      headRef.current.rotation.y += (targetRotationY - headRef.current.rotation.y) * lerpFactor;
      headRef.current.rotation.x += (targetRotationX - headRef.current.rotation.x) * lerpFactor;
    }

    // --- Peck Animation (Modified for more head nod) ---
    if (isPecking && !isPeckAnimating) {
      setIsPeckAnimating(true);
      setPeckProgress(0);
      peckAnimRef.current.lastTime = time;
    }
    
    if (isPeckAnimating) {
      const elapsed = time - peckAnimRef.current.lastTime;
      const newProgress = Math.min(1, elapsed / peckDuration);
      setPeckProgress(newProgress);
      
      if (neckRef.current && headRef.current && beakRef.current) {
        if (newProgress < 0.5) { // Attacking phase
          const peckAmount = newProgress * 2; 
          neckRef.current.rotation.x = -0.9 * peckAmount; // More pronounced nod
          neckRef.current.position.z = 0.1 + (0.35 * peckAmount); // Neck lunges forward from its base Z (0.1)
          headRef.current.position.z = 0.1 + (0.1 * peckAmount); // Head has slight additional thrust from neck's Z (0.1)
          // Beak can stay relative or also thrust slightly
          // beakRef.current.position.z = 0.5 + 0.1 * peckAmount; 
        } else { // Returning phase
          const returnAmount = (1 - newProgress) * 2; // Symmetrical return
          neckRef.current.rotation.x = -0.9 * returnAmount;
          neckRef.current.position.z = 0.1 + (0.35 * returnAmount);
          headRef.current.position.z = 0.1 + (0.1 * returnAmount);
          // beakRef.current.position.z = 0.5 + 0.1 * returnAmount;
        }
      }
      
      if (newProgress >= 1) {
        setIsPeckAnimating(false);
        setPeckProgress(0);
      }
    } else {
      // Lerp back to resting state
      if (neckRef.current) {
        neckRef.current.rotation.x = THREE.MathUtils.lerp(neckRef.current.rotation.x, 0, 0.8);
        neckRef.current.position.z = THREE.MathUtils.lerp(neckRef.current.position.z, 0.1, 0.8); // Neck resting Z
      }
      if (headRef.current) {
        headRef.current.position.z = THREE.MathUtils.lerp(headRef.current.position.z, 0.1, 0.8); // Head resting Z relative to neck
        if (!headTarget) {
            headRef.current.rotation.x = THREE.MathUtils.lerp(headRef.current.rotation.x, 0, 0.8);
        }
        // No need to lerp beakRef.current.position.z if it's static relative to head during non-peck
        // If beak animation was added above, lerp it back here:
        // if (beakRef.current) {
        //   beakRef.current.position.z = THREE.MathUtils.lerp(beakRef.current.position.z, 0.5, 0.8);
        // }
      }
    }

    // --- Walking Animation ---
    if (isWalking) {
      // Increment walk time for animation
      setWalkTime(prevTime => prevTime + delta * walkSpeed);
      
      if (leftLegRef.current && rightLegRef.current) {
        // Create alternating leg movement
        const leftLegAngle = Math.sin(walkTime) * 0.4; // Forward/backward swing
        const rightLegAngle = Math.sin(walkTime + Math.PI) * 0.4; // Opposite phase
        
        // Apply rotation around X-axis for forward/backward movement
        leftLegRef.current.rotation.x = leftLegAngle;
        rightLegRef.current.rotation.x = rightLegAngle;
        
        // Add slight vertical movement to feet
        if (leftLegAngle > 0) {
          leftLegRef.current.position.y = 0.05; // Lift slightly when moving forward
        } else {
          leftLegRef.current.position.y = 0; // Normal position when back
        }
        
        if (rightLegAngle > 0) {
          rightLegRef.current.position.y = 0.05; // Lift slightly when moving forward
        } else {
          rightLegRef.current.position.y = 0; // Normal position when back
        }
      }
    } else if (leftLegRef.current && rightLegRef.current) {
      // Reset legs to default position when not walking
      leftLegRef.current.rotation.x = 0;
      rightLegRef.current.rotation.x = 0;
      leftLegRef.current.position.y = 0;
      rightLegRef.current.position.y = 0;
    }

    // --- Wing Animation (Modified) ---
    const leftWing = chickenRef.current.userData.leftWing as THREE.Object3D;
    const rightWing = chickenRef.current.userData.rightWing as THREE.Object3D;

    if (isJumping) {
        const flapSpeed = 15; 
        const jumpFlapAngle = Math.abs(Math.sin(time * flapSpeed)) * maxFlapAngle;
        // Apply opposite rotations for outward flapping - Swapped signs for outward effect
        if (leftWing?.rotation) leftWing.rotation.z = -jumpFlapAngle; // Changed to negative
        if (rightWing?.rotation) rightWing.rotation.z = jumpFlapAngle; // Changed to positive
        setWingState('rest'); 
        setWingTimer(0);
    } else if (!isWalking && !isPecking) { 
      setRandomFlapTimer(prevTimer => {
        if (prevTimer <= 0 && Math.random() < 0.005) { 
          setWingState('flap-up');
          return 0.3; 
        }
        return Math.max(0, prevTimer - delta);
      });

      if (wingState === 'flap-up') {
        setWingTimer(prevTimer => {
          const newTimer = prevTimer + delta * 7; 
          if (newTimer >= 1) {
            setWingState('flap-down');
            return 1;
          }
          return newTimer;
        });
      } else if (wingState === 'flap-down') {
        setWingTimer(prevTimer => {
          const newTimer = prevTimer - delta * 5; 
          if (newTimer <= 0) {
            setWingState('rest');
            return 0;
          }
          return newTimer;
        });
      }

      if (leftWing?.rotation && rightWing?.rotation) {
        let currentFlapProgress = 0;
        if (wingState === 'flap-up') currentFlapProgress = wingTimer; 
        else if (wingState === 'flap-down') currentFlapProgress = 1 - wingTimer; 
        
        const flapAmount = THREE.MathUtils.lerp(0, maxFlapAngle, currentFlapProgress);
        
        // Swapped signs for outward effect
        leftWing.rotation.z = THREE.MathUtils.lerp(leftWing.rotation.z, -flapAmount, 0.35); // Changed to negative target
        rightWing.rotation.z = THREE.MathUtils.lerp(rightWing.rotation.z, flapAmount, 0.35); // Changed to positive target
      }
    } else { 
        // Return to rest position (restAngle is 0)
        if (leftWing?.rotation) leftWing.rotation.z = THREE.MathUtils.lerp(leftWing.rotation.z, -restAngle, 0.25); // -0 is still 0
        if (rightWing?.rotation) rightWing.rotation.z = THREE.MathUtils.lerp(rightWing.rotation.z, restAngle, 0.25);
        setWingState('rest');
        setWingTimer(0);
    }
  });

  // Set initial position and rotation
  useEffect(() => {
    if (chickenRef.current) {
      chickenRef.current.position.copy(currentPosition);
      if (rotation) {
        if (Array.isArray(rotation)) {
          chickenRef.current.rotation.set(rotation[0], rotation[1], rotation[2]);
        } else {
          chickenRef.current.rotation.copy(rotation);
        }
      }
    }
  }, [currentPosition, rotation]); // Update if position or rotation props change

  // Helper function to create and register materials with the ref
  const createMaterial = (partName: keyof typeof defaultColors) => {
    const material = new THREE.MeshStandardMaterial({
      color: parts[partName] || defaultColors[partName],
      roughness: 0.8,
      metalness: 0.1
    });
    
    // Store part name in userData for reference
    material.userData.partName = partName;
    
    // Add to materials ref for hit flash effect
    materialsRef.current.push(material);
    
    return material;
  };

  return (
    <group 
      ref={chickenRef}
      position={position}
      rotation={rotation}
    >
      {/* Body - Pixelated rectangle */}
      <group ref={bodyRef} position={[0, 0.7, 0]}>
        <mesh castShadow>
          <boxGeometry args={[1, 1, 1.4]} />
          <primitive object={createMaterial('body')} />
        </mesh>
      </group>

      {/* Neck pivot point */}
      <group ref={neckRef} position={[0, 1.55, 0.1]}>
        {/* Head - Pixelated cube (now relative to neckRef) */}
        <group ref={headRef} position={[0, 0.05, 0.1]}>
          <mesh castShadow>
            <boxGeometry args={[0.8, 0.8, 0.8]} />
            <primitive object={createMaterial('body')} />
          </mesh>
          {/* Comb */}
          <mesh castShadow position={[0, 0.5, 0]}>
            <boxGeometry args={[0.2, 0.3, 0.6]} />
            <primitive object={createMaterial('comb')} />
          </mesh>
          {/* Beak */}
          <group ref={beakRef} position={[0, 0, 0.5]}>
            <mesh castShadow>
              <boxGeometry args={[0.4, 0.4, 0.4]} />
              <primitive object={createMaterial('beak')} />
            </mesh>
          </group>
          {/* Eyes - white sclera and black pupils - these should be children of headRef */}
          <mesh position={[0.22, 0.15, 0.4]}>
            <boxGeometry args={[0.16, 0.16, 0.09]} />
            <primitive object={createMaterial('eyes')} />
          </mesh>
          <mesh position={[-0.22, 0.15, 0.4]}>
            <boxGeometry args={[0.16, 0.16, 0.09]} />
            <primitive object={createMaterial('eyes')} />
          </mesh>
          {/* Pupils */}
          <mesh position={[0.22, 0.15, 0.48]}>
            <boxGeometry args={[0.07, 0.07, 0.04]} />
            <primitive object={createMaterial('pupils')} />
          </mesh>
          <mesh position={[-0.22, 0.15, 0.48]}>
            <boxGeometry args={[0.07, 0.07, 0.04]} />
            <primitive object={createMaterial('pupils')} />
          </mesh>
        </group>
      </group>

      {/* Wings - Pixelated rectangles, hinged at shoulder */}
      <group position={[0.6, 1.0, 0]} ref={el => { if (chickenRef.current) chickenRef.current.userData.rightWing = el; }}>
        <mesh castShadow position={[0, -0.4, 0]}>
          <boxGeometry args={[0.2, 0.8, 1]} />
          <primitive object={createMaterial('body')} />
        </mesh>
      </group>
      <group position={[-0.6, 1.0, 0]} ref={el => { if (chickenRef.current) chickenRef.current.userData.leftWing = el; }}>
        <mesh castShadow position={[0, -0.4, 0]}>
          <boxGeometry args={[0.2, 0.8, 1]} />
          <primitive object={createMaterial('body')} />
        </mesh>
      </group>

      {/* Legs - Pixelated rectangles */}
      <group ref={leftLegRef} position={[-0.3, 0, 0]}>
        <mesh castShadow position={[0, -0.2, 0]}>
          <boxGeometry args={[0.2, 0.8, 0.2]} />
          <primitive object={createMaterial('legs')} />
        </mesh>
        {/* Foot */}
        <mesh castShadow position={[0, -0.6, 0.2]}>
          <boxGeometry args={[0.3, 0.2, 0.4]} />
          <primitive object={createMaterial('legs')} />
        </mesh>
      </group>
      
      <group ref={rightLegRef} position={[0.3, 0, 0]}>
        <mesh castShadow position={[0, -0.2, 0]}>
          <boxGeometry args={[0.2, 0.8, 0.2]} />
          <primitive object={createMaterial('legs')} />
        </mesh>
        {/* Foot */}
        <mesh castShadow position={[0, -0.6, 0.2]}>
          <boxGeometry args={[0.3, 0.2, 0.4]} />
          <primitive object={createMaterial('legs')} />
        </mesh>
      </group>

      {/* Tail feathers - Pixelated rectangles, now with a blue highlight */}
      <group ref={tailRef} position={[0, 0.7, -0.8]} rotation={[0.4, 0, 0]}>
        {/* Main tail feather */}
        <mesh castShadow position={[0, 0, 0]}>
          <boxGeometry args={[0.8, 0.4, 0.2]} />
          <primitive object={createMaterial('tail')} />
        </mesh>
        {/* Side tail feathers */}
        <mesh castShadow position={[0.3, 0.1, 0.1]} rotation={[0, 0.2, 0]}>
          <boxGeometry args={[0.3, 0.4, 0.2]} />
          <primitive object={createMaterial('tail')} />
        </mesh>
        <mesh castShadow position={[-0.3, 0.1, 0.1]} rotation={[0, -0.2, 0]}>
          <boxGeometry args={[0.3, 0.4, 0.2]} />
          <primitive object={createMaterial('tail')} />
        </mesh>
      </group>

      {/* Player indicator (if player) - RE-COMMENTING OUT per user request
      {isPlayer && (
        <mesh position={[0, 2.2, 0]}>
          <sphereGeometry args={[0.1, 8, 8]} />
          <meshStandardMaterial color="#3b82f6" emissive="#3b82f6" emissiveIntensity={0.5} />
        </mesh>
      )}
      */}
    </group>
  )
}
