"use client";

import React, { useMemo } from 'react';

interface ControlPanelProps {
  // Optional props later for dynamic controls?
}

const ControlPanel: React.FC<ControlPanelProps> = () => {
  const isMobile = useMemo(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia && window.matchMedia('(max-width: 768px)').matches
  }, [])

  return (
    <>
      {/* Desktop helper panel */}
      <div className="hidden md:block bg-black/90 border-2 border-yellow-500/70 rounded-lg px-2 sm:px-3 py-2 sm:py-3 pixel-font text-white text-xs sm:text-sm shadow-xl backdrop-blur-sm pointer-events-auto">
        <div className="flex justify-between items-center mb-1 sm:mb-2 border-b border-yellow-500/30 pb-1 sm:pb-2">
          <p className="text-yellow-400 font-bold uppercase tracking-wider text-xs">CONTROLS</p>
        </div>
        <div className="space-y-1 sm:space-y-2">
          <p><span className="font-semibold text-orange-400 w-12 sm:w-16 inline-block text-xs">WASD:</span> <span className="text-xs">Move/Turn</span></p>
          <p><span className="font-semibold text-orange-400 w-12 sm:w-16 inline-block text-xs">Arrows:</span> <span className="text-xs">Move/Turn</span></p>
          <p><span className="font-semibold text-orange-400 w-12 sm:w-16 inline-block text-xs">Space:</span> <span className="text-xs">Jump</span></p>
          <p><span className="font-semibold text-orange-400 w-12 sm:w-16 inline-block text-xs">Shift:</span> <span className="text-xs">Peck/Attack</span></p>
        </div>
      </div>

      {/* Mobile touch overlays: analog stick + two buttons */}
      <div className="md:hidden pointer-events-none select-none">
        {/* Left: analog stick */}
        <div
          className="fixed w-28 h-28 rounded-full bg-white/10 border border-white/20 backdrop-blur-sm"
          style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)', left: 'calc(env(safe-area-inset-left, 0px) + 16px)' }}
        />
        <div
          className="fixed w-18 h-18 rounded-full bg-white/20 border border-white/30"
          style={{ width: '72px', height: '72px', bottom: 'calc(env(safe-area-inset-bottom, 0px) + 36px)', left: 'calc(env(safe-area-inset-left, 0px) + 36px)' }}
        />
        {/* Right: two buttons */}
        <div className="fixed flex flex-col items-end gap-3" style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)', right: 'calc(env(safe-area-inset-right, 0px) + 28px)' }}>
          <div className="w-12 h-12 rounded-full bg-white/15 border border-white/30 backdrop-blur-sm" />
          <div className="w-14 h-14 rounded-full bg-white/15 border border-white/30 backdrop-blur-sm" />
        </div>
      </div>
    </>
  )
};

export default ControlPanel;
