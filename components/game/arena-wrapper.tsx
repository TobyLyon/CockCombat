"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import ChickenRoyale from "@/components/chicken-royale"
import ChickenSelector from "@/components/game/chicken-selector"
import { useWallet } from "@/hooks/use-wallet"

export default function Arena() {
  const { connected } = useWallet()
  const [selectedChicken, setSelectedChicken] = useState(null)
  const [gameActive, setGameActive] = useState(false)

  if (!connected) {
    return (
      <div className="text-center py-10">
        <p className="text-xl mb-4">Please connect your wallet to enter the arena.</p>
      </div>
    )
  }

  if (!selectedChicken && !gameActive) {
    return (
      <div className="bg-purple-900/30 rounded-xl p-6 border border-purple-700/50">
        <h2 className="text-2xl font-bold mb-6 text-center">Select Your Fighter</h2>
        <ChickenSelector onSelect={(chicken) => setSelectedChicken(chicken)} />
      </div>
    )
  }

  if (selectedChicken && !gameActive) {
    return (
      <div className="bg-purple-900/30 rounded-xl p-6 border border-purple-700/50 text-center">
        <h2 className="text-2xl font-bold mb-4">Ready to Fight?</h2>
        <p className="mb-6">
          You selected: <span className="font-bold">{selectedChicken.name}</span>
        </p>
        <div className="flex justify-center gap-4">
          <Button onClick={() => setGameActive(true)} className="bg-red-600 hover:bg-red-700 text-white">
            Enter Arena
          </Button>
          <Button
            variant="outline"
            onClick={() => setSelectedChicken(null)}
            className="border-purple-600 text-purple-200"
          >
            Change Fighter
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-[80vh] relative">
      <ChickenRoyale />
      <Button
        className="absolute top-4 right-4 bg-red-600 hover:bg-red-700 text-white"
        onClick={() => {
          setGameActive(false)
          setSelectedChicken(null)
        }}
      >
        Exit Arena
      </Button>
    </div>
  )
}
