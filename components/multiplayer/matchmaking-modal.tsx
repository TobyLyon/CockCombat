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
import { Lobby } from "@/lib/lobbies"

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
      <DialogContent className="bg-[#333333] border-[#666666] text-white max-w-md w-[calc(100vw-1.5rem)] max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Join the Combat</DialogTitle>
        </DialogHeader>
        <div className="p-6">
          <Tabs defaultValue="wager">
            <TabsList className="grid w-full grid-cols-1">
              <TabsTrigger value="wager">Wager Match</TabsTrigger>
            </TabsList>
            <TabsContent value="wager">
              <div className="flex flex-col space-y-4">
                <p className="text-sm text-muted-foreground">
                  Compete against other players. Winner takes all.
                </p>
                <div className="space-y-2">
                  {lobbies.filter(l => l.matchType === 'ranked').map(lobby => (
                    (() => {
                      const disabled = Boolean((lobby as any).isComingSoon)
                      return (
                    <Button
                      key={lobby.id}
                      onClick={() => handleJoinLobby(lobby.id)}
                      disabled={disabled}
                      className="w-full justify-between"
                    >
                      <span>Join {lobby.amount} {lobby.currency} Lobby</span>
                      {disabled && <span className="text-xs opacity-70">Coming Soon</span>}
              </Button>
                      )
                    })())}
                  ))}
                </div>
              </div>
            </TabsContent>
            {/* Tutorial tab removed */}
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  )
}
