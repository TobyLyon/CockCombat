"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { useMultiplayer } from "@/hooks/use-multiplayer"
import { useProfile } from "@/contexts/ProfileContext"
import { Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Gamepad2 } from "lucide-react"
import { Lobby } from "@/app/api/lobbies/route"

export default function MatchmakingModal({ isOpen, onClose, selectedChicken, onMatchFound }) {
  const { connectionStatus, inQueue, inBattle, opponent, gameState, queueTime, joinQueue, leaveQueue, error } =
    useMultiplayer()
  const { currentWagerAmount, updateWagerAmount } = useProfile()
  const [lobbies, setLobbies] = useState<Lobby[]>([])

  const [localError, setLocalError] = useState(null)
  const [wagerAmount, setWagerAmount] = useState(currentWagerAmount)

  // Format queue time
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  // Join queue when modal opens
  useEffect(() => {
    if (isOpen && selectedChicken && connectionStatus === "connected" && !inQueue && !inBattle) {
      joinQueue({
        ...selectedChicken,
        wagerAmount // Include wager amount in queue join
      })
    }
  }, [isOpen, selectedChicken, connectionStatus, inQueue, inBattle, joinQueue, wagerAmount])

  // Handle match found
  useEffect(() => {
    if (inBattle && gameState && opponent) {
      // Update the global wager amount
      updateWagerAmount(wagerAmount)
      onMatchFound(gameState, opponent)
      onClose()
    }
  }, [inBattle, gameState, opponent, onMatchFound, onClose, updateWagerAmount, wagerAmount])

  // Handle connection errors
  useEffect(() => {
    if (error) {
      setLocalError(error)
    }
  }, [error])

  // Handle wager amount change
  const handleWagerChange = (e) => {
    const value = parseInt(e.target.value)
    if (!isNaN(value) && value > 0) {
      setWagerAmount(value)
    }
  }

  // Handle modal close
  const handleClose = () => {
    if (inQueue) {
      leaveQueue()
    }
    onClose()
  }

  // Handle queue join with wager
  const handleJoinQueue = () => {
    if (selectedChicken) {
      joinQueue({
        ...selectedChicken,
        wagerAmount
      })
    }
  }

  useEffect(() => {
    if (isOpen) {
      fetch('/api/lobbies')
        .then(res => res.json())
        .then(data => setLobbies(data))
        .catch(console.error)
    }
  }, [isOpen])

  const handleJoinLobby = (lobbyId: string) => {
    // Here you would also handle wager confirmation if needed
    joinQueue(lobbyId)
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="bg-[#333333] border-[#666666] text-white max-w-md">
        <DialogHeader>
          <DialogTitle>Join the Combat</DialogTitle>
        </DialogHeader>
        <div className="p-6">
          <Tabs defaultValue="wager">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="wager">Wager Match</TabsTrigger>
              <TabsTrigger value="tutorial">Tutorial</TabsTrigger>
            </TabsList>
            <TabsContent value="wager">
              <div className="flex flex-col space-y-4">
                <p className="text-sm text-muted-foreground">
                  Compete against other players. Winner takes all.
                </p>
                <div className="space-y-2">
                  {lobbies.filter(l => l.matchType === 'ranked').map(lobby => (
                    <Button
                      key={lobby.id}
                      onClick={() => handleJoinLobby(lobby.id)}
                      disabled={lobby.isComingSoon}
                      className="w-full justify-between"
                    >
                      <span>Join {lobby.amount} {lobby.currency} Lobby</span>
                      {lobby.isComingSoon && <span className="text-xs opacity-70">Coming Soon</span>}
              </Button>
                  ))}
                </div>
              </div>
            </TabsContent>
            <TabsContent value="tutorial">
              <div className="flex flex-col space-y-4">
                <p className="text-sm text-muted-foreground">
                  A free-for-all match. If not enough players join, AI will fill the empty spots. No wagers, just fun.
                </p>
                <Button onClick={() => handleJoinLobby('tutorial-match')} variant="secondary">
                  <Gamepad2 className="mr-2 h-4 w-4" /> Find Tutorial Match
              </Button>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  )
}
