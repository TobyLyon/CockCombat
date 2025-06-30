"use client"

import { useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { WalletMultiButton } from "@/components/wallet/wallet-multi-button"
import { useWallet } from "@/hooks/use-wallet"
import { Button } from "@/components/ui/button"
import { Volume2, VolumeX, Home, Search, Filter } from "lucide-react"
import Link from "next/link"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import Image from "next/image"
import { useAudio } from "@/contexts/AudioContext"

// --- Define Prop Interfaces ---
interface MarketplaceItemStats {
  strength: number;
  speed: number;
  defense: number;
}

interface MarketplaceItemData {
  id: string;
  name: string;
  level: number;
  price: number;
  seller: string;
  image?: string;
  rarity: string;
  stats: MarketplaceItemStats;
}

interface MarketplaceItemProps {
  item: MarketplaceItemData;
  onBuy: (item: MarketplaceItemData) => void; // Specify function signature
}
// ------------------------------

// Marketplace Item Card Component
function MarketplaceItem({ item, onBuy }: MarketplaceItemProps) {
  return (
    <div className="bg-[#444444] border-2 border-[#666666] rounded-lg overflow-hidden hover:border-yellow-500 transition-all">
      <div className="aspect-square relative bg-[#333333]">
        <Image
          src={item.image || "/placeholder.svg?height=200&width=200"}
          alt={item.name}
          fill
          className="object-contain p-4"
        />
        <div className="absolute top-2 right-2 bg-black/70 text-xs font-bold px-2 py-1 rounded text-yellow-400">
          {item.rarity}
        </div>
      </div>
      <div className="p-4">
        <div className="flex justify-between items-start mb-2">
          <h3 className="font-bold text-white">{item.name}</h3>
          <div className="text-xs text-gray-300">Lvl {item.level}</div>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="bg-[#333333] p-1 rounded text-center">
            <div className="text-xs text-gray-400">STR</div>
            <div className="text-white font-bold">{item.stats.strength}</div>
          </div>
          <div className="bg-[#333333] p-1 rounded text-center">
            <div className="text-xs text-gray-400">SPD</div>
            <div className="text-white font-bold">{item.stats.speed}</div>
          </div>
          <div className="bg-[#333333] p-1 rounded text-center">
            <div className="text-xs text-gray-400">DEF</div>
            <div className="text-white font-bold">{item.stats.defense}</div>
          </div>
        </div>

        <div className="flex justify-between items-center">
          <div className="text-yellow-400 font-bold">{item.price} $CLUCK</div>
          <Button size="sm" className="bg-[#ff4500] hover:bg-[#ff6347] text-white" onClick={() => onBuy(item)}>
            Buy
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function MarketplacePage() {
  const router = useRouter()
  const { connected } = useWallet()
  const { audioEnabled, setAudioEnabled, playSound, playBackgroundMusic, volume } = useAudio()
  const audioRef = useRef<HTMLAudioElement>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [activeTab, setActiveTab] = useState("buy")

  // Mock marketplace data
  const marketplaceItems: MarketplaceItemData[] = [
    {
      id: "item-1",
      name: "War Pecker",
      level: 7,
      price: 25,
      seller: "0x1a2b...3c4d",
      image: "/placeholder.svg?height=200&width=200",
      rarity: "Rare",
      stats: { strength: 9, speed: 8, defense: 7 },
    },
    {
      id: "item-2",
      name: "Cluck Norris",
      level: 10,
      price: 50,
      seller: "0x5e6f...7g8h",
      image: "/placeholder.svg?height=200&width=200",
      rarity: "Epic",
      stats: { strength: 10, speed: 9, defense: 8 },
    },
    {
      id: "item-3",
      name: "Hen Solo",
      level: 5,
      price: 15,
      seller: "0x9i0j...1k2l",
      image: "/placeholder.svg?height=200&width=200",
      rarity: "Common",
      stats: { strength: 7, speed: 8, defense: 6 },
    },
    {
      id: "item-4",
      name: "Rooster Cogburn",
      level: 8,
      price: 35,
      seller: "0x3m4n...5o6p",
      image: "/placeholder.svg?height=200&width=200",
      rarity: "Rare",
      stats: { strength: 10, speed: 7, defense: 9 },
    },
    {
      id: "item-5",
      name: "Yolko Ono",
      level: 6,
      price: 20,
      seller: "0x7q8r...9s0t",
      image: "/placeholder.svg?height=200&width=200",
      rarity: "Uncommon",
      stats: { strength: 6, speed: 10, defense: 7 },
    },
    {
      id: "item-6",
      name: "Mother Clucker",
      level: 9,
      price: 40,
      seller: "0x1u2v...3w4x",
      image: "/placeholder.svg?height=200&width=200",
      rarity: "Epic",
      stats: { strength: 9, speed: 9, defense: 9 },
    },
  ]

  // Filtered items based on search
  const filteredItems = marketplaceItems.filter((item) => item.name.toLowerCase().includes(searchQuery.toLowerCase()))

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

  // Setup background music using AudioContext
  useEffect(() => {
    if (audioRef.current && audioEnabled) {
      playBackgroundMusic('/sounds/background.mp3', audioRef as React.RefObject<HTMLAudioElement>)
    } else if (audioRef.current && !audioEnabled) {
      audioRef.current.pause()
    }
  }, [audioEnabled, playBackgroundMusic])

  // Handle audio toggle using AudioContext
  const toggleAudio = () => {
    const currentlyEnabled = audioEnabled;
    setAudioEnabled(!currentlyEnabled);
    // playSound("click") // Optional: play click sound
  }

  // Play sound effect (uses context correctly via playSound)
  const handleSoundClick = (soundName: string) => {
    playSound(soundName)
  }

  // Handle buy action
  const handleBuy = (item: MarketplaceItemData) => {
    handleSoundClick("click")
    alert(`Purchased ${item.name} for ${item.price} $CLUCK!`)
    // Add logic to actually perform the purchase
  }

  return (
    <div className="h-screen w-screen overflow-hidden relative bg-[#3a8c4f] flex flex-col">
      {/* Background audio controlled by AudioContext */}
      <audio ref={audioRef} loop>
        <source src="/sounds/background.mp3" type="audio/mpeg" />
      </audio>

      {/* Pixel art background - marketplace themed */}
      <div className="absolute inset-0 z-0">
        {/* Sky */}
        <div className="absolute inset-0 bg-[#4b6584] h-1/2"></div>

        {/* Ground */}
        <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-[#7f8c8d]"></div>

        {/* Marketplace stalls */}
        <div className="absolute bottom-[30%] left-[10%] w-20 h-20 bg-[#e17055] rounded-t-lg"></div>
        <div className="absolute bottom-[30%] left-[10%] w-20 h-4 bg-[#d63031] -mt-4 rounded-t-lg"></div>

        <div className="absolute bottom-[25%] right-[15%] w-24 h-24 bg-[#74b9ff] rounded-t-lg"></div>
        <div className="absolute bottom-[25%] right-[15%] w-24 h-4 bg-[#0984e3] -mt-4 rounded-t-lg"></div>

        <div className="absolute bottom-[35%] left-[40%] w-28 h-28 bg-[#55efc4] rounded-t-lg"></div>
        <div className="absolute bottom-[35%] left-[40%] w-28 h-4 bg-[#00b894] -mt-4 rounded-t-lg"></div>
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
          MARKETPLACE
        </h1>

        <div>{!connected && <WalletMultiButton onClickSound={() => handleSoundClick("click")} />}</div>
      </header>

      {/* Main content */}
      <main className="relative z-10 flex-1 overflow-auto p-6">
        <div className="max-w-7xl mx-auto">
          <Tabs defaultValue="buy" className="mb-6">
            <TabsList className="bg-[#444444] border border-[#666666]">
              <TabsTrigger
                value="buy"
                className="data-[state=active]:bg-[#555555]"
                onClick={() => {
                  setActiveTab("buy")
                  handleSoundClick("tab")
                }}
              >
                Buy Fighters
              </TabsTrigger>
              <TabsTrigger
                value="sell"
                className="data-[state=active]:bg-[#555555]"
                onClick={() => {
                  setActiveTab("sell")
                  handleSoundClick("tab")
                }}
              >
                Sell Fighters
              </TabsTrigger>
            </TabsList>

            <TabsContent value="buy" className="pt-4">
              <div className="flex gap-4 mb-6">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <Input
                    placeholder="Search fighters..."
                    className="pl-10 bg-[#444444] border-[#666666] text-white"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <Button
                  variant="outline"
                  className="border-[#666666] bg-[#444444] text-white"
                  onClick={() => handleSoundClick("click")}
                >
                  <Filter className="mr-2 h-4 w-4" />
                  Filters
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredItems.map((item) => (
                  <MarketplaceItem key={item.id} item={item} onBuy={handleBuy} />
                ))}
              </div>
            </TabsContent>

            <TabsContent value="sell" className="pt-4">
              <div className="bg-[#444444] rounded-lg p-6 text-center border border-[#666666]">
                <h3 className="text-xl font-bold mb-4 text-yellow-400 pixel-font">List Your Fighter</h3>
                <p className="mb-6 text-gray-300">Select a fighter from your collection to list on the marketplace.</p>
                <Button
                  className="bg-[#ff4500] hover:bg-[#ff6347] text-white font-bold"
                  onClick={() => handleSoundClick("click")}
                >
                  Select Fighter to Sell
                </Button>
              </div>
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
