"use client"

import { useState, useEffect } from "react"
import { WalletMultiButton } from "@/components/wallet/wallet-multi-button"
import { useWallet } from "@/hooks/use-wallet"
import GameNavigation from "@/components/game-navigation"
import ChickenViewer from "@/components/3d/chicken-viewer"
import { Button } from "@/components/ui/button"
import { motion } from "framer-motion"
import Image from "next/image"
import Link from "next/link"
import { useWalletPrompt } from "@/contexts/WalletPromptContext"
import { useRouter } from "next/navigation"

export default function GameLandingPage() {
  const { connected } = useWallet()
  const { promptWallet } = useWalletPrompt()
  const router = useRouter()
  const [showNavigation, setShowNavigation] = useState(false)
  const [audioEnabled, setAudioEnabled] = useState(false)

  useEffect(() => {
    if (connected) {
      setShowNavigation(true)
      // Navigate to arena page after connection
      router.push("/arena")
    }
  }, [connected, router])

  const handlePlayNow = () => {
    if (!connected) {
      promptWallet()
    } else {
      router.push("/arena")
    }
  }

  // Handle audio toggle
  const toggleAudio = () => {
    setAudioEnabled(!audioEnabled)
    // Audio implementation would go here
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-900 via-purple-800 to-purple-950 text-white overflow-hidden relative">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute w-full h-full bg-[url('/placeholder.svg?height=1080&width=1920')] bg-cover bg-center opacity-20 animate-pulse"></div>
        <div className="absolute top-0 left-0 w-full h-full">
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className="absolute rounded-full bg-purple-500/20"
              style={{
                top: `${Math.random() * 100}%`,
                left: `${Math.random() * 100}%`,
                width: `${Math.random() * 300 + 50}px`,
                height: `${Math.random() * 300 + 50}px`,
                animation: `float ${Math.random() * 10 + 10}s infinite ease-in-out`,
                animationDelay: `${Math.random() * 5}s`,
              }}
            ></div>
          ))}
        </div>
      </div>

      {/* Game UI Header */}
      <header className="relative z-10 flex justify-between items-center p-4 border-b border-purple-500/30">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="w-8 h-8 rounded-full bg-purple-900/50 border-purple-500"
            onClick={toggleAudio}
          >
            {audioEnabled ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-4 h-4"
              >
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-4 h-4"
              >
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <line x1="23" y1="9" x2="17" y2="15" />
                <line x1="17" y1="9" x2="23" y2="15" />
              </svg>
            )}
          </Button>
        </div>

        <nav className="hidden md:flex gap-6">
          <Link href="#" className="text-purple-300 hover:text-white transition-colors">
            Leaderboard
          </Link>
          <Link href="#" className="text-purple-300 hover:text-white transition-colors">
            Roadmap
          </Link>
          <Link href="#" className="text-purple-300 hover:text-white transition-colors">
            Discord
          </Link>
          <Link href="https://www.x.com/CockCombatSOL" target="_blank" rel="noopener noreferrer" className="text-purple-300 hover:text-white transition-colors">
            Twitter
          </Link>
        </nav>

        <div>{!connected && <WalletMultiButton />}</div>
      </header>

      {/* Main content */}
      <main className="relative z-10">
        {/* Mobile-only socials and token block */}
        <section className="block sm:hidden px-4 pt-4">
          <div className="rounded-lg border border-white/10 bg-white/5 p-3 shadow">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-mono tracking-tight text-purple-100 truncate max-w-[56%]" aria-label="Token contract address">
                Token: V6CRprMS...Qpump
              </span>
              <div className="flex items-center gap-2">
                <a href="https://www.x.com/CockCombatSOL" target="_blank" rel="noopener noreferrer" aria-label="X" className="p-2 rounded-md border border-white/10 bg-white/5">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M22.46 5.924c-.793.352-1.645.59-2.54.697a4.48 4.48 0 001.963-2.475 8.959 8.959 0 01-2.828 1.082A4.478 4.478 0 0016.112 4c-2.482 0-4.495 2.013-4.495 4.495 0 .353.04.698.117 1.028-3.74-.188-7.055-1.98-9.273-4.702a4.49 4.49 0 00-.608 2.262c0 1.56.794 2.936 2.004 3.744a4.468 4.468 0 01-2.037-.563v .057c0 2.18 1.55 4.002 3.605 4.418a4.506 4.506 0 01-2.03 .077c.573 1.788 2.236 3.09 4.208 3.126A8.987 8.987 0 012 19.54a12.697 12.697 0 006.88 2.018c8.253 0 12.777-6.837 12.777-12.776 0-.195-.004-.39-.013-.583A9.14 9.14 0 0024 4.59a8.98 8.98 0 01-2.54 .697z" fill="#1DA1F2"/></svg>
                </a>
                <a href="https://discord.gg/Tj2vBPgbFP" target="_blank" rel="noopener noreferrer" aria-label="Discord" className="p-2 rounded-md border border-white/10 bg-white/5">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20.317 4.369a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.211.375-.444.864-.608 1.249a18.27 18.27 0 00-5.487 0 12.317 12.317 0 00-.617-1.249.077.077 0 00-.079-.037 19.736 19.736 0 00-4.885 1.515.07.07 0 00-.032.027C.533 9.045-.32 13.58.099 18.07a.082.082 0 00.031.056 19.9 19.9 0 006.014 3.06.08.08 0 00.087-.029c.463-.63.875-1.295 1.226-1.993a.076.076 0 00-.041-.104 12.795 12.795 0 01-1.806-.86.077.077 0 01-.008-.128c.122-.091.244-.186.361-.28a.074.074 0 01.078-.10c3.78 1.727 7.86 1.727 11.6 0a.074.074 0 01.079.009c.118.095.24.19.362.281a.077.077 0 01-.006.127 12.584 12.584 0 01-1.807.86.076.076 0 00-.04.105c.36.698.772 1.363 1.225 1.992a.08.08 0 00.087.03 19.876 19.876 0 006.015-3.06.08.08 0 00.031-.055c.5-5.177-.838-9.673-3.548-13.675a.061.061 0 00-.031-.028zM8.02 15.33c-1.163 0-2.11-1.06-2.11-2.366 0-1.307.94-2.367 2.11-2.367 1.18 0 2.12 1.07 2.11 2.367 0 1.306-.94 2.366-2.11 2.366zm7.975 0c-1.163 0-2.11-1.06-2.11-2.366 0-1.307.94-2.367 2.11-2.367 1.18 0 2.12 1.07 2.11 2.367 0 1.306-.93 2.366-2.11 2.366z" fill="#5865F2"/></svg>
                </a>
              </div>
            </div>
          </div>
        </section>
        {/* Hero section with 3D chicken */}
        <div className="flex flex-col lg:flex-row min-h-[80vh]">
          {/* Left side - Game info */}
          <div className="flex-1 flex flex-col justify-center p-8 lg:p-16">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
              <h1 className="text-6xl md:text-8xl font-extrabold mb-6 text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-red-500 to-purple-400 drop-shadow-[0_5px_5px_rgba(0,0,0,0.5)]">
                COCK COMBAT
              </h1>
              <p className="text-xl md:text-2xl mb-8 max-w-2xl text-purple-100 drop-shadow-md">
                The ultimate voxel chicken fighting arena on Solana. Battle for glory, bet on champions, and build your
                feathered empire.
              </p>

              {!showNavigation ? (
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <Button
                    className="bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 text-white font-bold py-3 px-8 rounded-lg text-lg shadow-lg transform transition hover:scale-105"
                    onClick={handlePlayNow}
                  >
                    PLAY NOW
                  </Button>
                  <Button
                    variant="outline"
                    className="border-2 border-purple-400 text-purple-100 hover:bg-purple-800/50 font-bold py-3 px-8 rounded-lg text-lg shadow-lg transform transition hover:scale-105"
                  >
                    WATCH TRAILER
                  </Button>
                </div>
              ) : (
                <GameNavigation />
              )}

              {/* Game features */}
              <div className="mt-12 grid grid-cols-3 gap-4">
                <motion.div
                  className="bg-purple-800/30 backdrop-blur-sm border border-purple-500/50 rounded-lg p-4 text-center"
                  whileHover={{ scale: 1.05 }}
                  transition={{ type: "spring", stiffness: 300 }}
                >
                  <div className="text-2xl mb-2">⚔️</div>
                  <h3 className="font-bold text-yellow-400">BATTLE</h3>
                </motion.div>
                <motion.div
                  className="bg-purple-800/30 backdrop-blur-sm border border-purple-500/50 rounded-lg p-4 text-center"
                  whileHover={{ scale: 1.05 }}
                  transition={{ type: "spring", stiffness: 300 }}
                >
                  <div className="text-2xl mb-2">💰</div>
                  <h3 className="font-bold text-yellow-400">BET</h3>
                </motion.div>
                <motion.div
                  className="bg-purple-800/30 backdrop-blur-sm border border-purple-500/50 rounded-lg p-4 text-center"
                  whileHover={{ scale: 1.05 }}
                  transition={{ type: "spring", stiffness: 300 }}
                >
                  <div className="text-2xl mb-2">🏆</div>
                  <h3 className="font-bold text-yellow-400">COLLECT</h3>
                </motion.div>
              </div>
            </motion.div>
          </div>

          {/* Right side - 3D chicken viewer */}
          <div className="flex-1 relative">
            <div className="absolute inset-0">
              <ChickenViewer />
            </div>
          </div>
        </div>

        {/* Game features section */}
        <div className="py-16 px-8 bg-gradient-to-b from-purple-900/80 to-purple-950/80 backdrop-blur-sm">
          <h2 className="text-4xl font-bold text-center mb-16 text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-red-500">
            BATTLE YOUR WAY TO GLORY
          </h2>

          <div className="grid grid-cols-3 gap-10 max-w-6xl mx-auto">
            <GameFeatureCard
              title="HYPERREALISTIC COMBAT"
              description="Experience intense voxel chicken battles with stunning graphics and realistic physics."
              icon="⚔️"
            />
            <GameFeatureCard
              title="WAGER & WIN"
              description="Put your tokens on the line in high-stakes matches and climb the leaderboard."
              icon="💰"
            />
            <GameFeatureCard
              title="OWN YOUR CHAMPION"
              description="Mint, train, and customize your unique chicken NFT to dominate the arena."
              icon="🏆"
            />
          </div>

          {/* CTA Button */}
          <div className="text-center mt-16">
            <Button className="bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 text-white font-bold py-3 px-8 rounded-lg text-lg shadow-lg transform transition hover:scale-105">
              JOIN THE BATTLE
            </Button>
          </div>
        </div>

        {/* Roadmap section */}
        <div className="py-16 px-8">
          <h2 className="text-4xl font-bold text-center mb-16 text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-red-500">
            ROADMAP
          </h2>
          <div className="relative max-w-4xl mx-auto">
            <div className="absolute left-1/2 top-0 bottom-0 w-1 bg-purple-700/50 transform -translate-x-1/2"></div>
            <RoadmapItem
              phase="PHASE 1"
              title="Launch & Mint"
              description="Initial chicken minting event and launch of the core battle arena."
              position="left"
            />
            <RoadmapItem
              phase="PHASE 2"
              title="Tournaments & Leaderboards"
              description="Introduction of competitive tournaments and global leaderboards."
              position="right"
            />
            <RoadmapItem
              phase="PHASE 3"
              title="Breeding & Customization"
              description="Breed new chickens with unique traits and expand customization options."
              position="left"
            />
            <RoadmapItem
              phase="PHASE 4"
              title="Land Ownership & Economy"
              description="Own a piece of the arena, build farms, and participate in the game's economy."
              position="right"
            />
          </div>
        </div>
      </main>

      {/* Game-style footer */}
      <footer className="relative z-10 border-t border-purple-500/30 py-6 px-8 bg-purple-950/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center">
          <div className="mb-4 md:mb-0">
            <h3 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-red-500">
              COCK COMBAT
            </h3>
            <p className="text-sm text-purple-300">© {new Date().getFullYear()} All rights reserved</p>
          </div>

          <div className="flex gap-6">
            <Link href="#" className="text-purple-300 hover:text-white transition-colors">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M22 4.01c-1 .49-1.98.689-3 .99-1.121-1.265-2.783-1.335-4.38-.737S11.977 6.323 12 8v1c-3.245.083-6.135-1.395-8-4 0 0-4.182 7.433 4 11-1.872 1.247-3.739 2.088-6 2 3.308 1.803 6.913 2.423 10.034 1.517 3.58-1.04 6.522-3.723 7.651-7.742a13.84 13.84 0 0 0 .497-3.753C20.18 7.773 21.692 5.25 22 4.009z" />
              </svg>
            </Link>
            <Link href="#" className="text-purple-300 hover:text-white transition-colors">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
              </svg>
            </Link>
            <Link href="#" className="text-purple-300 hover:text-white transition-colors">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
              </svg>
            </Link>
            <Link href="#" className="text-purple-300 hover:text-white transition-colors">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

function GameFeatureCard({ title, description, icon }: { title: string; description: string; icon: string }) {
  return (
    <motion.div
      className="bg-purple-800/30 backdrop-blur-sm border border-purple-500/50 rounded-lg p-6 text-center"
      whileHover={{ scale: 1.05, y: -5 }}
      transition={{ type: "spring", stiffness: 300 }}
    >
      <div className="text-4xl mb-4">{icon}</div>
      <h3 className="font-bold text-xl mb-2 text-yellow-400">{title}</h3>
      <p className="text-purple-200">{description}</p>
    </motion.div>
  )
}

function RoadmapItem({
  phase,
  title,
  description,
  position,
}: {
  phase: string
  title: string
  description: string
  position: "left" | "right"
}) {
  const alignment = position === "left" ? "text-right -mr-4" : "text-left -ml-4"
  const contentAlignment = position === "left" ? "items-end" : "items-start"

  return (
    <div className={`flex my-8 ${position === "left" ? "justify-start" : "justify-end"}`}>
      <div className={`w-1/2 px-4 ${position === "left" ? "pr-8" : "pl-8"}`}>
        <motion.div
          className="bg-purple-800/30 backdrop-blur-sm border border-purple-500/50 rounded-lg p-6"
          initial={{ opacity: 0, x: position === "left" ? -50 : 50 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <p className="text-sm font-bold text-yellow-400 mb-2">{phase}</p>
          <h3 className="text-2xl font-bold mb-3">{title}</h3>
          <p className="text-purple-200">{description}</p>
        </motion.div>
      </div>
    </div>
  )
}
