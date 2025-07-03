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
      <div className="absolute top-0 left-0 right-0 p-2 sm:p-4 md:p-6 flex justify-between items-start flex-wrap gap-2 sm:gap-4">
        
        {/* Top Left: Chickens Left */}
        <div className="bg-black/90 border-2 border-yellow-500/70 rounded-lg px-2 sm:px-3 py-1 sm:py-2 shadow-xl backdrop-blur-sm">
          <div className="flex items-center gap-1 sm:gap-2">
            <span className="text-yellow-400 text-xs sm:text-sm font-bold">ALIVE:</span>
            <span className="text-lg sm:text-xl lg:text-2xl font-bold text-white">{chickensLeft}</span> 
          </div>
        </div>

        {/* Top Center: Title */}
        <div className="bg-black/90 border-2 border-yellow-500/70 rounded-lg px-2 sm:px-4 py-1 sm:py-2 shadow-xl backdrop-blur-sm">
          <h1 className="text-sm sm:text-lg lg:text-xl text-yellow-400 font-bold tracking-wide">COCK COMBAT</h1>
        </div>

        {/* Top Right: Player List - Better spacing and sizing with responsive width */}
        <div className="bg-black/90 border-2 border-yellow-500/70 rounded-lg px-2 sm:px-3 py-1 sm:py-2 w-48 sm:w-60 lg:w-72 shadow-xl backdrop-blur-sm">
          <div className="flex justify-between items-center mb-1 sm:mb-2 border-b border-yellow-500/30 pb-1 sm:pb-2">
            <h2 className="text-yellow-400 font-bold text-xs sm:text-sm uppercase tracking-wider">Leaderboard</h2>
            <div className="bg-yellow-500/20 px-1 sm:px-2 py-0.5 sm:py-1 rounded-sm">
              <span className="text-white text-xs">{displayPlayers.length}</span>
            </div>
          </div>
          
          <div className="max-h-32 sm:max-h-48 lg:max-h-80 overflow-y-auto">
            {displayPlayers.slice(0, 12).map((p, index) => {
              const playerListHealthColor = getHealthColor(p.hp, p.maxHp);
              const healthPercent = (p.hp / p.maxHp) * 100;
              return (
                <div 
                  key={p.id} 
                  className={`flex justify-between items-center py-0.5 sm:py-1 mb-0.5 sm:mb-1 ${p.isPlayer ? 'font-bold' : ''} ${p.isAlive ? '' : 'opacity-50'}`}
                >
                  <div className="flex items-center flex-1 min-w-0">
                    <span className="text-gray-400 w-3 sm:w-4 lg:w-5 text-right mr-1 sm:mr-2 text-xs">{index + 1}.</span>
                    <span className={`${p.isPlayer ? 'text-yellow-300' : 'text-white'} ${!p.isAlive ? 'line-through' : ''} truncate text-xs sm:text-sm`}>
                      {p.name}
                    </span>
                  </div>
                  {/* Mini Health Bar */}
                  {p.isAlive && (
                    <div className="w-6 sm:w-8 lg:w-10 h-1.5 sm:h-2 bg-gray-800 border border-gray-600 rounded-sm overflow-hidden flex-shrink-0 ml-1 sm:ml-2">
                      <div 
                        className={`h-full ${playerListHealthColor} transition-all duration-300`}
                        style={{ width: `${healthPercent}%` }}
                      ></div>
                    </div>
                  )}
                  {!p.isAlive && <span className="text-red-500 text-xs bg-red-900/30 px-1 py-0.5 rounded-sm ml-1 sm:ml-2">KO</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom Center: Player Health - Better positioning with safe margins */}
      <div className="absolute bottom-4 sm:bottom-6 left-1/2 transform -translate-x-1/2 flex flex-col items-center">
        {/* Health Bar */}
        <div className="w-48 sm:w-64 lg:w-80 h-4 sm:h-5 lg:h-6 bg-black/90 border-2 border-yellow-500/70 rounded-lg overflow-hidden p-1 shadow-xl backdrop-blur-sm">
          <div 
            className={`h-full ${playerHealthBarColor} rounded-sm transition-all duration-300 ease-in-out`}
            style={{ width: `${playerHealthPercentage}%` }}
          ></div>
        </div>
        {/* HP Text Below Bar */}
        <div className="mt-1 sm:mt-2 text-xs sm:text-sm lg:text-base font-bold bg-black/90 border border-yellow-500/70 px-2 sm:px-3 py-1 rounded-lg shadow-xl backdrop-blur-sm">
          <span className="text-white">{playerHP}</span>
          <span className="text-gray-400 mx-1">/</span>
          <span className="text-white">{maxHp}</span>
          <span className="text-yellow-400 ml-1 sm:ml-2">HP</span>
        </div>
      </div>

      {/* Bottom Right: Control Panel - Better positioning with safe margins */}
      <div className="absolute bottom-2 sm:bottom-4 lg:bottom-6 right-2 sm:right-4 lg:right-6">
        <ControlPanel />
      </div>

    </div>
  );
};

export default BattleHUD;
