"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { WalletMultiButton } from "@/components/wallet/wallet-multi-button"
import { useWallet } from "@/hooks/use-wallet"
import { Button } from "@/components/ui/button"
import { Volume2, VolumeX, Home } from "lucide-react"
import Link from "next/link"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import Image from "next/image"
import { useAudio } from "@/contexts/AudioContext"

// --- Define Prop Interfaces ---
interface ChickenStats {
  strength: number;
  speed: number;
  defense: number;
}

interface ChickenData {
  id: string;
  name: string;
  level: number;
  wins: number;
  losses: number;
  image?: string;
  stats: ChickenStats;
}

interface BattleData {
  id: number;
  result: "win" | "loss";
  fighter: string;
  opponent: string;
  reward: number;
  date: string;
}

interface ChickenCardProps {
  chicken: ChickenData;
}

interface BattleHistoryItemProps {
  battle: BattleData;
}
// ------------------------------

// Chicken Card Component
function ChickenCard({ chicken }: ChickenCardProps) {
  return (
    <div className="bg-[#444444] border-2 border-[#666666] rounded-lg overflow-hidden hover:border-yellow-500 transition-all">
      <div className="aspect-square relative bg-[#333333]">
        <Image
          src={chicken.image || "/placeholder.svg?height=200&width=200"}
          alt={chicken.name}
          fill
          className="object-contain p-4"
        />
      </div>
      <div className="p-4">
        <h3 className="font-bold text-white mb-1">{chicken.name}</h3>
        <div className="text-xs text-gray-300 mb-3">Level {chicken.level}</div>

        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="bg-[#333333] p-1 rounded text-center">
            <div className="text-xs text-gray-400">STR</div>
            <div className="text-white font-bold">{chicken.stats.strength}</div>
          </div>
          <div className="bg-[#333333] p-1 rounded text-center">
            <div className="text-xs text-gray-400">SPD</div>
            <div className="text-white font-bold">{chicken.stats.speed}</div>
          </div>
          <div className="bg-[#333333] p-1 rounded text-center">
            <div className="text-xs text-gray-400">DEF</div>
            <div className="text-white font-bold">{chicken.stats.defense}</div>
          </div>
        </div>

        <div className="flex justify-between text-sm">
          <span className="text-green-400">{chicken.wins} Wins</span>
          <span className="text-red-400">{chicken.losses} Losses</span>
        </div>
      </div>
    </div>
  )
}

// Battle History Item Component
function BattleHistoryItem({ battle }: BattleHistoryItemProps) {
  return (
    <div className="p-4 flex items-center justify-between border-b border-[#555555]">
      <div className="flex items-center space-x-3">
        <div className={`w-3 h-3 rounded-full ${battle.result === "win" ? "bg-green-500" : "bg-red-500"}`}></div>
        <div>
          <div className="font-medium text-white">
            {battle.fighter} vs {battle.opponent}
          </div>
          <div className="text-sm text-gray-400">{battle.date}</div>
        </div>
      </div>
      <div className={battle.result === "win" ? "text-yellow-400 font-bold" : "text-gray-400"}>
        {battle.result === "win" ? `+${battle.reward} $CLUCK` : "No reward"}
      </div>
    </div>
  )
}

export default function ProfilePage() {
  const router = useRouter()
  const { connected, publicKey } = useWallet()
  const { audioEnabled, setAudioEnabled, playSound, playMusic, volume, pauseMusic } = useAudio()
  const [userChickens, setUserChickens] = useState<ChickenData[]>([])
  const [battleHistory, setBattleHistory] = useState<BattleData[]>([])
  const [stats, setStats] = useState({
    totalFights: 0,
    wins: 0,
    losses: 0,
    cluckBalance: 0,
  })
  const [loading, setLoading] = useState(true)

  // Redirect if not connected
  useEffect(() => {
    if (!connected) {
      // Small delay to avoid immediate redirect
      const timer = setTimeout(() => {
        router.push("/")
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [connected, router])

  // Load user data
  useEffect(() => {
    if (connected) {
      // Simulate loading user data
      setTimeout(() => {
        setUserChickens([
          {
            id: "chicken-1",
            name: "Feather Fury",
            level: 3,
            wins: 7,
            losses: 2,
            image: "/placeholder.svg?height=200&width=200",
            stats: { strength: 8, speed: 7, defense: 5 },
          },
          {
            id: "chicken-2",
            name: "Beak Breaker",
            level: 5,
            wins: 12,
            losses: 3,
            image: "/placeholder.svg?height=200&width=200",
            stats: { strength: 9, speed: 6, defense: 7 },
          },
          {
            id: "chicken-3",
            name: "Talon Terror",
            level: 2,
            wins: 3,
            losses: 1,
            image: "/placeholder.svg?height=200&width=200",
            stats: { strength: 6, speed: 9, defense: 4 },
          },
        ])

        setBattleHistory([
          { id: 1, result: "win", fighter: "Feather Fury", opponent: "Wing Warrior", reward: 25, date: "2 hours ago" },
          { id: 2, result: "loss", fighter: "Beak Breaker", opponent: "Cluck Norris", reward: 0, date: "5 hours ago" },
          { id: 3, result: "win", fighter: "Talon Terror", opponent: "Hen Solo", reward: 15, date: "Yesterday" },
          { id: 4, result: "win", fighter: "Feather Fury", opponent: "Mother Clucker", reward: 30, date: "2 days ago" },
        ])

        setStats({
          totalFights: 25,
          wins: 19,
          losses: 6,
          cluckBalance: 145,
        })

        setLoading(false)
      }, 1500)
    }
  }, [connected])

  // Setup background music using AudioContext
  useEffect(() => {
    if (audioEnabled) {
      playMusic('/sounds/background.mp3')
    } else {
      pauseMusic()
    }
  }, [audioEnabled, playMusic, pauseMusic])

  // Handle audio toggle using AudioContext
  const toggleAudio = () => {
    const currentlyEnabled = audioEnabled;
    setAudioEnabled(!currentlyEnabled);
    // playSound("click") // Optional: play click sound
  }

  // Play sound effect (already uses context correctly via playSound)
  const handleSoundClick = (soundName: string) => {
    playSound(soundName)
  }

  return (
    <div className="h-screen w-screen overflow-hidden relative bg-[#3a8c4f] flex flex-col">
      {/* Pixel art background - profile themed */}
      <div className="absolute inset-0 z-0">
        {/* Sky */}
        <div className="absolute inset-0 bg-[#2c3e50] h-1/2"></div>

        {/* Ground */}
        <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-[#34495e]"></div>

        {/* Trophy display */}
        <div className="absolute top-[30%] left-[10%] w-12 h-16">
          <div className="w-8 h-8 mx-auto bg-yellow-400 rounded-full"></div>
          <div className="w-12 h-4 bg-yellow-500"></div>
          <div className="w-4 h-8 mx-auto bg-yellow-500"></div>
        </div>

        <div className="absolute top-[35%] right-[15%] w-10 h-14">
          <div className="w-6 h-6 mx-auto bg-gray-300 rounded-full"></div>
          <div className="w-10 h-3 bg-gray-400"></div>
          <div className="w-3 h-6 mx-auto bg-gray-400"></div>
        </div>
      </div>

      {/* Game header */}
      <header className="relative z-10 flex justify-between items-center p-4 bg-[#333333] border-b-4 border-[#222222] text-white">
        <div className="flex items-center gap-2">
          <Link href="/">
            <Button
              variant="outline"
              size="icon"
              className="w-10 h-10 rounded-md bg-[#444444] border-2 border-[#666666] hover:bg-[#555555]"
              onClick={() => handleSoundClick("click")}
            >
              <Home className="w-6 h-6" />
            </Button>
          </Link>
          <Button
            variant="outline"
            size="icon"
            className="w-10 h-10 rounded-md bg-[#444444] border-2 border-[#666666] hover:bg-[#555555]"
            onClick={() => {
              toggleAudio() 
              handleSoundClick("click") // Play click sound via context
            }}
          >
            {audioEnabled ? <Volume2 className="w-6 h-6" /> : <VolumeX className="w-6 h-6" />}
          </Button>
        </div>

        <h1 className="text-2xl md:text-3xl font-bold pixel-font text-center text-yellow-400 drop-shadow-[2px_2px_0px_#000000] animate-pulse">
          MY PROFILE
        </h1>

        <div>{!connected && <WalletMultiButton onClickSound={() => handleSoundClick("click")} />}</div>
      </header>

      {/* Main content */}
      <main className="relative z-10 flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-16 h-16 border-4 border-t-yellow-400 border-r-yellow-400 border-b-transparent border-l-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-white pixel-font">Loading Profile...</p>
            </div>
          </div>
        ) : (
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 bg-[#444444] p-4 rounded-lg border-2 border-[#666666]">
              <div>
                <h2 className="text-2xl font-bold text-yellow-400 pixel-font">My Cock Collection</h2>
                <p className="text-sm text-gray-300">
                  Wallet: {publicKey.slice(0, 6)}...{publicKey.slice(-4)}
                </p>
              </div>

              <div className="mt-4 md:mt-0 flex items-center space-x-4">
                <div className="bg-[#333333] px-4 py-2 rounded-lg border border-[#555555]">
                  <span className="text-yellow-400 font-bold">{stats.cluckBalance} $CLUCK</span>
                </div>
                <Button
                  className="bg-[#ff4500] hover:bg-[#ff6347] text-white font-bold"
                  onClick={() => handleSoundClick("click")}
                >
                  Get More $CLUCK
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-[#444444] rounded-lg p-4 border-2 border-[#666666]">
                <div className="text-sm text-gray-300">Total Fighters</div>
                <div className="text-2xl font-bold text-white">{userChickens.length}</div>
              </div>
              <div className="bg-[#444444] rounded-lg p-4 border-2 border-[#666666]">
                <div className="text-sm text-gray-300">Total Fights</div>
                <div className="text-2xl font-bold text-white">{stats.totalFights}</div>
              </div>
              <div className="bg-[#444444] rounded-lg p-4 border-2 border-[#666666]">
                <div className="text-sm text-gray-300">Wins</div>
                <div className="text-2xl font-bold text-green-400">{stats.wins}</div>
              </div>
              <div className="bg-[#444444] rounded-lg p-4 border-2 border-[#666666]">
                <div className="text-sm text-gray-300">Losses</div>
                <div className="text-2xl font-bold text-red-400">{stats.losses}</div>
              </div>
            </div>

            <Tabs defaultValue="collection" className="mb-6">
              <TabsList className="bg-[#444444] border border-[#666666]">
                <TabsTrigger
                  value="collection"
                  className="data-[state=active]:bg-[#555555]"
                  onClick={() => handleSoundClick("tab")}
                >
                  My Collection
                </TabsTrigger>
                <TabsTrigger
                  value="history"
                  className="data-[state=active]:bg-[#555555]"
                  onClick={() => handleSoundClick("tab")}
                >
                  Battle History
                </TabsTrigger>
              </TabsList>

              <TabsContent value="collection" className="pt-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {userChickens.map((chicken) => (
                    <ChickenCard key={chicken.id} chicken={chicken} />
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="history" className="pt-4">
                <div className="bg-[#444444] rounded-lg overflow-hidden border-2 border-[#666666]">
                  {battleHistory.map((battle) => (
                    <BattleHistoryItem key={battle.id} battle={battle} />
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </main>

      {/* Game footer */}
      <footer className="relative z-10 p-2 bg-[#333333] border-t-4 border-[#222222] text-white text-center text-xs">
        <p>© {new Date().getFullYear()} Cock Combat • Powered by Solana</p>
      </footer>
    </div>
  )
}
