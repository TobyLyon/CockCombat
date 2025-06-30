"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useWallet } from "@/hooks/use-wallet"
import Image from "next/image"

export default function SpectatorArea() {
  const { connected } = useWallet()
  const [activeMatches, setActiveMatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedMatch, setSelectedMatch] = useState(null)
  const [betAmount, setBetAmount] = useState("5")
  const [selectedFighter, setSelectedFighter] = useState(null)
  const [bettingStatus, setBettingStatus] = useState("ready") // ready, placing, confirmed

  // Simulate fetching active matches
  useEffect(() => {
    if (connected) {
      setTimeout(() => {
        setActiveMatches([
          {
            id: "match-1",
            status: "active",
            timeRemaining: 95,
            fighters: [
              { id: "fighter-1", name: "Feather Fury", odds: 1.5, image: "/placeholder.svg?height=100&width=100" },
              { id: "fighter-2", name: "Beak Breaker", odds: 2.7, image: "/placeholder.svg?height=100&width=100" },
            ],
            totalBets: 120,
            poolSize: 350,
          },
          {
            id: "match-2",
            status: "starting",
            timeRemaining: 180,
            fighters: [
              { id: "fighter-3", name: "Talon Terror", odds: 2.1, image: "/placeholder.svg?height=100&width=100" },
              { id: "fighter-4", name: "Wing Warrior", odds: 1.8, image: "/placeholder.svg?height=100&width=100" },
            ],
            totalBets: 45,
            poolSize: 120,
          },
          {
            id: "match-3",
            status: "active",
            timeRemaining: 65,
            fighters: [
              { id: "fighter-5", name: "Cluck Norris", odds: 1.3, image: "/placeholder.svg?height=100&width=100" },
              { id: "fighter-6", name: "Hen Solo", odds: 3.2, image: "/placeholder.svg?height=100&width=100" },
            ],
            totalBets: 200,
            poolSize: 580,
          },
        ])
        setLoading(false)
      }, 1500)
    }
  }, [connected])

  const placeBet = () => {
    if (!selectedFighter || !betAmount) return

    setBettingStatus("placing")

    // Simulate transaction
    setTimeout(() => {
      setBettingStatus("confirmed")

      // Reset after showing confirmation
      setTimeout(() => {
        setBettingStatus("ready")
        setSelectedFighter(null)
        setBetAmount("5")
      }, 3000)
    }, 2000)
  }

  if (!connected) {
    return (
      <div className="text-center py-10">
        <p className="text-xl mb-4">Please connect your wallet to access the spectator area.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="text-center py-10">
        <p>Loading active matches...</p>
      </div>
    )
  }

  return (
    <div className="bg-purple-900/30 rounded-xl p-6 border border-purple-700/50">
      <h2 className="text-2xl font-bold mb-6">Spectator Arena</h2>

      <Tabs defaultValue="matches" className="mb-6">
        <TabsList className="bg-purple-800/50 border border-purple-700">
          <TabsTrigger value="matches" className="data-[state=active]:bg-purple-700">
            Active Matches
          </TabsTrigger>
          <TabsTrigger value="mybets" className="data-[state=active]:bg-purple-700">
            My Bets
          </TabsTrigger>
        </TabsList>

        <TabsContent value="matches" className="pt-4">
          {selectedMatch ? (
            <div>
              <Button
                variant="outline"
                className="mb-4 border-purple-700 bg-purple-800/30"
                onClick={() => setSelectedMatch(null)}
              >
                Back to Matches
              </Button>

              <div className="bg-purple-800/30 rounded-lg p-6 border border-purple-700/50">
                <div className="flex flex-col md:flex-row items-center justify-between mb-6">
                  <div className="text-center md:text-left mb-4 md:mb-0">
                    <h3 className="text-xl font-bold">Live Match</h3>
                    <p className="text-sm text-purple-300">
                      Time Remaining: {Math.floor(selectedMatch.timeRemaining / 60)}:
                      {(selectedMatch.timeRemaining % 60).toString().padStart(2, "0")}
                    </p>
                  </div>

                  <div className="flex items-center space-x-2">
                    <div className="text-sm text-purple-300">Total Bets: {selectedMatch.totalBets}</div>
                    <div className="text-sm text-yellow-400">Pool: {selectedMatch.poolSize} $CLUCK</div>
                  </div>
                </div>

                <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-8">
                  {selectedMatch.fighters.map((fighter) => (
                    <div
                      key={fighter.id}
                      className={`flex-1 bg-purple-900/50 rounded-lg p-4 border-2 transition-all ${
                        selectedFighter === fighter.id
                          ? "border-yellow-400 shadow-glow-sm"
                          : "border-purple-700 hover:border-purple-500"
                      } cursor-pointer`}
                      onClick={() => setSelectedFighter(fighter.id)}
                    >
                      <div className="flex items-center space-x-4">
                        <div className="relative w-16 h-16 bg-purple-800/50 rounded">
                          <Image
                            src={fighter.image || "/placeholder.svg"}
                            alt={fighter.name}
                            fill
                            className="object-contain p-2"
                          />
                        </div>
                        <div>
                          <h4 className="font-bold">{fighter.name}</h4>
                          <p className="text-sm text-purple-300">Odds: {fighter.odds}x</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="bg-purple-900/50 rounded-lg p-4 border border-purple-700/50">
                  <h4 className="font-bold mb-4">Place Your Bet</h4>

                  <div className="flex flex-col md:flex-row gap-4 items-end">
                    <div className="flex-1">
                      <label className="text-sm text-purple-300 mb-2 block">Bet Amount ($CLUCK)</label>
                      <Input
                        type="number"
                        min="1"
                        value={betAmount}
                        onChange={(e) => setBetAmount(e.target.value)}
                        className="bg-purple-800/30 border-purple-700 text-purple-100"
                      />
                    </div>

                    <div className="flex-1">
                      <label className="text-sm text-purple-300 mb-2 block">Potential Winnings</label>
                      <div className="bg-purple-800/30 border border-purple-700 rounded-md p-2 text-yellow-400 font-bold">
                        {selectedFighter
                          ? (
                              Number.parseFloat(betAmount) *
                              selectedMatch.fighters.find((f) => f.id === selectedFighter).odds
                            ).toFixed(2)
                          : "0.00"}{" "}
                        $CLUCK
                      </div>
                    </div>

                    <Button
                      onClick={placeBet}
                      disabled={!selectedFighter || bettingStatus !== "ready"}
                      className="bg-yellow-600 hover:bg-yellow-700 text-white"
                    >
                      {bettingStatus === "placing"
                        ? "Placing Bet..."
                        : bettingStatus === "confirmed"
                          ? "Bet Confirmed!"
                          : "Place Bet"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {activeMatches.map((match) => (
                <div
                  key={match.id}
                  className="bg-purple-800/30 rounded-lg p-4 border border-purple-700/50 hover:border-purple-500 cursor-pointer transition-all"
                  onClick={() => setSelectedMatch(match)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div
                        className={`w-2 h-2 rounded-full ${match.status === "active" ? "bg-green-500" : "bg-yellow-500"}`}
                      ></div>
                      <span className="text-sm text-purple-300">
                        {match.status === "active" ? "Live" : "Starting Soon"}
                      </span>
                    </div>
                    <div className="text-sm text-purple-300">
                      {Math.floor(match.timeRemaining / 60)}:{(match.timeRemaining % 60).toString().padStart(2, "0")}{" "}
                      remaining
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-4">
                    <div className="flex items-center space-x-2">
                      <div className="relative w-10 h-10 bg-purple-900/50 rounded">
                        <Image
                          src={match.fighters[0].image || "/placeholder.svg"}
                          alt={match.fighters[0].name}
                          fill
                          className="object-contain p-1"
                        />
                      </div>
                      <span className="font-bold">{match.fighters[0].name}</span>
                    </div>

                    <div className="text-sm font-bold">VS</div>

                    <div className="flex items-center space-x-2">
                      <span className="font-bold">{match.fighters[1].name}</span>
                      <div className="relative w-10 h-10 bg-purple-900/50 rounded">
                        <Image
                          src={match.fighters[1].image || "/placeholder.svg"}
                          alt={match.fighters[1].name}
                          fill
                          className="object-contain p-1"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between mt-4 text-sm">
                    <div className="text-purple-300">Total Bets: {match.totalBets}</div>
                    <div className="text-yellow-400">Pool: {match.poolSize} $CLUCK</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="mybets" className="pt-4">
          <div className="bg-purple-800/30 rounded-lg p-6 text-center border border-purple-700/50">
            <h3 className="text-xl font-bold mb-4">Your Active Bets</h3>
            <p className="mb-6 text-purple-300">You don't have any active bets at the moment.</p>
            <Button>Place a Bet</Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
