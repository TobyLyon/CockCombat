"use client"

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import * as THREE from 'three';
import { mockPlayers, soundMap } from '@/mocks/game-data';
import { useProfile } from '@/contexts/ProfileContext';
import { useWallet } from '@/hooks/use-wallet';
import { useAudio } from './AudioContext'; // Import useAudio

// Define player status interface
export interface PlayerStatus {
  id: string;
  name?: string; // Add name to the player status interface
  isPlayer: boolean;
  isAi?: boolean; // Distinguish AI vs human opponents for arena sync
  position: THREE.Vector3 | [number, number, number]; // Allow both Vector3 and tuple format
  rotation: THREE.Euler | [number, number, number]; // Allow both Euler and tuple format
  colors?: { [key: string]: string }; // Optional color overrides for customization
  hp: number;
  maxHp: number;
  isAlive: boolean;
  visible: boolean;
  isHitFlashing?: boolean;
  lastHitTime?: number;
  isWalking?: boolean; // Added for animation state
  isPecking?: boolean; // Added for animation state
  isJumping?: boolean; // Added for animation state
}

// Define the possible game states
export type GameState = "lobby" | "queue" | "battle" | "gameOver" | "winner";

// Define main context type
interface GameStateContextType {
  gameState: GameState;
  setGameState: (state: GameState) => void;
  volume: number;
  setVolume: (volume: number) => void;
  audioEnabled: boolean;
  toggleAudio: () => void;
  playerChicken: any; // Define more specifically later
  players: PlayerStatus[];
  playSound: (sound: string) => void;
  handlePlayerDamage: (targetPlayerId: string, damageAmount?: number, attackerId?: string) => void;
  chickensLeft: number;
  inQueue: boolean;
  joinQueue: () => void;
  leaveQueue: () => void;
  startBattle: () => void;
  endBattle: () => void;
  exitBattle: () => void;
  returnToMainMenu: () => void;
  lobbyPlayers: PlayerStatus[];
  positionLobbyPlayers: () => void;
  lastDefeatedChickenId: string | null;
  lastKillerId: string | null;
  hasInteracted: boolean;
  setHasInteracted: (value: boolean) => void;
  prizeAmount: number; // Track the prize amount for the winner
  // Sync roster for the secondary confirmation from live lobby/socket
  syncLobbyPlayers: (players: Array<{ playerId: string; username?: string; chickenName?: string; isAi?: boolean }>) => void;
  matchMeta?: { amount: number; currency: string; matchType: string; humanCount: number } | null;
  setMatchMeta: (meta: { amount: number; currency: string; matchType: string; humanCount: number }) => void;
  battleStartAt: number | null;
  battleEndAt: number | null;
}

// Create the context with default values
const GameStateContext = createContext<GameStateContextType | undefined>(undefined);

// Define the chickenFeetOffsetY constant
const chickenFeetOffsetY = 0.7;

// Function to generate positions around the ring for opponents
const generateOpponentPositions = (count: number, radius: number) => {
  const positions = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const x = Math.cos(angle) * (radius * 0.85); // Position at 85% of radius
    const z = Math.sin(angle) * (radius * 0.85);
    
    positions.push({
      position: new THREE.Vector3(x, chickenFeetOffsetY, z),  // Set proper Y height
      rotation: new THREE.Euler(0, Math.atan2(-x, -z), 0) // Face center
    });
  }
  return positions;
};

// Function to generate random chicken colors (used for AIs/tests)
const generateChickenColors = () => {
  // Create different color themes
  const colorThemes = [
    // Natural chicken colors
    {
      body: '#A52A2A', // Brown
      comb: '#FF0000', // Red
      beak: '#FFA500', // Orange
      legs: '#FFA500', // Orange
      tail: '#A52A2A', // Brown
      eyes: '#FFFFFF', // White 8-bit specs for all chickens
      pupils: '#000000'  // Black
    },
    {
      body: '#F5F5DC', // Beige
      comb: '#FF0000', // Red
      beak: '#FFA500', // Orange
      legs: '#FFA500', // Orange
      tail: '#F5F5DC', // Beige
      eyes: '#FFFFFF', // White 8-bit specs for all chickens
      pupils: '#000000'  // Black
    },
    {
      body: '#8B4513', // Brown
      comb: '#FF0000', // Red
      beak: '#FFA500', // Orange
      legs: '#FFA500', // Orange
      tail: '#8B4513', // Brown
      eyes: '#FFFFFF', // White 8-bit specs for all chickens
      pupils: '#000000'  // Black
    },
    // Exotic colors
    {
      body: '#4B0082', // Indigo
      comb: '#FF00FF', // Magenta
      beak: '#FFFF00', // Yellow
      legs: '#FFFF00', // Yellow
      tail: '#4B0082', // Indigo
      eyes: '#FFFFFF', // White 8-bit specs for all chickens
      pupils: '#000000'  // Black
    },
    {
      body: '#008000', // Green
      comb: '#FF0000', // Red
      beak: '#FFFF00', // Yellow 
      legs: '#FFFF00', // Yellow
      tail: '#008000', // Green
      eyes: '#FFFFFF', // White 8-bit specs for all chickens
      pupils: '#000000'  // Black
    },
    {
      body: '#0000FF', // Blue
      comb: '#FF0000', // Red
      beak: '#FFA500', // Orange
      legs: '#FFA500', // Orange
      tail: '#0000FF', // Blue
      eyes: '#FFFFFF', // White 8-bit specs for all chickens
      pupils: '#000000'  // Black
    },
    {
      body: '#800080', // Purple
      comb: '#FF00FF', // Magenta
      beak: '#FFFF00', // Yellow
      legs: '#FFFF00', // Yellow
      tail: '#800080', // Purple
      eyes: '#FFFFFF', // White 8-bit specs for all chickens
      pupils: '#000000'  // Black
    },
    {
      body: '#FF1493', // Pink
      comb: '#FF00FF', // Magenta
      beak: '#FFFF00', // Yellow
      legs: '#FFFF00', // Yellow
      tail: '#FF1493', // Pink
      eyes: '#FFFFFF', // White 8-bit specs for all chickens
      pupils: '#000000'  // Black
    }
  ];
  
  // Randomly select a color theme (70% chance of natural, 30% chance of exotic)
  let selectedTheme;
  if (Math.random() < 0.7) {
    // Select natural colors (indices 0-2)
    selectedTheme = colorThemes[Math.floor(Math.random() * 3)];
  } else {
    // Select exotic colors (indices 3-7)
    selectedTheme = colorThemes[3 + Math.floor(Math.random() * 5)];
  }
  
  return selectedTheme;
};

// Deterministic color assignment per player id to keep visuals in sync across clients
const getDeterministicColorsForId = (id: string) => {
  const colorThemes = [
    { body: '#A52A2A', comb: '#FF0000', beak: '#FFA500', legs: '#FFA500', tail: '#A52A2A', eyes: '#FFFFFF', pupils: '#000000' },
    { body: '#F5F5DC', comb: '#FF0000', beak: '#FFA500', legs: '#FFA500', tail: '#F5F5DC', eyes: '#FFFFFF', pupils: '#000000' },
    { body: '#8B4513', comb: '#FF0000', beak: '#FFA500', legs: '#FFA500', tail: '#8B4513', eyes: '#FFFFFF', pupils: '#000000' },
    { body: '#4B0082', comb: '#FF00FF', beak: '#FFFF00', legs: '#FFFF00', tail: '#4B0082', eyes: '#FFFFFF', pupils: '#000000' },
    { body: '#008000', comb: '#FF0000', beak: '#FFFF00', legs: '#FFFF00', tail: '#008000', eyes: '#FFFFFF', pupils: '#000000' },
    { body: '#0000FF', comb: '#FF0000', beak: '#FFA500', legs: '#FFA500', tail: '#0000FF', eyes: '#FFFFFF', pupils: '#000000' },
    { body: '#800080', comb: '#FF00FF', beak: '#FFFF00', legs: '#FFFF00', tail: '#800080', eyes: '#FFFFFF', pupils: '#000000' },
    { body: '#FF1493', comb: '#FF00FF', beak: '#FFFF00', legs: '#FFFF00', tail: '#FF1493', eyes: '#FFFFFF', pupils: '#000000' },
  ];
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash) + id.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % colorThemes.length;
  return colorThemes[idx];
}

// Generate additional mock opponents for testing
const generateMockOpponents = (count: number) => {
  const ringRadius = 15; // Match the arena radius
  const positions = generateOpponentPositions(count, ringRadius);
  
  return Array.from({ length: count }).map((_, index) => {
    // Generate a random color scheme
    const colors = generateChickenColors();
    
    return {
      id: `opponent-${index + 1}`,
      isPlayer: false,
      position: positions[index].position,
      rotation: positions[index].rotation,
      colors,
      hp: 3,
      maxHp: 3,
      isAlive: true,
      visible: true,
      isHitFlashing: false,
      lastHitTime: 0
    };
  });
};

// Initialize with player only - opponents will be added from lobby
const initialPlayers = [...mockPlayers];

// Provider component
export function GameStateProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useProfile();
  const { publicKey } = useWallet();
  // Game state
  const [gameState, setGameState] = useState<GameState>('lobby');
  const [selectedChicken, setSelectedChicken] = useState<any>(null);
  const [inQueue, setInQueue] = useState(false);
  const [lobbyPlayers, setLobbyPlayers] = useState<PlayerStatus[]>([]);
  const [chickensLeft, setChickensLeft] = useState(7); // Start with 7 chickens (including player)
  const [lastDefeatedChickenId, setLastDefeatedChickenId] = useState<string | null>(null);
  const [lastKillerId, setLastKillerId] = useState<string | null>(null);
  const [prizeAmount, setPrizeAmount] = useState(0); // Track prize amount for winner
  const [matchMeta, setMatchMeta] = useState<{ amount: number; currency: string; matchType: string; humanCount: number } | null>(null);
  const [battleStartAt, setBattleStartAt] = useState<number | null>(null);
  const [battleEndAt, setBattleEndAt] = useState<number | null>(null);
  
  // Player data - use mock data from mocks/game-data.ts
  const [players, setPlayers] = useState<PlayerStatus[]>(initialPlayers);
  
  // Audio state - Get interaction state from useAudio
  const { hasInteracted } = useAudio(); 
  const backgroundMusicRef = useRef<HTMLAudioElement | null>(null);
  // Secondary music layer for lobby/queue (main song)
  const songMusicRef = useRef<HTMLAudioElement | null>(null);
  const audioRefs = useRef<{ [key: string]: HTMLAudioElement }>({}); // Keep for sound effects
  const [volume, setVolume] = useState(0.1); // Changed from 0.5 to 0.1 (10%)
  const [audioEnabled, setAudioEnabled] = useState(true); // Keep local enabled control for now

  // Track current music track and its source
  const [currentMusicTrack, setCurrentMusicTrack] = useState<'background' | 'arena' | null>(null);

  // Sound volume normalizations
  const SOUND_VOLUMES = {
    punch: 1.8,
    hit: 1.8,
    strong_punch: 0.7, // ~-3 dB relative trim for killshots
    die: 0.8,
    pickup: 0.7,
    jump: 0.5,
    click: 1.2,
    button: 1.2,
    countdown: 1.4, // louder countdown ping
    arena: 0.4,
    background: 0.3
  };

  // Sound mappings
  const soundMap: { [key: string]: string } = {
    punch: '/sounds/punch.mp3',
    hit: '/sounds/punch.mp3',
    strong_punch: '/sounds/strong_punch.mp3',
    death: '/sounds/die.mp3',
    pickup: '/sounds/pickup.mp3',
    jump: '/sounds/jump.mp3',
    click: '/sounds/click.mp3',
    button: '/sounds/click.mp3',
    countdown: '/sounds/click.mp3',
    // Additional common SFX keys used across components
    bump: '/sounds/punch.mp3',
    success: '/sounds/pickup.mp3',
    error: '/sounds/die.mp3',
    arena: '/sounds/arena.mp3',
    background: '/sounds/background.mp3',
    background_music: '/sounds/background.mp3',
    battle_start: '/sounds/arena.mp3',
    victory: '/sounds/JESUS_CHRIST_2.mp3',
    killstreak: '/sounds/killstreaks/chicken_spree.mp3'
  };

  // Initialize background music player
  const playBackgroundMusic = useCallback((track: 'background' | 'arena') => {
    const trackPath = track === 'background'
      ? '/sounds/chicken-soundscape.mp3'
      : '/sounds/arena.mp3';
    
    // Create audio element if it doesn't exist
    if (!backgroundMusicRef.current) {
      backgroundMusicRef.current = new Audio(trackPath);
      backgroundMusicRef.current.loop = true;
    }
    
    // Only change source if we're switching tracks
    if (currentMusicTrack !== track) {
      backgroundMusicRef.current.src = trackPath;
      setCurrentMusicTrack(track);
    }
    
    // Set the appropriate volume
    const clampedVolume = Math.max(0, Math.min(1, volume));
    backgroundMusicRef.current.volume = track === 'background' 
      ? Math.min(1.0, clampedVolume * 1.5)
      : clampedVolume;
    
    // Play only if audio is enabled
    if (audioEnabled && hasInteracted) {
      backgroundMusicRef.current.play().catch(console.error);
    }
  }, [volume, audioEnabled, hasInteracted, currentMusicTrack]);

  // === DEBUG PERFORMANCE ISSUES ===
  // Store all Three.js objects that need proper cleanup when unmounted
  const threejsResources = useRef<{
    geometries: THREE.BufferGeometry[];
    materials: THREE.Material[];
    textures: THREE.Texture[];
  }>({
    geometries: [],
    materials: [],
    textures: []
  });

  // Register a Three.js resource for disposal
  const registerForCleanup = useCallback((type: 'geometry' | 'material' | 'texture', obj: any) => {
    if (type === 'geometry') threejsResources.current.geometries.push(obj);
    if (type === 'material') threejsResources.current.materials.push(obj);
    if (type === 'texture') threejsResources.current.textures.push(obj);
  }, []);

  // Clean up Three.js resources
  const disposeThreejsResources = useCallback(() => {
    console.log('Disposing Three.js resources...');
    
    // Dispose geometries
    threejsResources.current.geometries.forEach(geometry => {
      if (geometry.dispose) {
        geometry.dispose();
      }
    });
    
    // Dispose materials
    threejsResources.current.materials.forEach(material => {
      if (material.dispose) {
        // Check if the material has a 'map' property and if it's a texture that can be disposed
        if ('map' in material && material.map instanceof THREE.Texture) {
          material.map.dispose();
        }
        material.dispose();
      }
    });
    
    // Dispose textures
    threejsResources.current.textures.forEach(texture => {
      if (texture.dispose) {
        texture.dispose();
      }
    });
    
    // Reset reference arrays
    threejsResources.current = {
      geometries: [],
      materials: [],
      textures: []
    };
  }, []);

  // Use a different approach for player death that doesn't modify scene graph excessively
  const handlePlayerDamage = (targetPlayerId: string, damageAmount = 1, attackerId?: string) => {
    let targetPlayer: PlayerStatus | undefined;
    let newHp = 0;
    
    // Use the functional form of setPlayers to ensure we have the latest state
    setPlayers(currentPlayers => {
      targetPlayer = currentPlayers.find(p => p.id === targetPlayerId);
      
      if (!targetPlayer || !targetPlayer.isAlive) {
        return currentPlayers; // Return current state if target is not valid
      }
      
      const amount = Math.max(1, Math.min(3, Number(damageAmount)));
      newHp = targetPlayer.hp - amount;
      // Play regular hit sound on non-lethal hits
      const isKillshot = newHp <= 0;
      playSound(isKillshot ? 'strong_punch' : 'punch');
      
      if (newHp <= 0) {
        // Player is defeated
        setLastDefeatedChickenId(targetPlayerId);
        if (attackerId) setLastKillerId(String(attackerId));
        
        const updatedPlayers = currentPlayers.map(p =>
          p.id === targetPlayerId ? { ...p, hp: 0, isAlive: false, visible: false } : p
        );

        // Check for winner
        const alivePlayers = updatedPlayers.filter(p => p.isAlive);
        if (alivePlayers.length <= 1) {
          if (alivePlayers.length === 1) {
            const winner = alivePlayers[0];
            console.log(`Winner found: ${winner.id}`);
            setPrizeAmount(updatedPlayers.length);
            // Trigger victory sound for the winner locally
            try { playSound('victory'); } catch {}
          } else {
            console.log("All players defeated.");
            setPrizeAmount(0);
          }
          setBattleEndAt(Date.now());
          setGameState('gameOver');
        }
        return updatedPlayers;
        
      } else {
        // Player is hit but not defeated
        return currentPlayers.map(p =>
          p.id === targetPlayerId ? { ...p, hp: newHp, isHitFlashing: true, lastHitTime: Date.now() } : p
        );
      }
    });
  };
  
  // Clear hit flash effect after a short duration
  useEffect(() => {
    // Automatically clear hit flash effects
    const clearHitFlash = setInterval(() => {
      setPlayers(prevPlayers => {
        // Only update if there are any players with hit flash active
        if (!prevPlayers.some(p => p.isHitFlashing)) return prevPlayers;
        
        return prevPlayers.map(player => {
          if (player.isHitFlashing && player.lastHitTime && (Date.now() - player.lastHitTime > 150)) {
            return { ...player, isHitFlashing: false };
          }
          return player;
        });
      });
    }, 100);
    
    return () => clearInterval(clearHitFlash);
  }, []);
  
  // --- Simplified playSound for Effects ---
  const playSound = useCallback((sound: string) => {
    // Stop command remains
    if (sound === 'stop_music') {
      if (backgroundMusicRef.current) {
        console.log('Stopping music via command');
        backgroundMusicRef.current.pause();
        backgroundMusicRef.current.currentTime = 0;
        backgroundMusicRef.current = null;
      }
      return;
    }

    // Check global audio enabled state & interaction
    if (!audioEnabled || !hasInteracted) return; 

    // Avoid duplicating arena BGM by blocking battle_start as an effect
    if (sound === 'battle_start') {
      return;
    }

    const soundPath = soundMap[sound];
    if (!soundPath) {
        console.warn(`Sound key not found in soundMap: ${sound}`);
        return;
    }

    // Allow all mapped keys to play as effects; background music is handled separately
    // but if a background key is passed here accidentally, it will play once as an effect.

    // Play sound effect using audioRefs pool or create new?
    // Using new Audio() is simpler and avoids potential issues with rapidly re-triggering the same effect ref
    try {
      const audio = new Audio(soundPath); 
      audio.volume = (SOUND_VOLUMES[sound as keyof typeof SOUND_VOLUMES] || 0.7) * volume;
      audio.play().catch(e => console.error(`Error playing sound effect ${sound}:`, e));
    } catch (error) {
        console.error(`Error creating audio element for ${sound}:`, error);
    }

  }, [audioEnabled, hasInteracted, volume]);

  // Join queue
  const joinQueue = useCallback(() => {
    setInQueue(true);
    setGameState('queue');
    playSound('button');
  }, [playSound, lobbyPlayers.length]);
  
  // Start battle
  const startBattle = useCallback(() => {
    console.log('Starting battle with players:', players);
    
    // Use deterministic self + exact lobby roster by ID
    const myId = (() => {
      try {
        const fromWallet = publicKey?.toBase58?.() || publicKey?.toString?.();
        if (fromWallet) return String(fromWallet);
      } catch {}
      try { if (typeof window !== 'undefined') { const g = localStorage.getItem('guest_id'); if (g) return g } } catch {}
      return 'guest_local';
    })();

    // Build battle roster in the exact server-provided order (from syncLobbyPlayers)
    const ringRadius = 10;
    const roster = lobbyPlayers.slice();
    const totalChickens = roster.length;
    const positions = generateOpponentPositions(totalChickens, ringRadius);
    const positionedPlayers: PlayerStatus[] = roster.map((entry, index) => {
      const id = String(entry.id);
      const isSelf = id === myId;
      const colors = entry.colors || getDeterministicColorsForId(id);
      const displayName = isSelf
        ? (profile?.username || 'You')
        : ((entry as any).name || (entry as any).username || (id.startsWith('guest_') ? id : id.slice(0, 8) + '...'));
      return {
        id,
        name: displayName,
        isPlayer: isSelf,
        isAi: Boolean((entry as any).isAi),
        position: positions[index].position,
        rotation: positions[index].rotation,
        colors,
        hp: 3,
        maxHp: 3,
        isAlive: true,
        visible: true,
        // Carry over any flag fields used by HUD/animations if present on roster entry
        ...(entry as any).isHitFlashing ? { isHitFlashing: (entry as any).isHitFlashing } : {},
      };
    });
    
    // Set initial chickens count
    setChickensLeft(positionedPlayers.length);
    
    // Update players with positioned players
    setPlayers(positionedPlayers);
    
    // Change game state to battle
    setBattleStartAt(Date.now());
    setGameState('battle');
    playSound('battle_start');
  }, [players, lobbyPlayers, playSound, profile?.username, publicKey]);

  // Replace lobbyPlayers from authoritative socket/HTTP list during the secondary check
  const syncLobbyPlayers: GameStateContextType['syncLobbyPlayers'] = useCallback((list) => {
    // Replace roster while preserving existing per-chicken colors; assign realistic colors for new entries
    setLobbyPlayers(prev => {
      const byId = new Map(prev.map(p => [p.id, p]));
      const source = Array.isArray(list) ? list : []
      const next: PlayerStatus[] = source.map((p) => {
        const id = String(p.playerId);
        const prevEntry = byId.get(id);
        const colors = prevEntry?.colors || getDeterministicColorsForId(id);
        const isGuest = id.startsWith('guest_')
        const displayName = p.isAi
          ? (p.username || 'AI')
          : (p.username || (isGuest ? id : id.slice(0, 8) + '...'))
        return {
          id,
          name: displayName,
          isPlayer: false,
          isAi: Boolean(p.isAi),
          position: new THREE.Vector3(0, chickenFeetOffsetY, 0),
          rotation: new THREE.Euler(0, 0, 0),
          colors,
          hp: 3,
          maxHp: 3,
          isAlive: true,
          visible: true,
        };
      });
      return next;
    });
  }, [publicKey]);
  
  // Leave queue
  const leaveQueue = useCallback(() => {
    setInQueue(false);
    setGameState('lobby');
    playSound('button');
  }, [playSound]);
  
  // Exit battle
  const exitBattle = useCallback(() => {
    setGameState('lobby');
    playSound('button');
  }, [playSound]);
  
  // --- Need toggleAudio implementation --- 
  const toggleAudio = useCallback(() => {
    setAudioEnabled(prev => {
      const newState = !prev;
      if (backgroundMusicRef.current) {
        if (newState) {
          // When re-enabling, apply the correct volume based on track
          const clampedVolume = Math.max(0, Math.min(1, volume));
          backgroundMusicRef.current.volume = currentMusicTrack === 'background'
            ? Math.min(1.0, clampedVolume * 2.0)
            : clampedVolume;
          backgroundMusicRef.current.play().catch(console.error);
        } else {
          backgroundMusicRef.current.pause();
        }
      }
      // Apply to secondary song layer as well
      if (songMusicRef.current) {
        if (newState) {
          try { songMusicRef.current.play().catch(() => {}); } catch {}
        } else {
          try { songMusicRef.current.pause(); } catch {}
        }
      }
      console.log('Toggling audio enabled to:', newState);
      return newState;
    });
  }, [volume, currentMusicTrack]);

  // --- Need setVolume implementation --- 
  const setVolumeCallback = useCallback((newVolume: number) => {
      const clampedVolume = Math.max(0, Math.min(1, newVolume));
      console.log('Setting volume to:', clampedVolume);
      setVolume(clampedVolume);
      // Update volume of existing background music immediately
      if (backgroundMusicRef.current && currentMusicTrack) {
        // Adjust volume based on track type without changing the source
        backgroundMusicRef.current.volume = currentMusicTrack === 'background'
          ? Math.min(1.0, clampedVolume * 2.0)
          : clampedVolume;
      }
      // Update volume of secondary song layer if present
      if (songMusicRef.current) {
        songMusicRef.current.volume = Math.min(1.0, clampedVolume * 1.0);
      }
    }, [currentMusicTrack]);
  
  // Position players around the ring
  useEffect(() => {
    // Use a smaller ring radius that matches the arena size in ARENA_CONFIG
    const ringRadius = 10; // Reduced to match smaller arena size
    const playerCount = lobbyPlayers.length;
    
    const positionedPlayers = lobbyPlayers.map((player, index) => {
      // Calculate position in circle
      const angle = (index / playerCount) * Math.PI * 2;
      const x = Math.cos(angle) * ringRadius;
      const z = Math.sin(angle) * ringRadius;
      
      // Set Y position to match player height
      const y = chickenFeetOffsetY;
      
      return {
        ...player,
        position: [x, y, z] as [number, number, number],
        rotation: [0, -angle, 0] as [number, number, number], // Face center
        hp: 3,
        maxHp: 3,
        isAlive: true,
        visible: true
      };
    });
    
    setLobbyPlayers(positionedPlayers);
  }, [lobbyPlayers.length]);
  
  // --- New useEffect for Background Music Management ---
  useEffect(() => {
    if (!hasInteracted) return;

    const clampedVolume = Math.max(0, Math.min(1, volume));

    if (gameState === 'lobby' || gameState === 'queue') {
      // Primary: chicken soundscape
      playBackgroundMusic('background');
      if (backgroundMusicRef.current) {
        // Slightly louder for chicken ambience per request
        backgroundMusicRef.current.volume = Math.min(1.0, clampedVolume * 2.0);
      }
      // Secondary: main background song layered in lobby/queue
      if (!songMusicRef.current) {
        songMusicRef.current = new Audio('/sounds/background.mp3');
        songMusicRef.current.loop = true;
      }
      songMusicRef.current.volume = Math.min(1.0, clampedVolume * 1.0);
      if (audioEnabled) {
        try { songMusicRef.current.play().catch(() => {}); } catch {}
      } else {
        try { songMusicRef.current.pause(); } catch {}
      }
    } else if (gameState === 'battle') {
      // Battle: arena music only; stop the secondary song
      playBackgroundMusic('arena');
      if (songMusicRef.current) {
        try { songMusicRef.current.pause(); } catch {}
        try { songMusicRef.current.currentTime = 0; } catch {}
      }
    } else {
      // Other states: stop both
      if (backgroundMusicRef.current) {
        backgroundMusicRef.current.pause();
        backgroundMusicRef.current.currentTime = 0;
      }
      if (songMusicRef.current) {
        try { songMusicRef.current.pause(); } catch {}
        try { songMusicRef.current.currentTime = 0; } catch {}
      }
    }

    // Cleanup keeps players paused when dependencies change
    return () => {
      // do not fully reset refs to preserve buffering; just ensure paused on exit
      if (gameState !== 'lobby' && gameState !== 'queue') {
        if (songMusicRef.current) {
          try { songMusicRef.current.pause(); } catch {}
        }
      }
    };
  }, [gameState, audioEnabled, hasInteracted, playBackgroundMusic, volume]);
  // --- End Background Music useEffect ---
  
  // The value provided to the context consumers
  const contextValue = {
    gameState,
    setGameState,
    volume,
    setVolume: setVolumeCallback,
    audioEnabled,
    toggleAudio,
    playerChicken: players.find(p => p.isPlayer),
    players,
    playSound,
    handlePlayerDamage,
    chickensLeft,
    inQueue,
    joinQueue,
    leaveQueue,
    startBattle,
    endBattle: exitBattle,
    exitBattle,
    returnToMainMenu: exitBattle,
    lobbyPlayers,
    positionLobbyPlayers: () => {}, // Provide empty function
    lastDefeatedChickenId,
    lastKillerId,
    hasInteracted,
    setHasInteracted: () => {}, // Provide empty function
    prizeAmount,
    syncLobbyPlayers,
    matchMeta,
    setMatchMeta,
    battleStartAt,
    battleEndAt,
  };
  
  // Cleanup Three.js resources when unmounted
  useEffect(() => {
    return disposeThreejsResources;
  }, [disposeThreejsResources]);

  return (
    <GameStateContext.Provider value={contextValue}>
      {children}
    </GameStateContext.Provider>
  );
}

// Custom hook to use the game state context
export function useGameState() {
  const context = useContext(GameStateContext);
  if (context === undefined) {
    throw new Error('useGameState must be used within a GameStateProvider');
  }
  return context;
}
