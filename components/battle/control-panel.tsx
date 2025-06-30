"use client";

import React from 'react';

interface ControlPanelProps {
  // Optional props later for dynamic controls?
}

const ControlPanel: React.FC<ControlPanelProps> = (props) => {
  return (
    <div className="bg-black/70 border-2 border-yellow-500/50 rounded-md px-3 py-2 ml-4 pixel-font text-white text-xs shadow-lg">
      <div className="flex justify-between items-center mb-1.5 border-b border-yellow-500/30 pb-1">
        <p className="text-yellow-400 font-bold uppercase tracking-wider">CONTROLS</p>
      </div>
      <div className="space-y-1.5">
        <p><span className="font-semibold text-orange-400 w-16 inline-block">WASD:</span> Move</p>
        <p><span className="font-semibold text-orange-400 w-16 inline-block">Space:</span> Attack</p>
        {/* Add other controls here later if needed */}
        {/* <p><span className="font-semibold text-orange-400">Shift:</span> Dodge</p> */}
      </div>
    </div>
  );
};

export default ControlPanel;
