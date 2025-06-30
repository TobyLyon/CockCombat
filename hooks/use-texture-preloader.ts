import { useEffect, useState } from 'react';
import { preloadTextures, TEXTURES } from '@/lib/texture-loader';
import * as THREE from 'three';

type TextureKey = keyof typeof TEXTURES;

interface UseTexturePreloaderOptions {
  onProgress?: (progress: number) => void;
  onLoaded?: (textures: Map<string, THREE.Texture>) => void;
  onError?: (error: any) => void;
}

export function useTexturePreloader(
  textureKeysOrPaths: (TextureKey | string)[],
  options?: UseTexturePreloaderOptions
) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<any>(null);
  const [loadedTextures, setLoadedTextures] = useState<Map<string, THREE.Texture> | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      const pathsToLoad = textureKeysOrPaths.map(keyOrPath => {
        return TEXTURES[keyOrPath as TextureKey] || keyOrPath;
      });

      try {
        // Simple progress tracking (can be enhanced if preloadTextures supports it)
        if (options?.onProgress) {
          options.onProgress(0);
        }

        const textures = await preloadTextures(pathsToLoad);
        
        if (isMounted) {
          setLoadedTextures(textures);
          setIsLoading(false);
          if (options?.onLoaded) {
            options.onLoaded(textures);
          }
          if (options?.onProgress) { // Final progress update
            options.onProgress(1);
          }
        }
      } catch (e) {
        if (isMounted) {
          setError(e);
          setIsLoading(false);
          if (options?.onError) {
            options.onError(e);
          }
        }
      }
    }

    load();

    return () => {
      isMounted = false;
      // Optionally, could add logic here to cancel ongoing texture loading if possible
      // or clear only the textures loaded by this specific hook instance if not globally cached/managed.
    };
  }, [textureKeysOrPaths, options?.onLoaded, options?.onError, options?.onProgress]); // Re-run if keys or callbacks change

  return { isLoading, error, loadedTextures };
} 