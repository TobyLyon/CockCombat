"use client"

import { useRef, useState, useEffect } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"

type FriedChickenProps = {
  position: THREE.Vector3;
  fadeOut?: boolean;
}

export default function FriedChicken({ position, fadeOut = false }: FriedChickenProps) {
  const groupRef = useRef<THREE.Group>(null);
  const [opacity, setOpacity] = useState(1.0);
  
  // Handle fade out animation for defeated chickens
  useEffect(() => {
    if (fadeOut) {
      const timer = setTimeout(() => {
        setOpacity(0);
      }, 2000); // Start fading after 2 seconds
      
      return () => clearTimeout(timer);
    }
  }, [fadeOut]);
  
  // Animate the fried chicken
  useFrame((state) => {
    if (groupRef.current) {
      // Floating animation
      groupRef.current.position.y = position.y + Math.sin(state.clock.getElapsedTime() * 2) * 0.1;
      
      // Slow rotation
      groupRef.current.rotation.y += 0.01;
      
      // Handle opacity for fadeout
      if (fadeOut && opacity > 0) {
        setOpacity((prev) => Math.max(0, prev - 0.01));
      }
    }
  });
  
  return (
    <group 
      ref={groupRef} 
      position={[position.x, position.y, position.z]}
      scale={fadeOut ? 0.7 : 0.5} // Smaller for pickups, larger for defeated chickens
    >
      {/* Main body - fried chicken piece */}
      <mesh castShadow>
        <sphereGeometry args={[0.5, 8, 6]} />
        <meshStandardMaterial 
          color="#CD853F" 
          roughness={0.8}
          transparent={fadeOut}
          opacity={opacity}
        />
      </mesh>
      
      {/* Crispy coating bits */}
      <mesh position={[0.2, 0.2, 0.2]} castShadow>
        <sphereGeometry args={[0.2, 6, 4]} />
        <meshStandardMaterial 
          color="#8B4513" 
          roughness={1.0}
          transparent={fadeOut}
          opacity={opacity}
        />
      </mesh>
      
      <mesh position={[-0.2, 0.1, -0.2]} castShadow>
        <sphereGeometry args={[0.25, 6, 4]} />
        <meshStandardMaterial 
          color="#8B4513" 
          roughness={1.0}
          transparent={fadeOut}
          opacity={opacity}
        />
      </mesh>
      
      {/* Steam particles for fresh fried chicken (only for health pickups) */}
      {!fadeOut && (
        <>
          <mesh position={[0, 0.6, 0]} castShadow>
            <sphereGeometry args={[0.1, 6, 4]} />
            <meshStandardMaterial 
              color="white" 
              transparent
              opacity={0.6}
            />
          </mesh>
          <mesh position={[0.1, 0.8, 0.1]} castShadow>
            <sphereGeometry args={[0.08, 6, 4]} />
            <meshStandardMaterial 
              color="white" 
              transparent
              opacity={0.4}
            />
          </mesh>
          <mesh position={[-0.1, 0.7, -0.1]} castShadow>
            <sphereGeometry args={[0.07, 6, 4]} />
            <meshStandardMaterial 
              color="white" 
              transparent
              opacity={0.3}
            />
          </mesh>
        </>
      )}
      
      {/* Glow effect for health pickups */}
      {!fadeOut && (
        <pointLight 
          position={[0, 0, 0]} 
          color="#ff9900" 
          intensity={1} 
          distance={2}
        />
      )}
    </group>
  );
}
