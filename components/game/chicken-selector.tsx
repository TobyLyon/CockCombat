"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useWallet } from "@/hooks/use-wallet"
import Image from "next/image"

export default function ChickenSelector({ onSelect }) {
  const { connected, publicKey } = useWallet()
  const [userChickens, setUserChickens] = useState([])
  const [loading, setLoading] = useState(true)

  // Simulate fetching user's chickens from wallet/account
  useEffect(() => {
    if (connected) {
      // This would be replaced with actual blockchain data fetching
      setTimeout(() => {
        setUserChickens([
          {
            id: "chicken-1",
            name: "Feather Fury",
            level: 3,
            wins: 7,
            losses: 2,
            image: "/placeholder.svg?height=200&width=200",
            stats: {
              strength: 8,
              speed: 7,
              defense: 5,
            },
          },
          {
            id: "chicken-2",
            name: "Beak Breaker",
            level: 5,
            wins: 12,
            losses: 3,
            image: "/placeholder.svg?height=200&width=200",
            stats: {
              strength: 9,
              speed: 6,
              defense: 7,
            },
          },
          {
            id: "chicken-3",
            name: "Talon Terror",
            level: 2,
            wins: 3,
            losses: 1,
            image: "/placeholder.svg?height=200&width=200",
            stats: {
              strength: 6,
              speed: 9,
              defense: 4,
            },
          },
        ])
        setLoading(false)
      }, 1000)
    }
  }, [connected])

  if (loading) {
    return (
      <div className="text-center py-10">
        <p>Loading your fighters...</p>
      </div>
    )
  }

  if (userChickens.length === 0) {
    return (
      <div className="text-center py-10">
        <p className="mb-4">You don't have any fighters yet.</p>
        <Button>Visit Marketplace</Button>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {userChickens.map((chicken) => (
        <Card
          key={chicken.id}
          className="bg-purple-800/50 border-purple-700 hover:border-purple-500 cursor-pointer transition-all hover:shadow-glow"
          onClick={() => onSelect(chicken)}
        >
          <CardContent className="p-4">
            <div className="aspect-square relative mb-4 bg-purple-900/50 rounded-lg overflow-hidden">
              <Image src={chicken.image || "/placeholder.svg"} alt={chicken.name} fill className="object-contain p-4" />
            </div>
            <h3 className="text-xl font-bold mb-2">{chicken.name}</h3>
            <div className="text-sm text-purple-300 mb-4">Level {chicken.level}</div>

            <div className="grid grid-cols-3 gap-2 mb-4">
              <StatDisplay label="STR" value={chicken.stats.strength} />
              <StatDisplay label="SPD" value={chicken.stats.speed} />
              <StatDisplay label="DEF" value={chicken.stats.defense} />
            </div>

            <div className="flex justify-between text-sm">
              <span className="text-green-400">{chicken.wins} Wins</span>
              <span className="text-red-400">{chicken.losses} Losses</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
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
