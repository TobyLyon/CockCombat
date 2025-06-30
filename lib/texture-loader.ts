import * as THREE from 'three';

// Constants for texture settings
const DEFAULT_TEXTURE_SIZE = 1024;
const DEFAULT_ANISOTROPY = 4;

// Cache for loaded textures to avoid redundant loading
const textureCache: Map<string, THREE.Texture> = new Map();

// Default texture options
interface TextureOptions {
  anisotropy?: number;
  repeat?: [number, number];
  offset?: [number, number];
  wrapS?: THREE.Wrapping;
  wrapT?: THREE.Wrapping;
  flipY?: boolean;
  maxSize?: number; // For downscaling large textures
}

/**
 * Load a texture with optimized settings and caching
 */
export function loadTexture(
  path: string, 
  options: TextureOptions = {}
): Promise<THREE.Texture> {
  // Check if texture is already in cache
  if (textureCache.has(path)) {
    const cachedTexture = textureCache.get(path)!;
    
    // Apply custom options to cached texture
    applyTextureOptions(cachedTexture, options);
    
    return Promise.resolve(cachedTexture);
  }
  
  // Load new texture
  return new Promise((resolve, reject) => {
    const loader = new THREE.TextureLoader();
    
    loader.load(
      path,
      (texture) => {
        // Optimize and configure texture
        optimizeTexture(texture, options);
        
        // Store in cache
        textureCache.set(path, texture);
        
        resolve(texture);
      },
      undefined, // onProgress not implemented
      (error) => {
        console.error(`Error loading texture ${path}:`, error);
        reject(error);
      }
    );
  });
}

/**
 * Preload a set of textures in advance
 */
export function preloadTextures(
  paths: string[], 
  options: TextureOptions = {}
): Promise<Map<string, THREE.Texture>> {
  const promises = paths.map(path => loadTexture(path, options));
  
  return Promise.all(promises)
    .then(textures => {
      const textureMap = new Map<string, THREE.Texture>();
      paths.forEach((path, index) => {
        textureMap.set(path, textures[index]);
      });
      return textureMap;
    });
}

/**
 * Apply optimization settings to a texture
 */
function optimizeTexture(texture: THREE.Texture, options: TextureOptions): void {
  // Apply custom options
  applyTextureOptions(texture, options);
  
  // Check if we need to downscale the texture
  if (options.maxSize && texture.image) {
    downscaleTextureIfNeeded(texture, options.maxSize);
  }
  
  // Apply default optimizations
  texture.needsUpdate = true;
}

/**
 * Apply texture options to a texture
 */
function applyTextureOptions(texture: THREE.Texture, options: TextureOptions): void {
  // Set anisotropy for better texture quality at angles
  texture.anisotropy = options.anisotropy || DEFAULT_ANISOTROPY;
  
  // Set texture wrapping
  if (options.wrapS !== undefined) texture.wrapS = options.wrapS;
  if (options.wrapT !== undefined) texture.wrapT = options.wrapT;
  
  // Set repeat and offset
  if (options.repeat) {
    texture.repeat.set(options.repeat[0], options.repeat[1]);
  }
  
  if (options.offset) {
    texture.offset.set(options.offset[0], options.offset[1]);
  }
  
  // Set flip Y
  if (options.flipY !== undefined) texture.flipY = options.flipY;
}

/**
 * Downscale a texture if it's larger than maxSize
 */
function downscaleTextureIfNeeded(texture: THREE.Texture, maxSize: number): void {
  if (!texture.image) return;
  
  const { width, height } = texture.image;
  
  // Skip if texture is already small enough
  if (width <= maxSize && height <= maxSize) return;
  
  // Determine scale factor to fit within maxSize
  const scale = Math.min(maxSize / width, maxSize / height);
  const newWidth = Math.floor(width * scale);
  const newHeight = Math.floor(height * scale);
  
  // Create a canvas to draw the downscaled image
  const canvas = document.createElement('canvas');
  canvas.width = newWidth;
  canvas.height = newHeight;
  
  // Draw the image at the new size
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.warn('Could not get 2D context for texture downscaling');
    return;
  }
  
  // Draw with smooth interpolation for better quality
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(texture.image, 0, 0, newWidth, newHeight);
  
  // Replace the texture image with the canvas
  texture.image = canvas;
  texture.needsUpdate = true;
}

/**
 * Create a simple colored texture (useful for debugging or placeholders)
 */
export function createColorTexture(
  color: string | number = 0xffffff
): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 4;
  
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = typeof color === 'string' ? color : `#${color.toString(16).padStart(6, '0')}`;
    ctx.fillRect(0, 0, 4, 4);
  }
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.repeat.set(1, 1);
  
  return texture;
}

/**
 * Clear the texture cache to free memory
 */
export function clearTextureCache(): void {
  // Dispose each texture properly
  textureCache.forEach(texture => {
    texture.dispose();
  });
  
  // Clear the cache
  textureCache.clear();
}

/**
 * Create a texture atlas from multiple textures
 * Useful for batching multiple textures into one for better performance
 */
export function createTextureAtlas(
  textures: Map<string, THREE.Texture>,
  atlasSize = 2048,
  padding = 2
): { 
  atlas: THREE.Texture; 
  uvMapping: Map<string, { u1: number; v1: number; u2: number; v2: number }> 
} {
  // Create a canvas for the atlas
  const canvas = document.createElement('canvas');
  canvas.width = atlasSize;
  canvas.height = atlasSize;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not get 2D context for texture atlas creation');
  }
  
  // Clear the canvas
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.fillRect(0, 0, atlasSize, atlasSize);
  
  // Simple packing algorithm - just place textures in a grid
  // For a real application, you'd want a more efficient bin packing algorithm
  const textureKeys = Array.from(textures.keys());
  const textureCount = textureKeys.length;
  const gridSize = Math.ceil(Math.sqrt(textureCount));
  const cellSize = Math.floor(atlasSize / gridSize);
  
  // Track UV mappings
  const uvMapping = new Map<string, { u1: number; v1: number; u2: number; v2: number }>();
  
  // Place each texture in the atlas
  textureKeys.forEach((key, index) => {
    const texture = textures.get(key)!;
    if (!texture.image) return;
    
    // Calculate position in grid
    const row = Math.floor(index / gridSize);
    const col = index % gridSize;
    
    // Calculate position in atlas with padding
    const x = col * cellSize + padding;
    const y = row * cellSize + padding;
    const w = cellSize - padding * 2;
    const h = cellSize - padding * 2;
    
    // Draw the texture
    ctx.drawImage(texture.image, x, y, w, h);
    
    // Store UV mapping
    uvMapping.set(key, {
      u1: x / atlasSize,
      v1: y / atlasSize,
      u2: (x + w) / atlasSize,
      v2: (y + h) / atlasSize
    });
  });
  
  // Create the atlas texture
  const atlas = new THREE.CanvasTexture(canvas);
  atlas.needsUpdate = true;
  
  return { atlas, uvMapping };
}

// Export all optimized textures
export const TEXTURES = {
  // You can add commonly used textures here as constants
  // Example:
  // GRASS: '/textures/grass.jpg',
  // DIRT: '/textures/dirt.jpg',
  ARENA_FLOOR: '/textures/grass/coast_sand_rocks_02_diff_4k.jpg',
  DIRT: '/textures/dirt.jpg',
  GRASS: '/textures/grass.jpg',
  STONE: '/textures/stone/sandy_gravel_02_diff_4k.jpg',
  WOOD: '/textures/wood/WoodFloor043_1K-JPG_Color.jpg',
}; 