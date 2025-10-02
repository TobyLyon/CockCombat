"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { WalletMultiButton } from "@/components/wallet/wallet-multi-button"
import { Button } from "@/components/ui/button"
import { Volume2, VolumeX, Home, Copy, Check } from "lucide-react"
import Link from "next/link"
import { useRouter, usePathname } from "next/navigation"
import { useGameState } from "@/contexts/GameStateContext"
import Image from 'next/image';

export default function NavBar() {
  const router = useRouter()
  const pathname = usePathname()
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

  const title = useMemo(() => {
    if (!pathname) return "COCK COMBAT"
    if (pathname === "/") return "COCK COMBAT"
    if (pathname.startsWith("/arena")) return "ARENA"
    if (pathname.startsWith("/marketplace")) return "MARKETPLACE"
    if (pathname.startsWith("/profile")) return "PROFILE"
    if (pathname.startsWith("/spectate")) return "SPECTATE"
    if (pathname.startsWith("/lobbies")) return "LOBBIES"
    return "COCK COMBAT"
  }, [pathname])

  // State to prevent hydration mismatch for client-only components
  const [isMounted, setIsMounted] = useState(false);
  const [copied, setCopied] = useState(false)

  const tokenAddressPlaceholder = "coming soon"
  const tokenEndPreview = tokenAddressPlaceholder.length > 6
    ? `…${tokenAddressPlaceholder.slice(-4)}`
    : tokenAddressPlaceholder

  const handleCopyTokenAddress = async () => {
    try {
      await navigator.clipboard.writeText(tokenAddressPlaceholder)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch (_err) {
      // ignore copy errors
    }
  }

  useEffect(() => {
    setIsMounted(true);
  }, []);

  return (
    <header className="relative z-10 flex items-center px-4 md:px-8 py-4 bg-[#222222] border-b-4 border-[#111111] text-white shadow-md gap-4 md:gap-8">
      {/* Left side - Music controls and home button */}
      <div className="flex basis-1/3 items-center justify-start gap-3 md:gap-4">
        <Link href="/">
          <Button
            variant="outline"
            size="icon"
            className="w-9 h-9 md:w-10 md:h-10 rounded-md bg-[#444444] border-2 border-[#666666] hover:bg-[#555555]"
            onClick={() => playSound("click")}
          >
            <Home className="w-5 h-5 md:w-6 md:h-6" />
          </Button>
        </Link>
        
        {/* Music widget - no container */}
        <button
          onClick={handleAudioToggle}
          className="focus:outline-none border-2 border-yellow-600 rounded bg-[#222] hover:bg-yellow-300 hover:text-black transition-colors duration-100 p-1.5 flex items-center justify-center cursor-pointer"
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
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={volume * 100}
          onChange={handleVolumeChange}
          className="w-20 sm:w-28 md:w-32 accent-yellow-400 border-2 border-yellow-600 rounded pixel-font"
          style={{ boxShadow: '2px 2px 0 #000', background: '#222' }}
          aria-label="Music volume"
        />
        <span className="hidden sm:block text-sm text-yellow-100 w-10 md:w-12 text-right select-none font-medium">{Math.round(volume * 100)}%</span>
      </div>

      {/* Center - Title */}
      <div className="flex basis-1/3 justify-center items-center">
        <h1 className="text-2xl md:text-4xl font-bold pixel-font text-center text-yellow-400 drop-shadow-[3px_3px_0px_#000000] animate-pulse" style={{ animationDuration: '2s' }}>
        {title}
      </h1>
      </div>

      {/* Right side - Copy token (enhanced), Twitter, Wallet */}
      <div className="flex basis-1/3 items-center justify-end gap-3 md:gap-4">
        {/* Copy Token - desktop enhanced pill */}
        <button
          onClick={() => { handleCopyTokenAddress(); playSound("click"); }}
          className={`hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-md border-2 shadow transition-colors duration-150 ${
            copied
              ? 'border-green-500 bg-green-600/20 text-green-300'
              : 'border-[#666666] bg-[#2a2a2a] text-gray-200 hover:bg-[#3a3a3a] hover:border-yellow-500'
          }`}
          style={{ boxShadow: '2px 2px 0 #000' }}
          aria-label="Copy token contract address"
          title="Copy token contract address"
          type="button"
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4 text-yellow-300" />}
          <span className="text-xs font-mono">Token: {tokenEndPreview}</span>
        </button>

        {/* Copy Token - mobile icon */}
        <button
          onClick={() => { handleCopyTokenAddress(); playSound("click"); }}
          className={`sm:hidden inline-flex items-center justify-center p-2 border-2 rounded-md transition-colors ${
            copied
              ? 'border-green-500 bg-green-600/20'
              : 'border-[#666666] bg-[#333333] hover:bg-[#444444]'
          }`}
          aria-label="Copy token contract address"
          type="button"
        >
          {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4 text-yellow-300" />}
        </button>

        {/* Twitter */}
        <a
          href="https://twitter.com/CockCombat"
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 flex items-center justify-center"
          aria-label="Cock Combat Twitter"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.46 5.924c-.793.352-1.645.59-2.54.697a4.48 4.48 0 001.963-2.475 8.959 8.959 0 01-2.828 1.082A4.478 4.478 0 0016.112 4c-2.482 0-4.495 2.013-4.495 4.495 0 .353.04.698.117 1.028-3.74-.188-7.055-1.98-9.273-4.702a4.49 4.49 0 00-.608 2.262c0 1.56.794 2.936 2.004 3.744a4.468 4.468 0 01-2.037-.563v .057c0 2.18 1.55 4.002 3.605 4.418a4.506 4.506 0 01-2.03 .077c.573 1.788 2.236 3.09 4.208 3.126A8.987 8.987 0 012 19.54a12.697 12.697 0 006.88 2.018c8.253 0 12.777-6.837 12.777-12.776 0-.195-.004-.39-.013-.583A9.14 9.14 0 0024 4.59a8.98 8.98 0 01-2.54 .697z" fill="#1DA1F2"/>
          </svg>
        </a>

        {/* Wallet */}
        {isMounted && <WalletMultiButton onClickSound={() => playSound("click")} />}
      </div>
    </header>
  )
}
