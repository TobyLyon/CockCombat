"use client";

import React, { useCallback } from 'react';
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Swords, ArrowUpFromLine } from 'lucide-react';

interface ControlPanelProps {
  // Optional props later for dynamic controls?
}

const ControlPanel: React.FC<ControlPanelProps> = () => {
  const dispatchKey = useCallback((type: 'keydown' | 'keyup', code: string, key: string) => {
    try {
      const ev = new KeyboardEvent(type, {
        key,
        code,
        bubbles: true,
        cancelable: true,
      })
      window.dispatchEvent(ev)
      document.dispatchEvent(ev)
    } catch {}
  }, [])

  const bindHold = useCallback((code: string, key: string) => {
    return {
      onPointerDown: (e: any) => {
        try { e.preventDefault?.() } catch {}
        dispatchKey('keydown', code, key)
      },
      onPointerUp: (e: any) => {
        try { e.preventDefault?.() } catch {}
        dispatchKey('keyup', code, key)
      },
      onPointerCancel: (e: any) => {
        try { e.preventDefault?.() } catch {}
        dispatchKey('keyup', code, key)
      },
      onPointerLeave: (e: any) => {
        try { e.preventDefault?.() } catch {}
        dispatchKey('keyup', code, key)
      },
    }
  }, [dispatchKey])

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
      <div className="md:hidden select-none pointer-events-none" style={{ touchAction: 'none' }}>
        {/* Left: movement (D-pad) */}
        <div
          className="fixed grid grid-cols-3 grid-rows-3 gap-2 pointer-events-auto"
          style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 14px)', left: 'calc(env(safe-area-inset-left, 0px) + 14px)' }}
        >
          <div />
          <button
            type="button"
            aria-label="Move up"
            className="w-12 h-12 rounded-xl bg-black/55 border border-white/15 backdrop-blur-md text-white flex flex-col items-center justify-center"
            style={{ touchAction: 'none' }}
            {...bindHold('ArrowUp', 'ArrowUp')}
          >
            <ArrowUp className="h-5 w-5" />
            <span className="text-[10px] leading-none mt-0.5">Up</span>
          </button>
          <div />

          <button
            type="button"
            aria-label="Move left"
            className="w-12 h-12 rounded-xl bg-black/55 border border-white/15 backdrop-blur-md text-white flex flex-col items-center justify-center"
            style={{ touchAction: 'none' }}
            {...bindHold('ArrowLeft', 'ArrowLeft')}
          >
            <ArrowLeft className="h-5 w-5" />
            <span className="text-[10px] leading-none mt-0.5">Left</span>
          </button>
          <div />
          <button
            type="button"
            aria-label="Move right"
            className="w-12 h-12 rounded-xl bg-black/55 border border-white/15 backdrop-blur-md text-white flex flex-col items-center justify-center"
            style={{ touchAction: 'none' }}
            {...bindHold('ArrowRight', 'ArrowRight')}
          >
            <ArrowRight className="h-5 w-5" />
            <span className="text-[10px] leading-none mt-0.5">Right</span>
          </button>

          <div />
          <button
            type="button"
            aria-label="Move down"
            className="w-12 h-12 rounded-xl bg-black/55 border border-white/15 backdrop-blur-md text-white flex flex-col items-center justify-center"
            style={{ touchAction: 'none' }}
            {...bindHold('ArrowDown', 'ArrowDown')}
          >
            <ArrowDown className="h-5 w-5" />
            <span className="text-[10px] leading-none mt-0.5">Down</span>
          </button>
          <div />
        </div>

        {/* Right: action buttons */}
        <div
          className="fixed flex flex-col items-end gap-3 pointer-events-auto"
          style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 14px)', right: 'calc(env(safe-area-inset-right, 0px) + 18px)' }}
        >
          <button
            type="button"
            aria-label="Jump"
            className="w-14 h-14 rounded-full bg-black/55 border border-white/15 backdrop-blur-md text-white flex flex-col items-center justify-center"
            style={{ touchAction: 'none' }}
            {...bindHold('Space', ' ')}
          >
            <ArrowUpFromLine className="h-6 w-6" />
            <span className="text-[10px] leading-none mt-0.5">Jump</span>
          </button>
          <button
            type="button"
            aria-label="Peck attack"
            className="w-16 h-16 rounded-full bg-red-600/70 border border-red-400/40 backdrop-blur-md text-white flex flex-col items-center justify-center"
            style={{ touchAction: 'none' }}
            {...bindHold('ShiftLeft', 'Shift')}
          >
            <Swords className="h-6 w-6" />
            <span className="text-[10px] leading-none mt-0.5">Peck</span>
          </button>
        </div>
      </div>
    </>
  )
};

export default ControlPanel;
