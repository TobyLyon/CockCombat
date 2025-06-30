"use client"

import { useRef, useEffect } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"

export default function FriedChicken({ position }) {
  const legRef = useRef()
  const particlesRef = useRef([])
  const startTime = useRef(Date.now())

  // Create sizzle particles
  useEffect(() => {
    // Create particles for sizzle effect
    for (let i = 0; i < 10; i++) {
      particlesRef.current.push({
        position: new THREE.Vector3(
          position[0] + (Math.random() - 0.5) * 0.5,
          position[1] + Math.random() * 0.5,
          position[2] + (Math.random() - 0.5) * 0.5,
        ),
        velocity: new THREE.Vector3((Math.random() - 0.5) * 0.02, Math.random() * 0.05, (Math.random() - 0.5) * 0.02),
        size: Math.random() * 0.1 + 0.05,
        lifetime: Math.random() * 1000 + 1000,
      })
    }
  }, [])

  // Animate fried chicken and particles
  useFrame(() => {
    if (legRef.current) {
      // Rotate the chicken leg
      legRef.current.rotation.y += 0.01
    }

    // Update particles
    const currentTime = Date.now()
    const elapsed = currentTime - startTime.current

    particlesRef.current.forEach((particle, index) => {
      if (elapsed < particle.lifetime) {
        particle.position.add(particle.velocity)
      }
    })
  })

  return (
    <group position={position}>
      {/* Fried chicken leg */}
      <group ref={legRef}>
        <mesh castShadow position={[0, 0.2, 0]} rotation={[0, 0, Math.PI / 4]}>
          <cylinderGeometry args={[0.15, 0.3, 0.8, 8]} />
          <meshStandardMaterial color="#d97706" />
        </mesh>
        <mesh castShadow position={[0, 0.6, 0]}>
          <sphereGeometry args={[0.3, 8, 8]} />
          <meshStandardMaterial color="#d97706" />
        </mesh>
      </group>

      {/* Sizzle particles */}
      {particlesRef.current.map((particle, index) => (
        <mesh key={index} position={particle.position.toArray()}>
          <sphereGeometry args={[particle.size, 4, 4]} />
          <meshBasicMaterial color="#f97316" transparent opacity={0.7} />
        </mesh>
      ))}
    </group>
  )
}
