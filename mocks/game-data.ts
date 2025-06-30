import * as THREE from 'three';
import { PlayerStatus } from '@/contexts/GameStateContext';

// Define the chickenFeetOffsetY constant
export const chickenFeetOffsetY = 0.7;

// Create positions in a perfect circle formation
const generateCircularFormation = (playerCount: number, radius: number) => {
  const positions: {position: THREE.Vector3, rotation: THREE.Euler}[] = [];
  
  for (let i = 0; i < playerCount; i++) {
    // Calculate the angle for this player (in radians)
    const angle = (i / playerCount) * Math.PI * 2;
    
    // Calculate position on the circle
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    
    // Calculate rotation to face center (inward)
    const rotation = new THREE.Euler(0, -angle + Math.PI, 0);
    
    positions.push({
      position: new THREE.Vector3(x, chickenFeetOffsetY, z),
      rotation: rotation
    });
  }
  
  return positions;
};

// Generate positions in a circle - Scaled radius
const playerPositions = generateCircularFormation(7, 10 * 1.5); // 10 * 1.5 = 15

// Mock player data
export const mockPlayers: PlayerStatus[] = [
  { 
    id: 'p1', 
    name: 'Cluck Norris', 
    hp: 3, 
    maxHp: 3, 
    isAlive: true, 
    isPlayer: true,
    visible: true,
    position: playerPositions[0].position, 
    rotation: playerPositions[0].rotation,
    colors: { 
      body: '#ffffff', 
      beak: '#ffcc00', 
      comb: '#ff0000', 
      legs: '#ffcc00', 
      tail: '#000000', 
      eyes: '#000000', 
      pupils: '#ffffff' 
    } 
  },
  { 
    id: 'p2', 
    name: 'Feather Flocklear', 
    hp: 2, 
    maxHp: 3, 
    isAlive: true, 
    isPlayer: false,
    visible: true,
    position: playerPositions[1].position, 
    rotation: playerPositions[1].rotation, 
    colors: { 
      body: '#cccccc', 
      beak: '#ff9900', 
      comb: '#cc0000', 
      legs: '#ff9900', 
      tail: '#333333', 
      eyes: '#000000', 
      pupils: '#ffffff' 
    }
  },
  { 
    id: 'p3', 
    name: 'Sir Peckington', 
    hp: 0, 
    maxHp: 3, 
    isAlive: false, 
    isPlayer: false,
    visible: false,
    position: playerPositions[2].position, 
    rotation: playerPositions[2].rotation,
    colors: { 
      body: '#999999', 
      beak: '#ff6600', 
      comb: '#990000', 
      legs: '#ff6600', 
      tail: '#666666', 
      eyes: '#000000', 
      pupils: '#ffffff' 
    }
  },
  { 
    id: 'p4', 
    name: 'General Tso', 
    hp: 1, 
    maxHp: 3, 
    isAlive: true, 
    isPlayer: false,
    visible: true,
    position: playerPositions[3].position, 
    rotation: playerPositions[3].rotation, 
    colors: { 
      body: '#ffddaa', 
      beak: '#cc6600', 
      comb: '#ff3300', 
      legs: '#cc6600', 
      tail: '#993300', 
      eyes: '#000000', 
      pupils: '#ffffff' 
    }
  },
  { 
    id: 'p5', 
    name: 'Eggbert', 
    hp: 3, 
    maxHp: 3, 
    isAlive: true, 
    isPlayer: false,
    visible: true,
    position: playerPositions[4].position, 
    rotation: playerPositions[4].rotation, 
    colors: { 
      body: '#ffffcc', 
      beak: '#ffee99', 
      comb: '#ffcc66', 
      legs: '#ffee99', 
      tail: '#cc9933', 
      eyes: '#000000', 
      pupils: '#ffffff' 
    }
  },
  { 
    id: 'p6', 
    name: 'Bawk Rogers', 
    hp: 3, 
    maxHp: 3, 
    isAlive: true, 
    isPlayer: false,
    visible: true,
    position: playerPositions[5].position, 
    rotation: playerPositions[5].rotation, 
    colors: { 
      body: '#e0e0e0', 
      beak: '#c0c0c0', 
      comb: '#a0a0a0', 
      legs: '#c0c0c0', 
      tail: '#808080', 
      eyes: '#000000', 
      pupils: '#ffffff' 
    }
  },
  { 
    id: 'p7', 
    name: 'Hen Solo', 
    hp: 2, 
    maxHp: 3, 
    isAlive: true, 
    isPlayer: false,
    visible: true,
    position: playerPositions[6].position, 
    rotation: playerPositions[6].rotation, 
    colors: { 
      body: '#f5f5f5', 
      beak: '#dcdcdc', 
      comb: '#b0b0b0', 
      legs: '#dcdcdc', 
      tail: '#909090', 
      eyes: '#000000', 
      pupils: '#ffffff' 
    }
  },
];

// Sound mapping - updated to use available sound files
export const soundMap: { [key: string]: string } = {
  button: '/sounds/click.mp3',    // Use click.mp3 for button sounds
  hit: '/sounds/punch.mp3',       // Use the new punch.mp3 for hit sounds
  critical_hit: '/sounds/strong_punch.mp3', // Use strong_punch.mp3 for critical hits
  death: '/sounds/die.mp3',       // Use die.mp3 for death sounds
  battle_start: '/sounds/arena.mp3', // Use arena.mp3 for battle start
  pickup: '/sounds/pickup.mp3',   // Use pickup.mp3 for pickup sounds
  peck: '/sounds/click.mp3',      // Temporarily use click.mp3 for peck sounds
  jump: '/sounds/jump.mp3',       // Use jump.mp3 for jump sounds
  click: '/sounds/click.mp3',     // This one exists
  background_music: '/sounds/background.mp3', // Add background music for main menu/landing page
};

// Arena configuration - Scaled values
export const ARENA_CONFIG = {
  ringRadius: 15 * 1.5, // Scaled from 15 to 22.5
  wallHeight: 8 * 1.5, // Scaled from 8 to 12
  wallThickness: 2 * 1.5, // Scaled from 2 to 3
  archCount: 0,
  archHeight: 6 * 1.5, // Scaled from 6 to 9
  archWidth: 5 * 1.5, // Scaled from 5 to 7.5
  seatTiers: 3,
  seatHeight: 1.5 * 1.5, // Scaled from 1.5 to 2.25
  seatDepth: 2 * 1.5, // Scaled from 2 to 3
  spectatorCount: 60, // Keep spectator count the same for now
  torchHeight: 7 * 1.5, // Scaled from 7 to 10.5
  torchCount: 2,
  crackCount: 15,
  bloodSplatCount: 8
};
