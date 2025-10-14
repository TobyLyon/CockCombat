"use client"

import React from 'react';
import ControlPanel from './control-panel'; // Import ControlPanel
import { useGameState, PlayerStatus } from '@/contexts/GameStateContext'; // Import PlayerStatus from context

// BattleHUD props interface - simplified since we'll get most data from context
interface BattleHUDProps {
  playerHP?: number; // Optional now, will use context if not provided
  maxHP?: number;
  chickensLeft?: number; // Optional now, will use context if not provided
  players?: PlayerStatus[]; // Optional now, will use context if not provided
}

// Helper to get color based on health percentage
const getHealthColor = (hp: number, maxHp: number): string => {
  const percentage = (hp / maxHp) * 100;
  if (percentage <= 33) return 'bg-red-500';
  if (percentage <= 66) return 'bg-yellow-500';
  return 'bg-green-500';
};

const BattleHUD: React.FC<BattleHUDProps> = ({ 
  playerHP: propPlayerHP, 
  maxHP = 3, 
  chickensLeft: propChickensLeft,
  players: propPlayers
}) => {
  // Get data from context if not provided via props
  const { 
    players: contextPlayers, 
    chickensLeft: contextChickensLeft 
  } = useGameState();
  
  // Use props if provided, otherwise use context
  const players = propPlayers || contextPlayers;
  const chickensLeft = propChickensLeft !== undefined ? propChickensLeft : contextChickensLeft;
  
  // Find the player in the players array
  const playerCharacter = players.find(p => p.isPlayer);
  const playerHP = propPlayerHP !== undefined ? propPlayerHP : (playerCharacter?.hp || 3);
  const maxHp = playerCharacter?.maxHp || maxHP;
  
  const playerHealthPercentage = (playerHP / maxHp) * 100;
  const playerHealthBarColor = getHealthColor(playerHP, maxHp);

  // Use players from props or context
  const displayPlayers = players;

  return (
    // Fixed positioning with proper z-index and spacing - no overflow, better responsive margins
    <div className="absolute inset-0 z-20 pointer-events-none pixel-font text-white overflow-hidden">

      {/* Top Bar Area - Better spacing with safe margins and responsive design */}
      <div className="absolute top-0 left-0 right-0 p-1 sm:p-2 md:p-4 flex justify-between items-start flex-wrap gap-1 sm:gap-2">
        
        {/* Top Left: Chickens Left */}
        <div className="bg-black/80 border border-yellow-500/60 rounded px-1.5 sm:px-2 py-0.5 sm:py-1 shadow backdrop-blur-sm">
          <div className="flex items-center gap-1">
            <span className="text-yellow-400 text-[10px] sm:text-xs font-bold">ALIVE:</span>
            <span className="text-sm sm:text-base lg:text-lg font-bold text-white">{chickensLeft}</span> 
          </div>
        </div>

        {/* Top Center: Title */}
        <div className="bg-black/80 border border-yellow-500/60 rounded px-2 sm:px-3 py-0.5 sm:py-1 shadow backdrop-blur-sm">
          <h1 className="text-xs sm:text-sm lg:text-base text-yellow-400 font-bold tracking-wide">COCK COMBAT</h1>
        </div>

        {/* Top Right: Player List - Better spacing and sizing with responsive width */}
        <div className="bg-black/80 border border-yellow-500/60 rounded px-2 sm:px-2 py-1 w-40 sm:w-52 lg:w-64 shadow backdrop-blur-sm">
          <div className="flex justify-between items-center mb-1 border-b border-yellow-500/20 pb-1">
            <h2 className="text-yellow-400 font-bold text-[10px] sm:text-xs uppercase tracking-wide">Leaderboard</h2>
            <div className="bg-yellow-500/20 px-1 rounded-sm">
              <span className="text-white text-[10px]">{displayPlayers.length}</span>
            </div>
          </div>
          
          <div className="max-h-24 sm:max-h-40 lg:max-h-72 overflow-y-auto">
            {displayPlayers.slice(0, 12).map((p, index) => {
              const playerListHealthColor = getHealthColor(p.hp, p.maxHp);
              const healthPercent = (p.hp / p.maxHp) * 100;
              return (
                <div 
                  key={p.id} 
                  className={`flex justify-between items-center py-0.5 sm:py-1 mb-0.5 sm:mb-1 ${p.isPlayer ? 'font-bold' : ''} ${p.isAlive ? '' : 'opacity-50'}`}
                >
                  <div className="flex items-center flex-1 min-w-0">
                    <span className="text-gray-400 w-3 sm:w-4 lg:w-5 text-right mr-1 text-[10px]">{index + 1}.</span>
                    <span className={`${p.isPlayer ? 'text-yellow-300' : 'text-white'} ${!p.isAlive ? 'line-through' : ''} truncate text-[10px] sm:text-xs`}>
                      {p.name || (p.id?.startsWith('guest_') ? p.id : (p.id ? p.id.slice(0,8)+'...' : 'Player'))}
                    </span>
                  </div>
                  {/* Mini Health Bar */}
                  {p.isAlive && (
                    <div className="w-5 sm:w-7 lg:w-9 h-1.5 sm:h-2 bg-gray-800 border border-gray-600 rounded-sm overflow-hidden flex-shrink-0 ml-1">
                      <div 
                        className={`h-full ${playerListHealthColor} transition-all duration-300`}
                        style={{ width: `${healthPercent}%` }}
                      ></div>
                    </div>
                  )}
                  {!p.isAlive && <span className="text-red-500 text-[10px] bg-red-900/30 px-1 py-0.5 rounded-sm ml-1">KO</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom Center: Player Health - Better positioning with safe margins */}
      <div className="absolute bottom-2 sm:bottom-4 left-1/2 transform -translate-x-1/2 flex flex-col items-center">
        {/* Health Bar */}
        <div className="w-40 sm:w-56 lg:w-72 h-3 sm:h-4 lg:h-5 bg-black/80 border border-yellow-500/60 rounded-lg overflow-hidden p-0.5 shadow backdrop-blur-sm">
          <div 
            className={`h-full ${playerHealthBarColor} rounded-sm transition-all duration-300 ease-in-out`}
            style={{ width: `${playerHealthPercentage}%` }}
          ></div>
        </div>
        {/* HP Text Below Bar */}
        <div className="mt-1 sm:mt-1.5 text-[10px] sm:text-xs lg:text-sm font-bold bg-black/80 border border-yellow-500/60 px-2 sm:px-2.5 py-0.5 rounded-lg shadow backdrop-blur-sm">
          <span className="text-white">{playerHP}</span>
          <span className="text-gray-400 mx-1">/</span>
          <span className="text-white">{maxHp}</span>
          <span className="text-yellow-400 ml-1 sm:ml-2">HP</span>
        </div>
      </div>

      {/* Bottom Right: Control Panel - Better positioning with safe margins */}
      <div className="absolute bottom-1.5 sm:bottom-3 lg:bottom-5 right-1.5 sm:right-3 lg:right-5 scale-90 sm:scale-95 lg:scale-100">
        <ControlPanel />
      </div>

    </div>
  );
};

export default BattleHUD;
