"use client"

import { useState, useEffect } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useWallet } from "@/hooks/use-wallet"
import Image from "next/image"

export default function UserProfile() {
  const { connected, publicKey } = useWallet()
  const [userChickens, setUserChickens] = useState([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    totalFights: 0,
    wins: 0,
    losses: 0,
    cluckBalance: 0,
  })

  // Simulate fetching user data
  useEffect(() => {
    if (connected) {
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

        setStats({
          totalFights: 25,
          wins: 19,
          losses: 6,
          cluckBalance: 145,
        })

        setLoading(false)
      }, 1000)
    }
  }, [connected])

  if (!connected) {
    return (
      <div className="text-center py-10">
        <p className="text-xl mb-4">Please connect your wallet to view your profile.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="text-center py-10">
        <p>Loading your profile...</p>
      </div>
    )
  }

  return (
    <div className="bg-purple-900/30 rounded-xl p-6 border border-purple-700/50">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold">My Cock Collection</h2>
          <p className="text-sm text-purple-300">
            Wallet: {publicKey.slice(0, 6)}...{publicKey.slice(-4)}
          </p>
        </div>

        <div className="mt-4 md:mt-0 flex items-center space-x-4">
          <div className="bg-purple-800/50 px-4 py-2 rounded-lg border border-purple-700">
            <span className="text-yellow-400 font-bold">{stats.cluckBalance} $CLUCK</span>
          </div>
          <Button className="bg-yellow-600 hover:bg-yellow-700 text-white">Get More $CLUCK</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <StatCard title="Total Fighters" value={userChickens.length} />
        <StatCard title="Total Fights" value={stats.totalFights} />
        <StatCard title="Wins" value={stats.wins} />
        <StatCard title="Losses" value={stats.losses} />
      </div>

      <Tabs defaultValue="collection" className="mb-6">
        <TabsList className="bg-purple-800/50 border border-purple-700">
          <TabsTrigger value="collection" className="data-[state=active]:bg-purple-700">
            My Collection
          </TabsTrigger>
          <TabsTrigger value="history" className="data-[state=active]:bg-purple-700">
            Battle History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="collection" className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {userChickens.map((chicken) => (
              <Card
                key={chicken.id}
                className="bg-purple-800/50 border-purple-700 hover:border-purple-500 transition-all hover:shadow-glow"
              >
                <CardContent className="p-4">
                  <div className="aspect-square relative mb-4 bg-purple-900/50 rounded-lg overflow-hidden">
                    <Image
                      src={chicken.image || "/placeholder.svg"}
                      alt={chicken.name}
                      fill
                      className="object-contain p-4"
                    />
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
        </TabsContent>

        <TabsContent value="history" className="pt-4">
          <div className="bg-purple-800/30 rounded-lg divide-y divide-purple-700/50">
            <HistoryItem result="win" fighter="Feather Fury" opponent="Wing Warrior" reward={25} date="2 hours ago" />
            <HistoryItem result="loss" fighter="Beak Breaker" opponent="Cluck Norris" reward={0} date="5 hours ago" />
            <HistoryItem result="win" fighter="Talon Terror" opponent="Hen Solo" reward={15} date="Yesterday" />
            <HistoryItem result="win" fighter="Feather Fury" opponent="Mother Clucker" reward={30} date="2 days ago" />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function StatCard({ title, value }) {
  return (
    <div className="bg-purple-800/50 rounded-lg p-4 border border-purple-700">
      <div className="text-sm text-purple-300">{title}</div>
      <div className="text-2xl font-bold">{value}</div>
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

function HistoryItem({ result, fighter, opponent, reward, date }) {
  return (
    <div className="p-4 flex items-center justify-between">
      <div className="flex items-center space-x-3">
        <div className={`w-3 h-3 rounded-full ${result === "win" ? "bg-green-500" : "bg-red-500"}`}></div>
        <div>
          <div className="font-medium">
            {fighter} vs {opponent}
          </div>
          <div className="text-sm text-purple-300">{date}</div>
        </div>
      </div>
      <div className={result === "win" ? "text-yellow-400 font-bold" : "text-purple-300"}>
        {result === "win" ? `+${reward} $CLUCK` : "No reward"}
      </div>
    </div>
  )
}
