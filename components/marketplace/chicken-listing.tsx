"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import Image from "next/image"
import { useWallet } from "@/hooks/use-wallet"

export default function ChickenListing({ listing }) {
  const { connected } = useWallet()
  const [purchasing, setPurchasing] = useState(false)
  const [purchased, setPurchased] = useState(false)

  const handlePurchase = () => {
    setPurchasing(true)
    // Simulate purchase transaction
    setTimeout(() => {
      setPurchasing(false)
      setPurchased(true)
    }, 2000)
  }

  const getRarityColor = (rarity) => {
    switch (rarity) {
      case "Common":
        return "text-gray-300"
      case "Uncommon":
        return "text-green-400"
      case "Rare":
        return "text-blue-400"
      case "Epic":
        return "text-purple-400"
      case "Legendary":
        return "text-yellow-400"
      default:
        return "text-gray-300"
    }
  }

  return (
    <Card className="bg-purple-800/50 border-purple-700 hover:border-purple-500 transition-all hover:shadow-glow overflow-hidden">
      <CardContent className="p-0">
        <div className="relative aspect-square bg-purple-900/50">
          <Image src={listing.image || "/placeholder.svg"} alt={listing.name} fill className="object-contain p-4" />
          <div
            className={`absolute top-2 right-2 px-2 py-1 rounded text-xs font-bold ${getRarityColor(listing.rarity)} bg-black/50`}
          >
            {listing.rarity}
          </div>
        </div>

        <div className="p-4">
          <div className="flex justify-between items-start mb-2">
            <h3 className="text-lg font-bold">{listing.name}</h3>
            <div className="text-sm text-purple-300">Lvl {listing.level}</div>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-4">
            <StatDisplay label="STR" value={listing.stats.strength} />
            <StatDisplay label="SPD" value={listing.stats.speed} />
            <StatDisplay label="DEF" value={listing.stats.defense} />
          </div>

          <div className="flex justify-between items-center">
            <div className="font-bold text-lg text-yellow-400">{listing.price} $CLUCK</div>

            <Dialog>
              <DialogTrigger asChild>
                <Button size="sm" disabled={!connected || purchased}>
                  {purchased ? "Purchased" : "Buy"}
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-purple-900 border-purple-700 text-purple-100">
                <DialogHeader>
                  <DialogTitle>Purchase Fighter</DialogTitle>
                  <DialogDescription className="text-purple-300">
                    You are about to purchase {listing.name} for {listing.price} $CLUCK
                  </DialogDescription>
                </DialogHeader>

                <div className="flex items-center space-x-4 py-4">
                  <div className="relative w-20 h-20 bg-purple-800/50 rounded">
                    <Image
                      src={listing.image || "/placeholder.svg"}
                      alt={listing.name}
                      fill
                      className="object-contain p-2"
                    />
                  </div>
                  <div>
                    <h4 className="font-bold">{listing.name}</h4>
                    <p className="text-sm text-purple-300">
                      Level {listing.level} • {listing.rarity}
                    </p>
                    <p className="text-sm text-purple-300">Seller: {listing.seller}</p>
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" className="border-purple-700">
                    Cancel
                  </Button>
                  <Button
                    onClick={handlePurchase}
                    disabled={purchasing}
                    className="bg-yellow-600 hover:bg-yellow-700 text-white"
                  >
                    {purchasing ? "Processing..." : "Confirm Purchase"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function StatDisplay({ label, value }) {
  return (
    <div className="bg-purple-900/70 rounded p-1 text-center">
      <div className="text-xs text-purple-300">{label}</div>
      <div className="font-bold">{value}</div>
    </div>
  )
}
