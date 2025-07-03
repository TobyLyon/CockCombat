"use client"

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { soundMap } from '@/mocks/game-data';

// Define sound volume normalizations
const SOUND_VOLUMES = {
  punch: 1.5, // Louder punch sound
  hit: 1.5, // Added hit sound at the same volume as punch
  strong_punch: 1.2,
  die: 0.8,
  jump: 0.5,
  land: 0.4,
  button: 0.3,
  music: 0.075, // Background music lower than effects - Reduced by 50% from 0.15
  battle: 0.15, // Arena battle music same as background
  win: 0.4,
  lose: 0.4,
  click: 0.2,
  collect: 0.7,
};

// Define the AudioContext type
interface AudioContextType {
  hasInteracted: boolean;
  setHasInteracted: (value: boolean) => void;
  audioEnabled: boolean;
  toggleAudio: () => void;
  volume: number;
  setVolume: (volume: number) => void;
  playSound: (sound: keyof typeof SOUND_VOLUMES | string) => void;
  playMusic: (musicPath: string) => void;
  stopMusic: () => void;
  pauseMusic: () => void;
  resumeMusic: () => void;
  playLoopedSound: (soundPath: string, loopDuration?: number) => () => void;
  playSoundWithDelay: (sound: string, delayMs: number) => void;
  playRandomSound: (sounds: string[], options?: { minDelay?: number; maxDelay?: number }) => void;
  currentMusicTrack: string | null;
}

// Create the context with default values
const AudioContext = createContext<AudioContextType | undefined>(undefined);

// Provider component
export function AudioProvider({ children }: { children: React.ReactNode }) {
  const [hasInteracted, setHasInteracted] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [volume, setVolume] = useState(0.05); // 10% volume default - Halved from 0.1
  const [currentMusicTrack, setCurrentMusicTrack] = useState<string | null>(null);
  
  // A single, stable audio element for background music.
  const backgroundMusicRef = useRef<HTMLAudioElement | null>(null);
  const audioRefs = useRef<{ [key: string]: HTMLAudioElement }>({});
  
  // Create the audio element once on mount (client-side).
  useEffect(() => {
    backgroundMusicRef.current = new Audio();
    backgroundMusicRef.current.loop = true;
    const audioEl = backgroundMusicRef.current;
    return () => {
      if (audioEl) {
        audioEl.pause();
        audioEl.src = '';
      }
    };
  }, []);
  
  // Handle user interaction to enable audio playback.
  useEffect(() => {
    const handleInteraction = () => setHasInteracted(true);
    window.addEventListener('click', handleInteraction, { once: true });
    window.addEventListener('touchstart', handleInteraction, { once: true });
    window.addEventListener('keydown', handleInteraction, { once: true });
    return () => {
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('touchstart', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
    };
  }, []);
  
  // Dedicated effect to apply volume changes from the slider.
  useEffect(() => {
    const audio = backgroundMusicRef.current;
    if (audio) {
      audio.volume = SOUND_VOLUMES.music * volume;
    }
  }, [volume]);
  
  // Dedicated effect to handle the master audio toggle (pause/resume).
  useEffect(() => {
    const audio = backgroundMusicRef.current;
    if (!audio) return;

    if (audioEnabled && audio.src && hasInteracted) {
      audio.play().catch((e) => console.error("Error resuming music:", e));
    } else {
      audio.pause();
    }
  }, [audioEnabled, hasInteracted]);
  
  const toggleAudio = useCallback(() => {
    setAudioEnabled((prev) => !prev);
  }, []);
  
  // Play a sound effect
  const playSound = useCallback((sound: string) => {
    if (!audioEnabled || !hasInteracted) return;
    
    try {
      // Get the sound path from the mapping if it exists
      const soundPath = soundMap[sound] || sound;
      if (!soundPath) return;
      
      // Create a new audio element for each sound to prevent interruption
      const audio = new Audio(soundPath);
      
      // Calculate volume based on sound type and global volume setting
      const specificVolume = SOUND_VOLUMES[sound as keyof typeof SOUND_VOLUMES] || 0.7;
      audio.volume = Math.min(1, specificVolume * volume);
      
      // Play the sound and auto-cleanup when done
      audio.play()
        .then(() => {
          audio.addEventListener('ended', () => {
            // @ts-ignore
            audio.remove();
          });
        })
        .catch(e => console.error(`Error playing sound (${sound}):`, e));
    } catch (error) {
      console.error('Error playing sound effect:', error);
    }
  }, [audioEnabled, hasInteracted, volume]);
  
  // Play background music
  const playMusic = useCallback((musicPath: string) => {
    const audio = backgroundMusicRef.current;
    if (!hasInteracted || !audio || currentMusicTrack === musicPath) {
      return;
    }

    setCurrentMusicTrack(musicPath);
    audio.src = musicPath;

    if (audioEnabled) {
      audio.play().catch((e) => console.error(`Error playing music (${musicPath}):`, e));
    }
  }, [audioEnabled, hasInteracted, currentMusicTrack]);
  
  // Stop the current music
  const stopMusic = useCallback(() => {
    const audio = backgroundMusicRef.current;
    if (audio) {
      audio.pause();
      audio.src = '';
      setCurrentMusicTrack(null);
    }
  }, []);
  
  // Pause the current music
  const pauseMusic = useCallback(() => {
    const audio = backgroundMusicRef.current;
    if (audio) {
      audio.pause();
    }
  }, []);
  
  // Resume the current music
  const resumeMusic = useCallback(() => {
    const audio = backgroundMusicRef.current;
    if (audio && audio.src && audioEnabled && hasInteracted) {
      audio.play().catch((e) => console.error("Error resuming music:", e));
    }
  }, [audioEnabled, hasInteracted]);
  
  // Play a looped sound (returns a function to stop the sound)
  const playLoopedSound = useCallback((soundPath: string, loopDuration = 0) => {
    if (!audioEnabled || !hasInteracted) return () => {};
    
    try {
      const audio = new Audio(soundPath);
      const soundKey = `loop-${Date.now()}`;
      audioRefs.current[soundKey] = audio;
      
      // Set up audio properties
      if (loopDuration <= 0) {
        audio.loop = true;
      }
      
      audio.volume = 0.7 * volume;
      
      // Play the sound
      audio.play().catch(e => console.error(`Error playing looped sound (${soundPath}):`, e));
      
      // Set up loop with seamless playback if loop duration provided
      let interval: NodeJS.Timeout | null = null;
      if (loopDuration > 0) {
        interval = setInterval(() => {
          if (audioEnabled) {
            audio.currentTime = 0;
            audio.play().catch(e => console.error(`Error looping sound (${soundPath}):`, e));
          }
        }, loopDuration);
      }
      
      // Return a cleanup function
      return () => {
        if (interval) clearInterval(interval);
        audio.pause();
        audio.src = '';
        delete audioRefs.current[soundKey];
      };
    } catch (error) {
      console.error('Error playing looped sound:', error);
      return () => {};
    }
  }, [audioEnabled, hasInteracted, volume]);
  
  // Play a sound with a delay
  const playSoundWithDelay = useCallback((sound: string, delayMs: number) => {
    if (!audioEnabled || !hasInteracted) return;
    
    setTimeout(() => {
      playSound(sound);
    }, delayMs);
  }, [audioEnabled, hasInteracted, playSound]);
  
  // Play a random sound from an array of sounds
  const playRandomSound = useCallback(
    (
      sounds: string[],
      options: { minDelay?: number; maxDelay?: number } = {}
    ) => {
      if (!audioEnabled || !hasInteracted) return

      const { minDelay = 0, maxDelay = 0 } = options
      const delay = minDelay + Math.random() * (maxDelay - minDelay)
      const randomSound = sounds[Math.floor(Math.random() * sounds.length)]

      setTimeout(() => {
        playSound(randomSound)
      }, delay)
    },
    [audioEnabled, hasInteracted, playSound]
  )
  
  // Expose the context value
  const contextValue: AudioContextType = {
    hasInteracted,
    setHasInteracted,
    audioEnabled,
    toggleAudio,
    volume,
    setVolume,
    playSound,
    playMusic,
    stopMusic,
    pauseMusic,
    resumeMusic,
    playLoopedSound,
    playSoundWithDelay,
    playRandomSound,
    currentMusicTrack
  };
  
  return (
    <AudioContext.Provider value={contextValue}>
      {children}
    </AudioContext.Provider>
  );
}

// Custom hook to use the audio context
export function useAudio() {
  const context = useContext(AudioContext);
  if (context === undefined) {
    throw new Error('useAudio must be used within an AudioProvider');
  }
  return context;
}
