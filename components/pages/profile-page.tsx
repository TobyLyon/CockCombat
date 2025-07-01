"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { WalletMultiButton } from "@/components/wallet/wallet-multi-button"
import { useWallet } from "@/hooks/use-wallet"
import { Button } from "@/components/ui/button"
import { Volume2, VolumeX, Home, Loader2, CheckCircle } from "lucide-react"
import Link from "next/link"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import Image from "next/image"
import { useAudio } from "@/contexts/AudioContext"
import { useProfile } from "@/hooks/use-profile"
import { Chicken } from "@/lib/supabase-client"

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
  chicken: Chicken;
  isActive: boolean;
  onSelect: (chickenId: string) => void;
}

interface BattleHistoryItemProps {
  battle: BattleData;
}
// ------------------------------

// Chicken Card Component
function ChickenCard({ chicken, isActive, onSelect }: ChickenCardProps) {
  return (
    <div 
      className={`bg-[#444444] border-2 rounded-lg overflow-hidden transition-all relative
        ${isActive ? "border-yellow-400 shadow-lg shadow-yellow-400/20" : "border-[#666666] hover:border-yellow-500"}`
      }
    >
      {isActive && (
        <div className="absolute top-2 right-2 bg-yellow-400 text-black px-2 py-1 text-xs font-bold rounded-full flex items-center gap-1">
          <CheckCircle className="h-4 w-4" />
          ACTIVE
        </div>
      )}
      <div className="aspect-square relative bg-[#333333]">
        <Image
          src={"/placeholder.svg?height=200&width=200"} // Replace with actual chicken image if available
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

        <div className="flex justify-between text-sm mb-4">
          <span className="text-green-400">{chicken.wins} Wins</span>
          <span className="text-red-400">{chicken.losses} Losses</span>
        </div>
        
        <Button 
          onClick={() => onSelect(chicken.id)}
          disabled={isActive}
          className="w-full"
          variant={isActive ? "outline" : "primary"}
        >
          {isActive ? "Activated" : "Activate"}
        </Button>
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
  const { connected } = useWallet()
  const { audioEnabled, setAudioEnabled, playSound } = useAudio()
  const { 
    profile, 
    chickens, 
    activeChicken, 
    setActiveChicken,
    isLoadingProfile, 
    refreshProfile 
  } = useProfile()
  const [isSettingActive, setIsSettingActive] = useState(false)

  // Redirect if not connected
  useEffect(() => {
    if (!connected && !isLoadingProfile) {
      const timer = setTimeout(() => router.push("/"), 1000)
      return () => clearTimeout(timer)
    }
  }, [connected, isLoadingProfile, router])

  const handleSelectChicken = async (chickenId: string) => {
    setIsSettingActive(true)
    playSound("click")
    const success = await setActiveChicken(chickenId)
    if (success) {
      // You can add a success toast here
    } else {
      // You can add an error toast here
    }
    setIsSettingActive(false)
  }

  if (isLoadingProfile || !profile) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gray-900">
        <Loader2 className="h-16 w-16 animate-spin text-yellow-400"/>
        <p className="text-white ml-4">Loading Profile...</p>
      </div>
    )
  }

  return (
    <div className="h-screen w-screen overflow-hidden relative bg-gray-800 text-white flex flex-col">
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
      <header className="relative z-10 flex justify-between items-center p-4 bg-black/20 border-b border-white/10">
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
          <Button
            variant="outline"
            size="icon"
            className="w-10 h-10 rounded-md bg-[#444444] border-2 border-[#666666] hover:bg-[#555555]"
            onClick={() => {
              const currentlyEnabled = audioEnabled;
              setAudioEnabled(!currentlyEnabled);
              playSound("click");
            }}
          >
            {audioEnabled ? <Volume2 className="w-6 h-6" /> : <VolumeX className="w-6 h-6" />}
          </Button>
        </div>

        <h1 className="text-2xl md:text-3xl font-bold pixel-font text-center text-yellow-400 drop-shadow-[2px_2px_0px_#000000] animate-pulse">
          MY PROFILE
        </h1>

        <div>{!connected && <WalletMultiButton onClickSound={() => playSound("click")} />}</div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto">
          {/* User Info Header */}
          <div className="flex items-center gap-4 mb-8">
            <div className="w-20 h-20 rounded-full bg-gray-700 border-2 border-yellow-400">
              {/* Placeholder for avatar */}
            </div>
            <div>
              <h1 className="text-3xl font-bold pixel-font">{profile.username}</h1>
              <p className="text-gray-400 text-sm truncate">{profile.wallet_address}</p>
            </div>
          </div>
          
          <Tabs defaultValue="chickens">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="chickens">My Chickens</TabsTrigger>
              <TabsTrigger value="history">Battle History</TabsTrigger>
            </TabsList>
            <TabsContent value="chickens">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 mt-6">
                {chickens.map(chicken => (
                  <ChickenCard 
                    key={chicken.id} 
                    chicken={chicken} 
                    isActive={activeChicken?.id === chicken.id}
                    onSelect={handleSelectChicken}
                  />
                ))}
              </div>
            </TabsContent>
            <TabsContent value="history">
              {/* Battle history content will go here */}
              <p className="text-center py-12 text-gray-500">Battle history coming soon.</p>
            </TabsContent>
          </Tabs>
        </div>
      </main>

      {/* Game footer */}
      <footer className="relative z-10 p-2 bg-[#333333] border-t-4 border-[#222222] text-white text-center text-xs">
        <p>© {new Date().getFullYear()} Cock Combat • Powered by Solana</p>
      </footer>
    </div>
  )
}
