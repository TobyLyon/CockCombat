import * as THREE from 'three';
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Points, PointMaterial } from '@react-three/drei';

interface PoofEffectProps {
  position: THREE.Vector3 | [number, number, number];
  count?: number;
  color?: string;
  size?: number;
  duration?: number; // Duration in milliseconds
}

export function PoofEffect({ 
  position = [0, 0.5, 0], 
  count = 50, 
  color = '#ffffff', 
  size = 0.15, 
  duration = 500 
}: PoofEffectProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const startTime = useRef(Date.now());

  // Convert position if needed
  const currentPosition = position instanceof THREE.Vector3 ? position : new THREE.Vector3(...position);

  // Generate random particle positions
  const particles = useMemo(() => {
    const temp = [];
    for (let i = 0; i < count; i++) {
      const t = Math.random() * Math.PI * 2; // Angle
      const r = Math.random() * 0.8; // Radius
      const x = Math.cos(t) * r;
      const y = Math.random() * 0.8; // Vertical spread
      const z = Math.sin(t) * r;
      temp.push(x, y, z);
    }
    return new Float32Array(temp);
  }, [count]);

  useFrame(({ clock }) => {
    if (!pointsRef.current) return;

    const elapsedTime = Date.now() - startTime.current;
    const progress = Math.min(1, elapsedTime / duration);

    // Fade out
    if (pointsRef.current.material instanceof THREE.PointsMaterial) {
      pointsRef.current.material.opacity = 1 - progress;
      pointsRef.current.material.needsUpdate = true;
    }

    // Optional: Add outward movement (can be performance intensive)
    // const scale = 1 + progress * 1.5;
    // pointsRef.current.scale.set(scale, scale, scale);

    // Hide when done
    if (progress >= 1) {
      pointsRef.current.visible = false;
    }
  });

  return (
    <Points ref={pointsRef} positions={particles} stride={3} frustumCulled={false} position={currentPosition}>
      <PointMaterial
        transparent
        color={color}
        size={size}
        sizeAttenuation={true}
        depthWrite={false}
        opacity={1} // Start fully opaque
      />
    </Points>
  );
}

export default PoofEffect;
