"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Search, Filter } from "lucide-react"
import ChickenListing from "@/components/marketplace/chicken-listing"

export default function Marketplace() {
  const [searchQuery, setSearchQuery] = useState("")
  const [activeTab, setActiveTab] = useState("buy")

  // Mock data for marketplace listings
  const listings = [
    {
      id: "listing-1",
      name: "War Pecker",
      level: 7,
      price: 25,
      seller: "0x1a2b...3c4d",
      image: "/placeholder.svg?height=200&width=200",
      rarity: "Rare",
      stats: {
        strength: 9,
        speed: 8,
        defense: 7,
      },
    },
    {
      id: "listing-2",
      name: "Cluck Norris",
      level: 10,
      price: 50,
      seller: "0x5e6f...7g8h",
      image: "/placeholder.svg?height=200&width=200",
      rarity: "Epic",
      stats: {
        strength: 10,
        speed: 9,
        defense: 8,
      },
    },
    {
      id: "listing-3",
      name: "Hen Solo",
      level: 5,
      price: 15,
      seller: "0x9i0j...1k2l",
      image: "/placeholder.svg?height=200&width=200",
      rarity: "Common",
      stats: {
        strength: 7,
        speed: 8,
        defense: 6,
      },
    },
    {
      id: "listing-4",
      name: "Rooster Cogburn",
      level: 8,
      price: 35,
      seller: "0x3m4n...5o6p",
      image: "/placeholder.svg?height=200&width=200",
      rarity: "Rare",
      stats: {
        strength: 10,
        speed: 7,
        defense: 9,
      },
    },
    {
      id: "listing-5",
      name: "Yolko Ono",
      level: 6,
      price: 20,
      seller: "0x7q8r...9s0t",
      image: "/placeholder.svg?height=200&width=200",
      rarity: "Uncommon",
      stats: {
        strength: 6,
        speed: 10,
        defense: 7,
      },
    },
    {
      id: "listing-6",
      name: "Mother Clucker",
      level: 9,
      price: 40,
      seller: "0x1u2v...3w4x",
      image: "/placeholder.svg?height=200&width=200",
      rarity: "Epic",
      stats: {
        strength: 9,
        speed: 9,
        defense: 9,
      },
    },
  ]

  const filteredListings = listings.filter((listing) => listing.name.toLowerCase().includes(searchQuery.toLowerCase()))

  return (
    <div className="bg-purple-900/30 rounded-xl p-6 border border-purple-700/50">
      <h2 className="text-2xl font-bold mb-6">Marketplace</h2>

      <Tabs defaultValue="buy" className="mb-6">
        <TabsList className="bg-purple-800/50 border border-purple-700">
          <TabsTrigger value="buy" className="data-[state=active]:bg-purple-700" onClick={() => setActiveTab("buy")}>
            Buy Fighters
          </TabsTrigger>
          <TabsTrigger value="sell" className="data-[state=active]:bg-purple-700" onClick={() => setActiveTab("sell")}>
            Sell Fighters
          </TabsTrigger>
        </TabsList>

        <TabsContent value="buy" className="pt-4">
          <div className="flex gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-purple-400" />
              <Input
                placeholder="Search fighters..."
                className="pl-10 bg-purple-800/30 border-purple-700 text-purple-100"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Button variant="outline" className="border-purple-700 bg-purple-800/30">
              <Filter className="mr-2 h-4 w-4" />
              Filters
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredListings.map((listing) => (
              <ChickenListing key={listing.id} listing={listing} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="sell" className="pt-4">
          <div className="bg-purple-800/30 rounded-lg p-6 text-center border border-purple-700/50">
            <h3 className="text-xl font-bold mb-4">List Your Fighter</h3>
            <p className="mb-6 text-purple-300">Select a fighter from your collection to list on the marketplace.</p>
            <Button>Select Fighter to Sell</Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
