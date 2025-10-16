"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { WalletMultiButton } from "@/components/wallet/wallet-multi-button"
import { useWallet } from "@/hooks/use-wallet"
import { useUsername, getDisplayName } from "@/hooks/use-username"
import BalanceBar from "@/components/wallet/balance-bar"
import { Button } from "@/components/ui/button"
import { Volume2, VolumeX, Home, Copy, Check } from "lucide-react"
import Link from "next/link"
import { useRouter, usePathname } from "next/navigation"
import { useGameState } from "@/contexts/GameStateContext"
import Image from 'next/image';

export default function NavBar() {
  const { publicKey } = useWallet()
  const walletAddress = typeof publicKey === 'string' ? publicKey : ((publicKey as any)?.toBase58?.() || (publicKey as any)?.toString?.() || '')
  const username = useUsername(walletAddress)
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
    // marketplace removed
    if (pathname.startsWith("/profile")) return "PROFILE"
    if (pathname.startsWith("/spectate")) return "SPECTATE"
    if (pathname.startsWith("/lobbies")) return "LOBBIES"
    return "COCK COMBAT"
  }, [pathname])

  // State to prevent hydration mismatch for client-only components
  const [isMounted, setIsMounted] = useState(false);
  const [copied, setCopied] = useState(false)

  const TOKEN_MINT = "V6CRprMSfhuETeSCfWm4SL8dfr6KFRwTnUWB6NQpump"
  const tokenEndPreview = `…${TOKEN_MINT.slice(-6)}`

  const handleCopyTokenAddress = async () => {
    try {
      await navigator.clipboard.writeText(TOKEN_MINT)
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
    <header 
      className="relative z-[100004] flex items-center px-2 sm:px-4 md:px-8 py-2 sm:py-3 md:py-4 bg-[#222222] border-b-4 border-[#111111] text-white shadow-md gap-2 sm:gap-4 md:gap-8 flex-shrink-0"
      style={{
        paddingTop: 'max(0.5rem, env(safe-area-inset-top, 0px))',
      }}
    >
      {/* Left side - Music controls and home button */}
      <div className="flex basis-1/3 items-center justify-start gap-1.5 sm:gap-3 md:gap-4 min-w-0">
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
          className="w-16 sm:w-20 md:w-24 accent-yellow-400 border-2 border-yellow-600 rounded pixel-font"
          style={{ boxShadow: '2px 2px 0 #000', background: '#222' }}
          aria-label="Music volume"
        />
        <span className="hidden sm:block text-sm text-yellow-100 w-8 md:w-10 text-right select-none font-medium">{Math.round(volume * 100)}%</span>

        {/* Copy Token - moved to left group after music controls */}
        <div
          className={`hidden sm:inline-flex items-center gap-2 px-3 py-1 rounded-full border transition-colors duration-150 min-w-[110px] border-white/20 bg-white/5 text-white/80 cursor-pointer hover:bg-white/10`}
          aria-label="Copy token contract address"
          title={TOKEN_MINT}
          onClick={() => { handleCopyTokenAddress(); playSound("click"); }}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-green-400" />
          ) : (
            <Copy className="h-3.5 w-3.5 text-yellow-300" />
          )}
          <span className="text-xs font-mono tracking-wide">{copied ? 'Copied!' : `Token: ${tokenEndPreview}`}</span>
        </div>

        {/* Copy Token - mobile icon (hidden on mobile to declutter) */}
        <button
          onClick={() => { handleCopyTokenAddress(); playSound("click"); }}
          className={`hidden`}
          aria-label="Copy token contract address"
          type="button"
        >
          {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4 text-yellow-300" />}
        </button>
      </div>

      {/* Center - Title */}
      <div className="flex basis-1/3 justify-center items-center">
        <h1 className="text-2xl md:text-4xl font-bold pixel-font text-center text-yellow-400 drop-shadow-[3px_3px_0px_#000000] animate-pulse" style={{ animationDuration: '2s' }}>
        {title}
      </h1>
      </div>

      {/* Right side - Socials, Balances, Wallet */}
      <div className="flex basis-1/3 items-center justify-end gap-1 sm:gap-2 md:gap-3 min-w-0 flex-shrink-0">

        {/* Twitter / X (hidden on mobile) */}
        <a
          href="https://www.x.com/CockCombatSOL"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden sm:flex p-2 items-center justify-center"
          aria-label="Cock Combat on X"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.46 5.924c-.793.352-1.645.59-2.54.697a4.48 4.48 0 001.963-2.475 8.959 8.959 0 01-2.828 1.082A4.478 4.478 0 0016.112 4c-2.482 0-4.495 2.013-4.495 4.495 0 .353.04.698.117 1.028-3.74-.188-7.055-1.98-9.273-4.702a4.49 4.49 0 00-.608 2.262c0 1.56.794 2.936 2.004 3.744a4.468 4.468 0 01-2.037-.563v .057c0 2.18 1.55 4.002 3.605 4.418a4.506 4.506 0 01-2.03 .077c.573 1.788 2.236 3.09 4.208 3.126A8.987 8.987 0 012 19.54a12.697 12.697 0 006.88 2.018c8.253 0 12.777-6.837 12.777-12.776 0-.195-.004-.39-.013-.583A9.14 9.14 0 0024 4.59a8.98 8.98 0 01-2.54 .697z" fill="#1DA1F2"/>
          </svg>
        </a>

        {/* Discord (hidden on mobile) */}
        <a
          href="https://discord.gg/Tj2vBPgbFP"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden sm:flex p-2 items-center justify-center"
          aria-label="Join the Cock Combat Discord"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M20.317 4.369a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.211.375-.444.864-.608 1.249a18.27 18.27 0 00-5.487 0 12.317 12.317 0 00-.617-1.249.077.077 0 00-.079-.037 19.736 19.736 0 00-4.885 1.515.07.07 0 00-.032.027C.533 9.045-.32 13.58.099 18.07a.082.082 0 00.031.056 19.9 19.9 0 006.014 3.06.08.08 0 00.087-.029c.463-.63.875-1.295 1.226-1.993a.076.076 0 00-.041-.104 12.795 12.795 0 01-1.806-.86.077.077 0 01-.008-.128c.122-.091.244-.186.361-.28a.074.074 0 01.078-.01c3.78 1.727 7.86 1.727 11.6 0a.074.074 0 01.079.009c.118.095.24.19.362.281a.077.077 0 01-.006.127 12.584 12.584 0 01-1.807.86.076.076 0 00-.04.105c.36.698.772 1.363 1.225 1.992a.08.08 0 00.087.03 19.876 19.876 0 006.015-3.06.08.08 0 00.031-.055c.5-5.177-.838-9.673-3.548-13.675a.061.061 0 00-.031-.028zM8.02 15.33c-1.163 0-2.11-1.06-2.11-2.366 0-1.307.94-2.367 2.11-2.367 1.18 0 2.12 1.07 2.11 2.367 0 1.306-.94 2.366-2.11 2.366zm7.975 0c-1.163 0-2.11-1.06-2.11-2.366 0-1.307.94-2.367 2.11-2.367 1.18 0 2.12 1.07 2.11 2.367 0 1.306-.93 2.366-2.11 2.366z" fill="#5865F2"/>
          </svg>
        </a>

        {/* TikTok (hidden on mobile) */}
        <a
          href="https://www.tiktok.com/@cockcombatgame"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden sm:flex p-2 items-center justify-center"
          aria-label="Cock Combat on TikTok"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" fill="#00F2EA"/>
          </svg>
        </a>

        {/* Balances */}
        {isMounted && <BalanceBar compact className="hidden sm:flex" />}

        {/* Wallet */}
        {isMounted && <WalletMultiButton className="shrink-0" />}
      </div>
    </header>
  )
}
