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
  
  // References to audio elements
  const backgroundMusicRef = useRef<HTMLAudioElement | null>(null);
  const audioRefs = useRef<{ [key: string]: HTMLAudioElement }>({});
  
  // Handle user interaction to enable audio
  useEffect(() => {
    const handleInteraction = () => {
      if (!hasInteracted) {
        setHasInteracted(true);
        
        // Try to play silent audio to unblock audio context
        try {
          const audio = new Audio();
          audio.volume = 0;
          audio.play().catch(() => {});
        } catch (e) {
          console.error("Error initializing audio:", e);
        }
      }
    };
    
    window.addEventListener('click', handleInteraction);
    window.addEventListener('touchstart', handleInteraction);
    window.addEventListener('keydown', handleInteraction);
    
    return () => {
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('touchstart', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
    };
  }, [hasInteracted]);
  
  // Toggle audio enabled state
  const toggleAudio = useCallback(() => {
    setAudioEnabled(prev => !prev);
    // The actual play/pause logic will be handled by effects listening to audioEnabled,
    // such as the useEffect in ProfilePage.tsx or a centralized effect in AudioContext itself
    // if music playback needs to be managed more globally (e.g., persisting across pages).
  }, [setAudioEnabled]); // setAudioEnabled is stable and typically doesn't need to be a dependency
  
  // Clean up audio when unmounting
  useEffect(() => {
    return () => {
      // Clean up background music
      if (backgroundMusicRef.current) {
        backgroundMusicRef.current.pause();
        backgroundMusicRef.current.src = '';
      }
      
      // Clean up all sound effects
      Object.values(audioRefs.current).forEach(audio => {
        audio.pause();
        audio.src = '';
      });
      
      audioRefs.current = {};
    };
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
            audio.remove(); // Clean up the audio element
          });
        })
        .catch(e => console.error(`Error playing sound (${sound}):`, e));
    } catch (error) {
      console.error('Error playing sound effect:', error);
    }
  }, [audioEnabled, hasInteracted, volume]);
  
  // Play background music
  const playMusic = useCallback((musicPath: string) => {
    if (!audioEnabled || !hasInteracted) return;
    
    // If this track is already playing, don't restart it
    if (currentMusicTrack === musicPath && backgroundMusicRef.current) return;
    
    try {
      // Stop any current music
      if (backgroundMusicRef.current) {
        backgroundMusicRef.current.pause();
        backgroundMusicRef.current.src = '';
      }
      
      // Create a new audio element for music
      const audio = new Audio(musicPath);
      backgroundMusicRef.current = audio;
      
      // Set up audio properties
      audio.loop = true;
      audio.volume = SOUND_VOLUMES.music * volume;
      
      // Play the music
      audio.play()
        .then(() => {
          setCurrentMusicTrack(musicPath);
        })
        .catch(e => {
          console.error(`Error playing music (${musicPath}):`, e);
          setCurrentMusicTrack(null);
        });
    } catch (error) {
      console.error('Error playing background music:', error);
      setCurrentMusicTrack(null);
    }
  }, [audioEnabled, hasInteracted, volume, currentMusicTrack]);
  
  // Stop the current music
  const stopMusic = useCallback(() => {
    if (backgroundMusicRef.current) {
      backgroundMusicRef.current.pause();
      backgroundMusicRef.current.src = '';
      setCurrentMusicTrack(null);
    }
  }, []);
  
  // Pause the current music
  const pauseMusic = useCallback(() => {
    if (backgroundMusicRef.current) {
      backgroundMusicRef.current.pause();
    }
  }, []);
  
  // Resume the current music
  const resumeMusic = useCallback(() => {
    if (backgroundMusicRef.current && audioEnabled && hasInteracted) {
      backgroundMusicRef.current.play().catch(e => console.error("Error resuming music:", e));
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
  const playRandomSound = useCallback((sounds: string[], options?: { minDelay?: number; maxDelay?: number }) => {
    if (!audioEnabled || !hasInteracted || sounds.length === 0) return;
    
    // Default options
    const { minDelay = 0, maxDelay = 0 } = options || {};
    
    // Select a random sound
    const randomIndex = Math.floor(Math.random() * sounds.length);
    const selectedSound = sounds[randomIndex];
    
    if (minDelay === 0 && maxDelay === 0) {
      // Play immediately
      playSound(selectedSound);
    } else {
      // Calculate random delay between min and max
      const delay = minDelay + Math.floor(Math.random() * (maxDelay - minDelay + 1));
      playSoundWithDelay(selectedSound, delay);
    }
  }, [audioEnabled, hasInteracted, playSound, playSoundWithDelay]);
  
  // Update background music volume when global volume changes
  useEffect(() => {
    if (backgroundMusicRef.current) {
      backgroundMusicRef.current.volume = SOUND_VOLUMES.music * volume;
    }
  }, [volume]);
  
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
