"use client";

import React from 'react';

interface ControlPanelProps {
  // Optional props later for dynamic controls?
}

const ControlPanel: React.FC<ControlPanelProps> = (props) => {
  return (
    <div className="bg-black/90 border-2 border-yellow-500/70 rounded-lg px-2 sm:px-3 py-2 sm:py-3 pixel-font text-white text-xs sm:text-sm shadow-xl backdrop-blur-sm pointer-events-auto">
      <div className="flex justify-between items-center mb-1 sm:mb-2 border-b border-yellow-500/30 pb-1 sm:pb-2">
        <p className="text-yellow-400 font-bold uppercase tracking-wider text-xs">CONTROLS</p>
      </div>
      <div className="space-y-1 sm:space-y-2">
        <p><span className="font-semibold text-orange-400 w-12 sm:w-16 inline-block text-xs">WASD:</span> <span className="text-xs">Move</span></p>
        <p><span className="font-semibold text-orange-400 w-12 sm:w-16 inline-block text-xs">Space:</span> <span className="text-xs">Attack</span></p>
        <p><span className="font-semibold text-orange-400 w-12 sm:w-16 inline-block text-xs">Shift:</span> <span className="text-xs">Jump</span></p>
      </div>
    </div>
  );
};

export default ControlPanel;
