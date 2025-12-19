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

  const paidUnlockAtMs = (() => {
    try {
      const raw = String(process.env.NEXT_PUBLIC_PAID_LOBBIES_UNLOCK_AT || '').trim()
      const ms = Number(raw)
      if (!raw || !isFinite(ms) || ms <= 0) return null
      return ms
    } catch { return null }
  })()
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])
  const formatCountdown = (msRemaining: number) => {
    try {
      const total = Math.max(0, Math.floor(msRemaining / 1000))
      const s = total % 60
      const m = Math.floor(total / 60) % 60
      const h = Math.floor(total / 3600) % 24
      const d = Math.floor(total / 86400)
      const pad = (n: number) => String(n).padStart(2, '0')
      if (d > 0) return `${d}d ${pad(h)}:${pad(m)}:${pad(s)}`
      return `${pad(h)}:${pad(m)}:${pad(s)}`
    } catch {
      return ''
    }
  }

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
                      const isPaid = Number((lobby as any)?.amount || 0) > 0
                      const lockedByTime = Boolean(isPaid && paidUnlockAtMs && nowMs < paidUnlockAtMs)
                      const disabled = Boolean(lobby.isComingSoon || lockedByTime)
                      const countdown = lockedByTime && paidUnlockAtMs ? formatCountdown(paidUnlockAtMs - nowMs) : null
                      return (
                    <Button
                      key={lobby.id}
                      onClick={() => handleJoinLobby(lobby.id)}
                      disabled={disabled}
                      className="w-full justify-between"
                    >
                      <span>Join {lobby.amount} {lobby.currency} Lobby</span>
                      {disabled && <span className="text-xs opacity-70">{countdown ? `Unlocks in ${countdown}` : 'Coming Soon'}</span>}
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
