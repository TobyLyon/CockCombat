/**
 * Audio configuration file
 * This centralizes all sound settings for consistent volume levels
 */

// Sound categories with different baseline volumes
export enum SoundCategory {
  BACKGROUND_MUSIC = "backgroundMusic",
  UI = "ui",
  EFFECT = "effect",
  VOICE = "voice"
}

// Sound level configuration
export interface SoundConfig {
  category: SoundCategory;
  volumeMultiplier: number;
  // Optional override for specific sounds that need adjustment
  customVolume?: number;
}

// The main sound configuration map
export const soundConfigs: Record<string, SoundConfig> = {
  // Background music
  "background": { 
    category: SoundCategory.BACKGROUND_MUSIC, 
    volumeMultiplier: 0.02 
  },
  "arena": { 
    category: SoundCategory.BACKGROUND_MUSIC, 
    volumeMultiplier: 0.02 
  },
  
  // UI sounds
  "click": { 
    category: SoundCategory.UI, 
    volumeMultiplier: 0.2 
  },
  
  // Game effects
  "jump": { 
    category: SoundCategory.EFFECT, 
    volumeMultiplier: 0.25 
  },
  "pickup": { 
    category: SoundCategory.EFFECT, 
    volumeMultiplier: 0.25 
  },
  "punch": { 
    category: SoundCategory.EFFECT, 
    volumeMultiplier: 0.3 
  },
  "strong_punch": { 
    category: SoundCategory.EFFECT, 
    volumeMultiplier: 0.35 
  },
  "die": { 
    category: SoundCategory.EFFECT, 
    volumeMultiplier: 0.3 
  },
  
  // Voice clips
  "JESUS_CHRIST_2": { 
    category: SoundCategory.VOICE, 
    volumeMultiplier: 0.4 
  }
};

// Default multipliers by category (used as fallback)
export const defaultCategoryMultipliers: Record<SoundCategory, number> = {
  [SoundCategory.BACKGROUND_MUSIC]: 0.02,
  [SoundCategory.UI]: 0.2,
  [SoundCategory.EFFECT]: 0.3,
  [SoundCategory.VOICE]: 0.4
};

/**
 * Get the appropriate volume multiplier for a sound
 * @param soundName The name of the sound file (without extension)
 * @returns The volume multiplier to apply
 */
export function getSoundVolumeMultiplier(soundName: string): number {
  // Check if we have a specific config for this sound
  if (soundConfigs[soundName]) {
    return soundConfigs[soundName].volumeMultiplier;
  }
  
  // If no specific config, try to guess the category and use default multiplier
  if (soundName.includes("background") || soundName.includes("music")) {
    return defaultCategoryMultipliers[SoundCategory.BACKGROUND_MUSIC];
  }
  
  // Default to effect volume if we can't determine the category
  return defaultCategoryMultipliers[SoundCategory.EFFECT];
} 