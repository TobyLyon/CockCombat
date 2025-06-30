"use client"

import { useState, useEffect } from "react"
import { WalletMultiButton } from "@/components/wallet/wallet-multi-button"
import { useWallet } from "@/hooks/use-wallet"
import GameNavigation from "@/components/game-navigation"
import Image from "next/image"

export default function LandingPage() {
  const { connected, connecting } = useWallet()
  const [showNavigation, setShowNavigation] = useState(false)

  // Show game navigation after successful wallet connection
  useEffect(() => {
    if (connected) {
      setShowNavigation(true)
    }
  }, [connected])

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-900 via-purple-800 to-purple-950 text-white">
      {/* Hero Section */}
      <div className="relative h-screen flex flex-col items-center justify-center overflow-hidden">
        {/* Background effects */}
        <div className="absolute inset-0 bg-[url('/placeholder.svg?height=1080&width=1920')] bg-cover bg-center opacity-20"></div>
        <div className="absolute inset-0 bg-gradient-to-t from-purple-950 to-transparent"></div>

        {/* Content */}
        <div className="relative z-10 container mx-auto px-4 text-center">
          <h1 className="text-6xl md:text-8xl font-extrabold mb-6 text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-purple-100">
            COCK COMBAT
          </h1>
          <p className="text-xl md:text-2xl mb-8 max-w-3xl mx-auto text-purple-200">
            The ultimate voxel chicken fighting arena on Solana. Battle for glory, bet on champions, and build your
            feathered empire.
          </p>

          {!showNavigation ? (
            <div className="flex flex-col items-center space-y-6">
              <WalletMultiButton />
              <p className="text-sm text-purple-300">Connect your Solana wallet to enter the arena</p>
            </div>
          ) : (
            <GameNavigation />
          )}
        </div>

        {/* Animated chickens */}
        <div className="absolute bottom-0 left-0 right-0 h-40 flex justify-center">
          <div className="relative w-full max-w-6xl">
            <div className="absolute left-1/4 bottom-0 transform -translate-x-1/2 animate-bounce-slow">
              <Image
                src="/placeholder.svg?height=200&width=200"
                width={200}
                height={200}
                alt="Combat Chicken"
                className="drop-shadow-glow"
              />
            </div>
            <div className="absolute right-1/4 bottom-0 transform translate-x-1/2 animate-bounce-slow animation-delay-500">
              <Image
                src="/placeholder.svg?height=200&width=200"
                width={200}
                height={200}
                alt="Combat Chicken"
                className="drop-shadow-glow"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="py-20 bg-purple-950/80">
        <div className="container mx-auto px-4">
          <h2 className="text-4xl font-bold text-center mb-16">Enter the Combat Arena</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            <FeatureCard
              title="BATTLE"
              description="Enter the arena with your prized fighters. Use strategy and skill to defeat opponents and claim their bounty."
              icon="⚔️"
            />
            <FeatureCard
              title="BET"
              description="Can't fight? Place bets on your favorite champions and earn $CLUCK when they triumph in the arena."
              icon="💰"
            />
            <FeatureCard
              title="COLLECT"
              description="Build your collection of hyperrealistic voxel fighters. Train them, customize them, and dominate the leaderboards."
              icon="🏆"
            />
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="py-8 bg-purple-950 text-purple-400 text-center">
        <div className="container mx-auto px-4">
          <p>© {new Date().getFullYear()} Cock Combat. All rights reserved.</p>
          <p className="text-sm mt-2">Powered by Solana</p>
        </div>
      </footer>
    </div>
  )
}

function FeatureCard({ title, description, icon }) {
  return (
    <div className="bg-purple-900/50 rounded-xl p-8 border border-purple-700/50 hover:border-purple-500/50 transition-all hover:bg-purple-800/30 hover:shadow-glow">
      <div className="text-4xl mb-4">{icon}</div>
      <h3 className="text-2xl font-bold mb-4">{title}</h3>
      <p className="text-purple-300">{description}</p>
    </div>
  )
}
