"use client"

import { useRef, useState, useEffect } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import * as THREE from "three"

interface LoadingPixelChickenProps {
  size?: "sm" | "md" | "lg"
  text?: string
  textColor?: string
}

export default function LoadingPixelChicken({ 
  size = "md", 
  text = "Loading...",
  textColor = "text-yellow-400"
}: LoadingPixelChickenProps) {
  // Size classes based on prop
  const sizeClasses = {
    sm: "w-32 h-32",
    md: "w-48 h-48",
    lg: "w-64 h-64"
  }
  
  return (
    <div className="flex flex-col items-center justify-center">
      <div className={`${sizeClasses[size]} mb-2`}>
        <Canvas
          camera={{ position: [0, 1.4, 6], fov: 32 }}
          style={{ 
            width: '100%', 
            height: '100%', 
            background: 'transparent', 
            display: 'block', 
            margin: '0 auto', 
            padding: 0, 
            border: 'none', 
            boxSizing: 'border-box',
            imageRendering: 'pixelated'
          }}
        >
          {/* Scene lighting: increase brightness */}
          <ambientLight intensity={2.0} />
          <pointLight position={[6, 10, 6]} intensity={2.6} castShadow />
          {/* Running chicken animation */}
          <RunningPixelChicken />
        </Canvas>
      </div>
      
      {/* Loading text */}
      {text && (
        <p className={`pixel-font ${textColor} text-center`}>{text}</p>
      )}
    </div>
  )
}

function RunningPixelChicken() {
  const chickenRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);
  const leftLegRef = useRef<THREE.Group>(null);
  const rightLegRef = useRef<THREE.Group>(null);
  
  // Restore colors from the canonical implementation
  const color = "#f97316"; // Original orange body
  const parts = {
    comb: "#ef4444", // Original red
    beak: "#FFD600", // Brighter yellow
    legs: "#FFD600", // Brighter yellow
    tail: "#6366f1", // Original muted blue
    eyes: "#fff", // White
    pupils: "#222"
  };
  
  // Animate the chicken running
  useFrame(({ clock }) => {
    if (!chickenRef.current) return;
    
    const t = clock.getElapsedTime();
    
    // Bobbing motion (up and down)
    chickenRef.current.position.y = Math.sin(t * 10) * 0.1 + 0.1;
    
    // Running leg animation
    if (leftLegRef.current && rightLegRef.current) {
      // Left leg forward when right leg back and vice versa
      leftLegRef.current.rotation.x = Math.sin(t * 10) * 0.8;
      rightLegRef.current.rotation.x = Math.sin(t * 10 + Math.PI) * 0.8;
    }
    
    // Wing flapping animation
    if (chickenRef.current.userData.leftWing && chickenRef.current.userData.rightWing) {
      // Occasional wing flaps
      const wingFlapSpeed = 15;
      const wingFlapAmount = 0.3;
      const shouldFlap = Math.sin(t * 0.5) > 0.7; // Only flap occasionally
      
      if (shouldFlap) {
        chickenRef.current.userData.leftWing.rotation.z = Math.sin(t * wingFlapSpeed) * wingFlapAmount - 0.2;
        chickenRef.current.userData.rightWing.rotation.z = -Math.sin(t * wingFlapSpeed) * wingFlapAmount + 0.2;
      } else {
        // Return to rest position
        chickenRef.current.userData.leftWing.rotation.z = -0.2;
        chickenRef.current.userData.rightWing.rotation.z = 0.2;
      }
    }
    
    // Head bobbing slightly with running motion
    if (headRef.current) {
      headRef.current.rotation.x = Math.sin(t * 10) * 0.1;
    }
  });

  return (
    <group ref={chickenRef} position={[0, 0, 0]} rotation={[0, 0, 0]} scale={[0.7, 0.7, 0.7]}>
      {/* Body - Pixelated rectangle */}
      <mesh castShadow position={[0, 0.6, 0]}>
        <boxGeometry args={[1, 1, 1.5]} />
        <meshStandardMaterial color={color} roughness={0.8} metalness={0.1} />
      </mesh>

      {/* Head group (head, comb, beak, expressive eyes) */}
      <group ref={headRef} position={[0, 1.3, 0.5]}>
        {/* Head */}
        <mesh castShadow position={[0, 0, 0]}>
          <boxGeometry args={[0.8, 0.8, 0.8]} />
          <meshStandardMaterial color={color} roughness={0.8} metalness={0.1} />
        </mesh>
        {/* Comb */}
        <mesh castShadow position={[0, 0.5, 0]}>
          <boxGeometry args={[0.2, 0.3, 0.6]} />
          <meshStandardMaterial color={parts.comb} roughness={0.7} metalness={0.15} />
        </mesh>
        {/* Beak */}
        <mesh castShadow position={[0, 0, 0.5]}>
          <boxGeometry args={[0.4, 0.4, 0.4]} />
          <meshStandardMaterial color={parts.beak} roughness={0.5} metalness={0.2} />
        </mesh>
        {/* Eyes - white sclera and black pupils */}
        <mesh position={[0.22, 0.15, 0.4]}>
          <boxGeometry args={[0.16, 0.16, 0.09]} />
          <meshStandardMaterial color={parts.eyes} />
        </mesh>
        <mesh position={[-0.22, 0.15, 0.4]}>
          <boxGeometry args={[0.16, 0.16, 0.09]} />
          <meshStandardMaterial color={parts.eyes} />
        </mesh>
        {/* Pupils */}
        <mesh position={[0.22, 0.15, 0.48]}>
          <boxGeometry args={[0.07, 0.07, 0.04]} />
          <meshStandardMaterial color={parts.pupils} />
        </mesh>
        <mesh position={[-0.22, 0.15, 0.48]}>
          <boxGeometry args={[0.07, 0.07, 0.04]} />
          <meshStandardMaterial color={parts.pupils} />
        </mesh>
      </group>

      {/* Wings - Pixelated rectangles, hinged at shoulder */}
      <group position={[0.6, 1.0, 0]} ref={el => { if (chickenRef.current) chickenRef.current.userData.rightWing = el; }}>
        <mesh castShadow position={[0, -0.4, 0]}>
          <boxGeometry args={[0.2, 0.8, 1]} />
          <meshStandardMaterial color={color} roughness={0.8} metalness={0.1} />
        </mesh>
      </group>
      <group position={[-0.6, 1.0, 0]} ref={el => { if (chickenRef.current) chickenRef.current.userData.leftWing = el; }}>
        <mesh castShadow position={[0, -0.4, 0]}>
          <boxGeometry args={[0.2, 0.8, 1]} />
          <meshStandardMaterial color={color} roughness={0.8} metalness={0.1} />
        </mesh>
      </group>

      {/* Legs - Pixelated rectangles with animation */}
      <group ref={rightLegRef} position={[0.3, 0, 0]}>
        <mesh castShadow position={[0, -0.2, 0]}>
          <boxGeometry args={[0.2, 0.8, 0.2]} />
          <meshStandardMaterial color={parts.legs} roughness={0.7} metalness={0.1} />
        </mesh>
        {/* Right foot */}
        <mesh castShadow position={[0, -0.6, 0.2]}>
          <boxGeometry args={[0.3, 0.2, 0.4]} />
          <meshStandardMaterial color={parts.legs} roughness={0.7} metalness={0.1} />
        </mesh>
      </group>
      
      <group ref={leftLegRef} position={[-0.3, 0, 0]}>
        <mesh castShadow position={[0, -0.2, 0]}>
          <boxGeometry args={[0.2, 0.8, 0.2]} />
          <meshStandardMaterial color={parts.legs} roughness={0.7} metalness={0.1} />
        </mesh>
        {/* Left foot */}
        <mesh castShadow position={[0, -0.6, 0.2]}>
          <boxGeometry args={[0.3, 0.2, 0.4]} />
          <meshStandardMaterial color={parts.legs} roughness={0.7} metalness={0.1} />
        </mesh>
      </group>

      {/* Tail feathers - Pixelated rectangles, now with a blue highlight */}
      <mesh castShadow position={[0, 0.7, -0.8]} rotation={[0.4, 0, 0]}>
        <boxGeometry args={[0.8, 0.4, 0.2]} />
        <meshStandardMaterial color={parts.tail} roughness={0.7} metalness={0.15} />
      </mesh>
      <mesh castShadow position={[0.3, 0.8, -0.7]} rotation={[0.4, 0.2, 0]}>
        <boxGeometry args={[0.3, 0.4, 0.2]} />
        <meshStandardMaterial color={parts.tail} roughness={0.7} metalness={0.15} />
      </mesh>
      <mesh castShadow position={[-0.3, 0.8, -0.7]} rotation={[0.4, -0.2, 0]}>
        <boxGeometry args={[0.3, 0.4, 0.2]} />
        <meshStandardMaterial color={parts.tail} roughness={0.7} metalness={0.15} />
      </mesh>
    </group>
  )
}
