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

        <nav className="hidden md:flex gap-6 items-center">
          <Link href="#" className="text-purple-300 hover:text-white transition-colors">
            Leaderboard
          </Link>
          <Link href="#" className="text-purple-300 hover:text-white transition-colors">
            Roadmap
          </Link>
          <Link href="https://discord.gg/Tj2vBPgbFP" target="_blank" rel="noopener noreferrer" className="text-purple-300 hover:text-white transition-colors flex items-center gap-2">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
              <path d="M20.317 4.369a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.211.375-.444.864-.608 1.249a18.27 18.27 0 00-5.487 0 12.26 12.26 0 00-.617-1.249.077.077 0 00-.079-.037 19.736 19.736 0 00-4.885 1.515.07.07 0 00-.032.027C1.281 8.022.73 11.58.997 15.104a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.027c.461-.63.873-1.295 1.226-1.994a.076.076 0 00-.041-.105 13.2 13.2 0 01-1.872-.89.077.077 0 01-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 01.078-.01c3.927 1.793 8.18 1.793 12.062 0a.074.074 0 01.079.009c.12.099.246.198.373.292a.077.077 0 01-.006.127 12.315 12.315 0 01-1.873.889.076.076 0 00-.04.106c.36.698.772 1.363 1.225 1.994a.077.077 0 00.084.028 19.876 19.876 0 005.994-3.03.077.077 0 00.031-.056c.5-5.177-.838-8.705-3.548-10.708a.061.061 0 00-.031-.03zM8.02 13.51c-1.183 0-2.159-1.086-2.159-2.419 0-1.332.956-2.419 2.159-2.419 1.212 0 2.18 1.096 2.159 2.419 0 1.333-.956 2.419-2.159 2.419zm7.974 0c-1.183 0-2.159-1.086-2.159-2.419 0-1.332.956-2.419 2.159-2.419 1.212 0 2.18 1.096 2.159 2.419 0 1.333-.947 2.419-2.159 2.419z"/>
            </svg>
            Discord
          </Link>
          <Link href="https://www.x.com/CockCombatSOL" target="_blank" rel="noopener noreferrer" className="text-purple-300 hover:text-white transition-colors">
            Twitter
          </Link>
          <Link href="https://www.tiktok.com/@cockcombatgame" target="_blank" rel="noopener noreferrer" className="text-purple-300 hover:text-white transition-colors">
            TikTok
          </Link>
        </nav>

        <div>{!connected && <WalletMultiButton />}</div>
      </header>

      {/* Main content */}
      <main className="relative z-10">
        {/* Hero section with 3D chicken */}
        <div className="flex flex-col lg:flex-row min-h-[80vh]">
          {/* Left side - Game info */}
          <div className="flex-1 flex flex-col justify-center p-8 lg:p-16">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
              <h1 className="text-6xl md:text-8xl font-extrabold mb-6 text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-red-500 to-purple-400 drop-shadow-[0_5px_5px_rgba(0,0,0,0.5)]">
                COCK COMBAT
              </h1>
              <p className="text-xl md:text-2xl mb-8 max-w-2xl text-purple-100 drop-shadow-md">
                The ultimate voxel chicken fighting arena on BNB Chain. Battle for glory, bet on champions, and build your
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
