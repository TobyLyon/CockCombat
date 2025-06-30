import React, { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';

interface OrbitingCameraProps {
  radius?: number;
  height?: number;
  orbitDuration?: number; // Duration for one full 360 orbit in seconds
  target?: THREE.Vector3;
}

const OrbitingCamera: React.FC<OrbitingCameraProps> = ({
  radius = 12,
  height = 6,
  orbitDuration = 5, // Default to 5 seconds for a full orbit
  target = new THREE.Vector3(0, 1, 0), // Look slightly above the ground
}) => {
  const cameraRef = useRef<THREE.PerspectiveCamera>(null!);
  const { clock } = useThree();

  useFrame(() => {
    if (cameraRef.current) {
      const elapsedTime = clock.getElapsedTime();
      const angle = (elapsedTime / orbitDuration) * Math.PI * 2; // Calculate angle based on time

      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      cameraRef.current.position.set(x, height, z);
      cameraRef.current.lookAt(target);
      cameraRef.current.updateProjectionMatrix(); // Important for camera changes
    }
  });

  // Set initial position and lookAt
  useEffect(() => {
    if (cameraRef.current) {
        const initialAngle = 0;
        const x = Math.cos(initialAngle) * radius;
        const z = Math.sin(initialAngle) * radius;
        cameraRef.current.position.set(x, height, z);
        cameraRef.current.lookAt(target);
        cameraRef.current.updateProjectionMatrix();
    }
  }, [radius, height, target]); // Re-run if props change

  return (
    <PerspectiveCamera
      ref={cameraRef}
      makeDefault // This camera controls the view now
      fov={60}
      // near={0.1}
      // far={1000}
    />
  );
};

export default OrbitingCamera;
