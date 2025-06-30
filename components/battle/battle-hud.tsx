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
    // Pointer-events-none allows clicks to pass through to the game scene
    <div className="absolute inset-0 z-20 pointer-events-none pixel-font text-white">

      {/* Top Bar Area */}
      <div className="absolute top-0 left-0 right-0 p-3 flex justify-between items-start">
        
        {/* Top Left: Chickens Left */}
        <div className="ml-4 bg-black/70 border-2 border-yellow-500/50 rounded-md px-3 py-1 shadow-lg">
          <span className="text-yellow-400 mr-2">ALIVE:</span>
          <span className="text-xl font-bold">{chickensLeft}</span> 
          {/* // TODO: Consider using a chicken icon here */}
        </div>

        {/* Top Center: Title */}
        <div className="absolute left-1/2 top-3 transform -translate-x-1/2 bg-black/70 border-2 border-yellow-500/50 rounded-md px-4 py-1 shadow-lg">
            <h1 className="text-lg text-yellow-400 font-bold">COCK COMBAT</h1>
        </div>

        {/* Top Right: Player List - Redesigned with better aesthetics */}
        <div className="mr-4 bg-black/70 border-2 border-yellow-500/50 rounded-md px-3 py-2 w-60 text-[9px] shadow-lg">
          <div className="flex justify-between items-center mb-1.5 border-b border-yellow-500/30 pb-1">
            <h2 className="text-yellow-400 font-bold text-xs uppercase tracking-wider">Leaderboard</h2>
            <div className="bg-yellow-500/20 px-1.5 rounded-sm">
              <span className="text-white text-[8px]">{displayPlayers.length} Players</span>
            </div>
          </div>
          
          {displayPlayers.slice(0, 15).map((p, index) => {
            const playerListHealthColor = getHealthColor(p.hp, p.maxHp);
            const healthPercent = (p.hp / p.maxHp) * 100;
            return (
              <div 
                key={p.id} 
                className={`flex justify-between items-center py-0 mb-0.5 ${p.isPlayer ? 'font-bold' : ''} ${p.isAlive ? '' : 'opacity-40'}`}
              >
                <div className="flex items-center">
                  <span className="text-gray-400 w-4 text-right mr-1.5">{index + 1}.</span>
                  <span className={`${p.isPlayer ? 'text-yellow-300' : 'text-white'} ${!p.isAlive ? 'line-through' : ''} truncate max-w-[90px]`}>
                    {p.name}
                  </span>
                </div>
                {/* Mini Health Bar */}
                {p.isAlive && (
                  <div className="w-8 h-1.5 bg-gray-800 border border-gray-700 rounded-sm overflow-hidden flex-shrink-0">
                    <div 
                      className={`h-full ${playerListHealthColor}`}
                      style={{ width: `${healthPercent}%` }}
                    ></div>
                  </div>
                )}
                {!p.isAlive && <span className="text-red-500 text-[8px] bg-red-900/20 px-1 rounded-sm">KO</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom Center: Player Health */}
      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex flex-col items-center">
        {/* Health Bar */}
        <div className="w-64 h-5 bg-black/70 border-2 border-yellow-500/50 rounded-md overflow-hidden p-0.5 shadow-lg">
          <div 
            className={`h-full ${playerHealthBarColor} rounded-sm transition-all duration-300 ease-in-out`}
            style={{ width: `${playerHealthPercentage}%` }}
          ></div>
          {/* Optional: Text overlay on bar? */}
          {/* <span className="absolute inset-0 flex items-center justify-center text-xs font-bold mix-blend-difference">{playerHP} / {maxHP}</span> */}
        </div>
        {/* HP Text Below Bar */}
        <span className="mt-1 text-sm font-semibold bg-black/70 px-2 py-0.5 rounded border border-yellow-500/50 shadow-lg">
           {playerHP} / {maxHp} HP
        </span>
        {/* // TODO: Consider adding status effect icons near health bar */}
      </div>

       {/* Bottom Right: Control Panel */}
      <div className="absolute bottom-6 right-6 mr-4">
        <ControlPanel />
      </div>

    </div>
  );
};

export default BattleHUD;
