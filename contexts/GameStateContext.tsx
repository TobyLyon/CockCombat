"use client"

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import * as THREE from 'three';
import { mockPlayers, soundMap } from '@/mocks/game-data';
import { useAudio } from './AudioContext'; // Import useAudio

// Define player status interface
export interface PlayerStatus {
  id: string;
  name?: string; // Add name to the player status interface
  isPlayer: boolean;
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
  handlePlayerDamage: (targetPlayerId: string, damageAmount?: number) => void;
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
  hasInteracted: boolean;
  setHasInteracted: (value: boolean) => void;
  prizeAmount: number; // Track the prize amount for the winner
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

// Function to generate random chicken colors
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
  // Game state
  const [gameState, setGameState] = useState<GameState>('lobby');
  const [selectedChicken, setSelectedChicken] = useState<any>(null);
  const [inQueue, setInQueue] = useState(false);
  const [lobbyPlayers, setLobbyPlayers] = useState<PlayerStatus[]>([]);
  const [chickensLeft, setChickensLeft] = useState(7); // Start with 7 chickens (including player)
  const [lastDefeatedChickenId, setLastDefeatedChickenId] = useState<string | null>(null);
  const [prizeAmount, setPrizeAmount] = useState(0); // Track prize amount for winner
  
  // Player data - use mock data from mocks/game-data.ts
  const [players, setPlayers] = useState<PlayerStatus[]>(initialPlayers);
  
  // Audio state - Get interaction state from useAudio
  const { hasInteracted } = useAudio(); 
  const backgroundMusicRef = useRef<HTMLAudioElement | null>(null);
  const audioRefs = useRef<{ [key: string]: HTMLAudioElement }>({}); // Keep for sound effects
  const [volume, setVolume] = useState(0.1); // Changed from 0.5 to 0.1 (10%)
  const [audioEnabled, setAudioEnabled] = useState(true); // Keep local enabled control for now

  // Track current music track and its source
  const [currentMusicTrack, setCurrentMusicTrack] = useState<'background' | 'arena' | null>(null);

  // Sound volume normalizations
  const SOUND_VOLUMES: { [key: string]: number } = {
    punch: 1.5,
    hit: 1.5,
    strong_punch: 1.2,
    die: 0.8,
    pickup: 0.7,
    jump: 0.5,
    click: 0.6,
    arena: 0.4,
    background: 0.3,
    win: 1.0,
    lose: 1.0,
  };

  // Sound mappings
  const soundMap: { [key: string]: string } = {
    punch: '/sounds/punch.mp3',
    strong_punch: '/sounds/strong_punch.mp3',
    death: '/sounds/die.mp3',
    pickup: '/sounds/pickup.mp3',
    jump: '/sounds/jump.mp3',
    click: '/sounds/click.mp3',
    button: '/sounds/click.mp3',
    arena: '/sounds/arena.mp3',
    background: '/sounds/background.mp3',
    win: '/sounds/JESUS_CHRIST_2.mp3',
    lose: '/sounds/die.mp3',
  };

  // Use a ref to hold the audio object
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Create a memoized playSound function
  const playSound = useCallback((soundKey: string, loop = false) => {
    if (!audioEnabled || !hasInteracted) return;
    
    // Stop the current sound if it's playing
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    
    // Get the sound path from the map
    const soundPath = soundMap[soundKey];
    if (!soundPath) return;

    // Create a new audio object
    const audio = new Audio(soundPath);
    audio.loop = loop;
    
    // Get the volume for the sound or default to 1
    const soundVolume = SOUND_VOLUMES[soundKey as keyof typeof SOUND_VOLUMES] || 1.0;
    audio.volume = volume * soundVolume;
    
    // Play the sound
    audio.play().catch(error => console.error(`Error playing sound: ${soundKey}`, error));

    // Store the audio object in the ref
    audioRef.current = audio;
    
  }, [volume, audioEnabled, hasInteracted]);
  
  // Effect to handle background music changes based on game state
  useEffect(() => {
    const playMusic = (track: 'background' | 'arena') => {
      playSound(track, true);
      setCurrentMusicTrack(track);
    };

    if (gameState === 'lobby' && currentMusicTrack !== 'background') {
      playMusic('background');
    } else if (gameState === 'battle' && currentMusicTrack !== 'arena') {
      playMusic('arena');
    } else if (gameState === 'gameOver' || gameState === 'winner') {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setCurrentMusicTrack(null);
    }
  }, [gameState, playSound, currentMusicTrack]);

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
  const handlePlayerDamage = (targetPlayerId: string, damageAmount = 1) => {
    let targetPlayer: PlayerStatus | undefined;
    let newHp = 0;
        
    // Use the functional form of setPlayers to ensure we have the latest state
    setPlayers(currentPlayers => {
      targetPlayer = currentPlayers.find(p => p.id === targetPlayerId);
      
      if (!targetPlayer || !targetPlayer.isAlive) {
        return currentPlayers; // Return current state if target is not valid
      }
      
      newHp = targetPlayer.hp - damageAmount;
      playSound('punch');
      
      if (newHp <= 0) {
        // Player is defeated
        playSound('death');
        setLastDefeatedChickenId(targetPlayerId);
        
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
          } else {
            console.log("All players defeated.");
            setPrizeAmount(0);
          }
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
  
  // Join queue
  const joinQueue = useCallback(() => {
    setInQueue(true);
    setGameState('queue');
    playSound('button');
    
    // Generate lobby players if none exist yet
    if (lobbyPlayers.length === 0) {
      const ringRadius = 15; // Match the arena radius
      const positions = generateOpponentPositions(7, ringRadius); // Changed to 7 opponents
      
      // Generate random opponents for the lobby with more descriptive names
      const chickenNames = [
        "Colonel Cluck", "Feather Fury", "Beak Breaker", 
        "Wing Commander", "Rooster Rumble", "Hen Havoc",
        "Talon Terror"
      ];
      
      const opponents = Array.from({ length: 7 }).map((_, index) => { // Changed to 7 opponents
        // Generate a random color scheme
        const colors = generateChickenColors();
        
        return {
          id: `opponent-${index + 1}`,
          name: chickenNames[index], // Add name to the opponent
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
      
      setLobbyPlayers(opponents);
    }
  }, [playSound, lobbyPlayers.length]);
  
  // Start battle
  const startBattle = useCallback(() => {
    console.log('Starting battle with players:', players);
    
    // Use the exact chickens from the lobby for the battle
    const battlePlayers = [
      // Include the player
      ...players.filter(p => p.isPlayer),
      // Include all the lobby chickens with their exact names and appearance
      ...lobbyPlayers
    ];
    
    // Position ALL chickens (including player) around the ring
    const ringRadius = 10; // Reduced from 20 to 10 for smaller arena
    const totalChickens = battlePlayers.length;
    const positions = generateOpponentPositions(totalChickens, ringRadius);
    
    // Update positions for all chickens
    const positionedPlayers = battlePlayers.map((player, index) => ({
      ...player,
      position: positions[index].position,
      rotation: positions[index].rotation
    }));
    
    // Set initial chickens count
    setChickensLeft(positionedPlayers.length);
    
    // Update players with positioned players
    setPlayers(positionedPlayers);
    
    // Change game state to battle
    setGameState('battle');
    playSound('battle_start');
  }, [players, lobbyPlayers, playSound]);
  
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
            ? Math.min(1.0, clampedVolume * 1.5)
            : clampedVolume;
          backgroundMusicRef.current.play().catch(console.error);
        } else {
          backgroundMusicRef.current.pause();
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
          ? Math.min(1.0, clampedVolume * 1.5)
          : clampedVolume;
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
    hasInteracted,
    setHasInteracted: () => {}, // Provide empty function
    prizeAmount,
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
