"use client"

import { useState, useEffect, useRef } from "react"
import { WalletMultiButton } from "@/components/wallet/wallet-multi-button"
import { Button } from "@/components/ui/button"
import { Volume2, VolumeX, Home } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useGameState } from "@/contexts/GameStateContext"
import Image from 'next/image';

export default function NavBar() {
  const router = useRouter()
  const { 
    audioEnabled, 
    volume, 
    toggleAudio, 
    setVolume, 
    playSound 
  } = useGameState()

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = Number(e.target.value) / 100
    setVolume(newVolume)
  }

  const handleAudioToggle = () => {
    playSound("click")
    toggleAudio()
  }

  const title = "COCK COMBAT"

  // State to prevent hydration mismatch for client-only components
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  return (
    <header className="relative z-10 flex justify-between items-center p-4 bg-[#222222] border-b-4 border-[#111111] text-white shadow-md gap-4">
      {/* Left side - Music controls and home button */}
      <div className="flex items-center gap-2">
        <Link href="/">
          <Button
            variant="outline"
            size="icon"
            className="w-10 h-10 rounded-md bg-[#444444] border-2 border-[#666666] hover:bg-[#555555]"
            onClick={() => playSound("click")}
          >
            <Home className="w-6 h-6" />
          </Button>
        </Link>
        
        {/* Music widget with volume control */}
        <div className="flex items-center gap-2 min-w-[260px] h-12 bg-black/80 rounded-lg border-4 border-yellow-600 shadow-lg px-4 py-2 pixel-font">
          <button
            onClick={handleAudioToggle}
            className="focus:outline-none border-2 border-yellow-600 rounded bg-[#222] hover:bg-yellow-300 hover:text-black transition-colors duration-100 p-1.5 flex items-center justify-center cursor-pointer z-10 relative"
            aria-label={audioEnabled ? 'Mute music' : 'Unmute music'}
            style={{ boxShadow: '2px 2px 0 #000' }}
            type="button"
          >
            {audioEnabled ? (
              <Volume2 className="text-yellow-300 w-5 h-5 pointer-events-none" />
            ) : (
              <VolumeX className="text-yellow-300 w-5 h-5 pointer-events-none" />
            )}
          </button>
          <span className="text-yellow-200 text-sm font-bold tracking-wide select-none pixel-font">Music</span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={volume * 100}
            onChange={handleVolumeChange}
            className="w-24 accent-yellow-400 border-2 border-yellow-600 rounded pixel-font"
            style={{ boxShadow: '2px 2px 0 #000', background: '#222' }}
            aria-label="Music volume"
          />
          <span className="text-sm text-yellow-100 w-10 text-right select-none pixel-font">{Math.round(volume * 100)}%</span>
        </div>
      </div>

      {/* Center - Title */}
      <div className="flex-1 flex justify-center items-center gap-4">
        <h1 className="text-2xl md:text-4xl font-bold pixel-font text-center text-yellow-400 drop-shadow-[3px_3px_0px_#000000] animate-pulse" style={{ animationDuration: '2s' }}>
        {title}
      </h1>
        <Image src="/letsbonk.svg" alt="Bonk" width={144} height={144} />
      </div>

      {/* Right side - Wallet button and other links */}
      <div className="flex items-center gap-2 min-w-[220px] justify-end">
        {/* Only render WalletMultiButton on the client */}
        {isMounted && <WalletMultiButton onClickSound={() => playSound("click")} />}
        
        <a
          href="https://twitter.com/CockCombat"
          target="_blank"
          rel="noopener noreferrer"
          className="border-4 border-yellow-600 rounded-lg bg-[#222] hover:bg-yellow-300 hover:border-yellow-500 transition-colors duration-100 p-2 flex items-center justify-center pixel-font"
          style={{ boxShadow: '3px 3px 0 #000' }}
          aria-label="Cock Combat Twitter"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.46 5.924c-.793.352-1.645.59-2.54.697a4.48 4.48 0 001.963-2.475 8.959 8.959 0 01-2.828 1.082A4.478 4.478 0 0016.112 4c-2.482 0-4.495 2.013-4.495 4.495 0 .353.04.698.117 1.028-3.74-.188-7.055-1.98-9.273-4.702a4.49 4.49 0 00-.608 2.262c0 1.56.794 2.936 2.004 3.744a4.468 4.468 0 01-2.037-.563v.057c0 2.18 1.55 4.002 3.605 4.418a4.506 4.506 0 01-2.03.077c.573 1.788 2.236 3.09 4.208 3.126A8.987 8.987 0 012 19.54a12.697 12.697 0 006.88 2.018c8.253 0 12.777-6.837 12.777-12.776 0-.195-.004-.39-.013-.583A9.14 9.14 0 0024 4.59a8.98 8.98 0 01-2.54.697z" fill="#1DA1F2"/>
          </svg>
        </a>
      </div>
    </header>
  )
}
