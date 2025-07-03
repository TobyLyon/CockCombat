"use client";

import React from 'react';

interface ControlPanelProps {
  // Optional props later for dynamic controls?
}

const ControlPanel: React.FC<ControlPanelProps> = (props) => {
  return (
    <div className="bg-black/80 border-2 border-yellow-500/70 rounded-lg px-4 py-3 pixel-font text-white text-sm shadow-xl backdrop-blur-sm pointer-events-auto">
      <div className="flex justify-between items-center mb-2 border-b border-yellow-500/30 pb-2">
        <p className="text-yellow-400 font-bold uppercase tracking-wider">CONTROLS</p>
      </div>
      <div className="space-y-2">
        <p><span className="font-semibold text-orange-400 w-16 inline-block">WASD:</span> Move</p>
        <p><span className="font-semibold text-orange-400 w-16 inline-block">Space:</span> Attack</p>
        <p><span className="font-semibold text-orange-400 w-16 inline-block">Shift:</span> Jump</p>
      </div>
    </div>
  );
};

export default ControlPanel;
