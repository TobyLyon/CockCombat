import * as THREE from 'three';
import { clearTextureCache } from './texture-loader';

// Utility to properly dispose Three.js objects and free memory
export function disposeObject3D(object: THREE.Object3D): void {
  if (!object) return;
  
  // Process all children recursively first
  if (object.children.length > 0) {
    // Create a copy of children array to avoid modification during iteration
    const children = [...object.children];
    for (const child of children) {
      disposeObject3D(child);
    }
  }
  
  // Handle materials
  if ((object as THREE.Mesh).material) {
    const materials = Array.isArray((object as THREE.Mesh).material)
      ? (object as THREE.Mesh).material
      : [(object as THREE.Mesh).material];
    
    materials.forEach((material: THREE.Material) => {
      Object.keys(material).forEach(key => {
        const value = (material as any)[key];
        if (value instanceof THREE.Texture) {
          value.dispose();
        }
      });
      material.dispose();
    });
  }
  
  // Handle geometries
  if ((object as THREE.Mesh).geometry) {
    (object as THREE.Mesh).geometry.dispose();
  }
  
  // Remove from parent
  if (object.parent) {
    object.parent.remove(object);
  }
}

// Clean up all Three.js resources
export function cleanupThreeResources(scene: THREE.Scene, renderer: THREE.WebGLRenderer): void {
  // Dispose scene and all its children
  disposeObject3D(scene);
  
  // Clean the renderer
  renderer.dispose();
  
  // Clear any cached textures
  clearTextureCache();
  
  // Force garbage collection (in environments that support it)
  if (typeof window !== 'undefined' && (window as any).gc) {
    (window as any).gc();
  }
}

// Create a simple performance monitor for Three.js
interface PerformanceStats {
  fps: number;
  drawCalls: number;
  triangles: number;
  textures: number;
  geometries: number;
  memory: number;
}

export class PerformanceMonitor {
  private renderer: THREE.WebGLRenderer;
  private lastTime: number = 0;
  private frames: number = 0;
  private stats: PerformanceStats = {
    fps: 0,
    drawCalls: 0,
    triangles: 0,
    textures: 0,
    geometries: 0,
    memory: 0,
  };
  
  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    this.lastTime = performance.now();
  }
  
  update(): void {
    // Update frame counter
    this.frames++;
    
    // Calculate FPS every second
    const now = performance.now();
    if (now >= this.lastTime + 1000) {
      this.stats.fps = Math.round((this.frames * 1000) / (now - this.lastTime));
      this.frames = 0;
      this.lastTime = now;
      
      // Get rendering stats
      const info = this.renderer.info;
      this.stats.drawCalls = info.render.calls;
      this.stats.triangles = info.render.triangles;
      this.stats.textures = info.memory.textures;
      this.stats.geometries = info.memory.geometries;
      
      // Get memory usage if available
      if (performance && (performance as any).memory) {
        this.stats.memory = Math.round((performance as any).memory.usedJSHeapSize / (1024 * 1024));
      }
    }
  }
  
  getStats(): PerformanceStats {
    return { ...this.stats };
  }
  
  reset(): void {
    this.frames = 0;
    this.lastTime = performance.now();
    this.renderer.info.reset();
  }
}

// Helper to optimize shadows for performance
export function optimizeShadows(
  renderer: THREE.WebGLRenderer, 
  light: THREE.DirectionalLight | THREE.SpotLight,
  options: {
    mapSize?: number;
    bias?: number;
    normalBias?: number;
  } = {}
): void {
  const { mapSize = 1024, bias = -0.001, normalBias = 0.001 } = options;
  
  // Set renderer shadow properties
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Softer shadows, but more performance cost
  
  // Configure the light
  light.castShadow = true;
  
  // Configure shadow properties
  light.shadow.mapSize.width = mapSize;
  light.shadow.mapSize.height = mapSize;
  light.shadow.bias = bias;
  light.shadow.normalBias = normalBias;
  
  // Optimize shadow camera
  if (light instanceof THREE.DirectionalLight) {
    // For directional lights, set tight frustum
    const shadowCamera = light.shadow.camera as THREE.OrthographicCamera;
    shadowCamera.near = 0.5;
    shadowCamera.far = 50;
    
    // Set bounds based on scene size (adjust these values for your scene)
    const size = 20;
    shadowCamera.left = -size;
    shadowCamera.right = size;
    shadowCamera.top = size;
    shadowCamera.bottom = -size;
    shadowCamera.updateProjectionMatrix();
  } else if (light instanceof THREE.SpotLight) {
    // For spot lights, adjust parameters
    light.shadow.camera.near = 0.5;
    light.shadow.camera.far = 50;
    light.shadow.camera.fov = 30;
    light.shadow.camera.updateProjectionMatrix();
  }
}

// Helper to create instanced meshes for better performance
export function createInstancedMeshes(
  geometry: THREE.BufferGeometry,
  material: THREE.Material | THREE.Material[],
  positions: Array<THREE.Vector3 | [number, number, number]>,
  rotations?: Array<THREE.Euler | [number, number, number]>,
): THREE.InstancedMesh {
  // Create the instanced mesh
  const instancedMesh = new THREE.InstancedMesh(
    geometry,
    Array.isArray(material) ? material[0] : material,
    positions.length
  );
  
  // Set the matrix for each instance
  const matrix = new THREE.Matrix4();
  positions.forEach((position, i) => {
    // Convert position to Vector3 if it's an array
    const pos = position instanceof THREE.Vector3 
      ? position 
      : new THREE.Vector3(position[0], position[1], position[2]);
    
    // Set position
    matrix.setPosition(pos);
    
    // Apply rotation if provided
    if (rotations && rotations[i]) {
      const rotation = rotations[i];
      const quaternion = new THREE.Quaternion();
      
      if (rotation instanceof THREE.Euler) {
        quaternion.setFromEuler(rotation);
      } else {
        quaternion.setFromEuler(new THREE.Euler(rotation[0], rotation[1], rotation[2]));
      }
      
      // Apply rotation
      const rotationMatrix = new THREE.Matrix4().makeRotationFromQuaternion(quaternion);
      matrix.multiply(rotationMatrix);
    }
    
    // Set the matrix for this instance
    instancedMesh.setMatrixAt(i, matrix);
  });
  
  // Update the matrix data
  instancedMesh.instanceMatrix.needsUpdate = true;
  
  return instancedMesh;
}

// Helper to create low-poly models for performance
export function createLowPolyModel(detail: 'low' | 'medium' | 'high' = 'medium'): {
  sphere: THREE.SphereGeometry;
  box: THREE.BoxGeometry;
  cylinder: THREE.CylinderGeometry;
} {
  // Set polycount based on detail level
  let segments: number;
  switch (detail) {
    case 'low':
      segments = 8;
      break;
    case 'high':
      segments = 32;
      break;
    case 'medium':
    default:
      segments = 16;
      break;
  }
  
  // Create optimized geometries
  return {
    sphere: new THREE.SphereGeometry(1, segments, segments / 2),
    box: new THREE.BoxGeometry(1, 1, 1),
    cylinder: new THREE.CylinderGeometry(1, 1, 1, segments),
  };
}

// Helper function to check if webgl2 is available and supports all needed features
export function checkWebGLSupport(): { supported: boolean; reason?: string } {
  if (typeof window === 'undefined') {
    return { supported: false, reason: 'Browser environment not available' };
  }
  
  // Check for WebGL2 support
  const canvas = document.createElement('canvas');
  let gl: WebGL2RenderingContext | null = null;
  
  try {
    gl = canvas.getContext('webgl2');
    
    if (!gl) {
      return { supported: false, reason: 'WebGL2 not supported by browser' };
    }
    
    // Check for necessary extensions
    const extensions = [
      'EXT_color_buffer_float',
      'OES_texture_float_linear'
    ];
    
    for (const ext of extensions) {
      if (!gl.getExtension(ext)) {
        return { supported: false, reason: `WebGL extension ${ext} not supported` };
      }
    }
    
    // Check for maximum texture size
    const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    if (maxTextureSize < 4096) {
      return { supported: false, reason: `Maximum texture size (${maxTextureSize}) is too small` };
    }
    
    return { supported: true };
  } catch (e) {
    return { supported: false, reason: `Error checking WebGL support: ${e}` };
  } finally {
    // Clean up
    if (gl) {
      const loseContext = gl.getExtension('WEBGL_lose_context');
      if (loseContext) {
        loseContext.loseContext();
      }
    }
  }
} 