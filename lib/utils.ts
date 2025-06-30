import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Truncates a wallet address or other long string for display
 * @param address The address to truncate
 * @param startChars Number of characters to show at the start
 * @param endChars Number of characters to show at the end
 * @returns Truncated address with ellipsis in the middle
 */
export function truncateAddress(address?: string | null, startChars = 4, endChars = 4): string {
  if (!address) return '';
  
  if (address.length <= startChars + endChars) {
    return address;
  }
  
  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}

/**
 * Generates a random hex color
 * @returns A random hex color string
 */
export function getRandomColor(): string {
  const colors = [
    "#f97316", // orange
    "#eab308", // yellow
    "#84cc16", // lime
    "#22c55e", // green
    "#06b6d4", // cyan
    "#3b82f6", // blue
    "#8b5cf6", // violet
    "#d946ef", // fuchsia
    "#ec4899", // pink
    "#f43f5e", // rose
  ];
  
  return colors[Math.floor(Math.random() * colors.length)];
}

/**
 * Generates a random chicken name
 * @returns A random chicken name
 */
export function getRandomChickenName(): string {
  const prefixes = [
    "Feather", "Beak", "Wing", "Claw", "Rooster", "Chicken", "Peck", "Combat", 
    "Talon", "Plumage", "Scratch", "Crest", "Barn", "Yard", "Coop"
  ];
  
  const suffixes = [
    "Fury", "Breaker", "Warrior", "Crusher", "Rage", "Champ", "Punisher", 
    "Cock", "Terror", "Pounder", "Savage", "Crusher", "Brawler", "Yeeter", "Commander"
  ];
  
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
  
  return `${prefix}${suffix}`;
}
