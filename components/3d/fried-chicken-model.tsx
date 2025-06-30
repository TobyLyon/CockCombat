import * as THREE from 'three';
import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';

interface FriedChickenModelProps {
  position?: THREE.Vector3 | [number, number, number];
  showLabel?: boolean;
  scale?: number;
}

// Ultra-simplified fried chicken drumstick model for maximum performance
export function FriedChickenModel({ 
  position = [0, 0.5, 0], 
  showLabel = true,
  scale = 1
}: FriedChickenModelProps) {
  const groupRef = useRef<THREE.Group>(null);
  const [rotation, setRotation] = useState(0);

  // Simple materials with no real-time updates
  const boneMaterial = new THREE.MeshBasicMaterial({ color: '#f0ead6' });
  const meatMaterial = new THREE.MeshBasicMaterial({ color: '#8B4513' });
  
  // Convert position if it's an array
  const currentPosition = position instanceof THREE.Vector3 ? position : new THREE.Vector3(...position);

  // Simplified animation - just rotation
  useFrame((state) => {
    if (groupRef.current) {
      setRotation(prev => prev + 0.01);
      groupRef.current.rotation.y = rotation;
    }
  });

  return (
    <group 
      ref={groupRef} 
      position={currentPosition}
      scale={[scale, scale, scale]}
    >
      {/* Simplified model - just two parts */}
      <mesh position={[0, -0.3, 0]} material={boneMaterial}>
        <cylinderGeometry args={[0.08, 0.08, 0.4, 6]} />
      </mesh>
      
      <mesh position={[0, 0.1, 0]} material={meatMaterial}>
        <sphereGeometry args={[0.2, 6, 6]} />
      </mesh>
      
      {/* Optional text */}
      {showLabel && (
        <mesh position={[0, 0.5, 0]}>
          <Text
            fontSize={0.15}
            color="#ff4444"
            anchorX="center"
            anchorY="middle"
          >
            +1 HP
          </Text>
        </mesh>
      )}
    </group>
  );
}

export default FriedChickenModel;
