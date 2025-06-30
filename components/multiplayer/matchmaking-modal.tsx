"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useMultiplayer } from "@/hooks/use-multiplayer"
import { useProfile } from "@/contexts/ProfileContext"
import { useWallet } from "@/hooks/use-wallet"
import { Loader2, Gamepad2 } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Lobby } from "@/app/api/lobbies/route"
import { useToast } from "@/components/ui/use-toast"
import { sendAndConfirmTransaction, Transaction } from "@solana/web3.js"

export default function MatchmakingModal({ isOpen, onClose, selectedChicken, onMatchFound }) {
  const { connectionStatus, inQueue, inBattle, opponent, gameState, joinQueue, leaveQueue, error: multiplayerError } =
    useMultiplayer()
  const { updateWagerAmount } = useProfile()
  const [lobbies, setLobbies] = useState<Lobby[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [joinedLobby, setJoinedLobby] = useState<Lobby | null>(null)
  const [isWaitingForMatch, setIsWaitingForMatch] = useState(false)
  const { publicKey, signTransaction } = useWallet()
  const { toast } = useToast()

  // Poll for lobby status when waiting for a match to start
  useEffect(() => {
    if (!isWaitingForMatch || !joinedLobby) return

    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch('/api/lobbies')
        const updatedLobbies = await res.json()
        const updatedLobby = updatedLobbies.find(l => l.id === joinedLobby.id)
        
        if (updatedLobby && updatedLobby.status === 'starting') {
          console.log('Match is starting!', updatedLobby)
          setIsWaitingForMatch(false)
          
          // Create a mock game state for now
          const mockGameState = {
            players: updatedLobby.players,
            status: 'starting',
            lobbyId: updatedLobby.id
          }
          
          onMatchFound(mockGameState, updatedLobby.players.find(p => p.playerId !== publicKey?.toBase58()))
          onClose()
        }
      } catch (err) {
        console.error('Error polling lobby status:', err)
      }
    }, 2000) // Poll every 2 seconds

    return () => clearInterval(pollInterval)
  }, [isWaitingForMatch, joinedLobby, onMatchFound, onClose, publicKey])

  // Handle match found from multiplayer hook (for socket-based matches)
  useEffect(() => {
    if (inBattle && gameState && opponent) {
      onMatchFound(gameState, opponent)
      onClose()
    }
  }, [inBattle, gameState, opponent, onMatchFound, onClose])

  // Handle connection errors from multiplayer hook
  useEffect(() => {
    if (multiplayerError) {
      setError(multiplayerError)
    }
  }, [multiplayerError])

  // Fetch lobbies when modal opens
  useEffect(() => {
    if (isOpen) {
      setIsLoading(true)
      fetch('/api/lobbies')
        .then(res => res.json())
        .then(data => {
          setLobbies(data)
          setIsLoading(false)
        })
        .catch(err => {
          console.error(err)
          setError("Failed to fetch lobbies.")
          setIsLoading(false)
        })
    }
  }, [isOpen])

  // Main handler for joining any lobby
  const handleJoinLobby = async (lobby: Lobby) => {
    console.log('Attempting to join lobby:', lobby) // Debug log
    
    // Different requirements for different match types
    if (lobby.matchType === 'ranked') {
      if (!selectedChicken || !publicKey) {
        setError("Please select a chicken and connect your wallet first.")
        return
      }
    } else {
      if (!selectedChicken) {
        setError("Please select a chicken first.")
        return
      }
    }
    
    setIsLoading(true)
    setError(null)

    try {
      // WAGER MATCH LOGIC
      if (lobby.matchType === 'ranked') {
        console.log('Processing ranked match...') // Debug log
        // Step 1: Get unsigned transaction from our server
        const wagerRes = await fetch('/api/wager', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lobbyId: lobby.id,
            playerPublicKey: publicKey!.toBase58(), // Fixed parameter name
          }),
        })

        if (!wagerRes.ok) {
          const { error } = await wagerRes.json()
          throw new Error(error || "Failed to create wager transaction.")
        }

        const { transaction: base64Transaction } = await wagerRes.json()
        
        // Step 2: Sign transaction on the client
        const transaction = Transaction.from(Buffer.from(base64Transaction, 'base64'))

        if (!signTransaction) {
            throw new Error("Wallet does not support signing transactions.")
        }
        const signedTransaction = await signTransaction(transaction)

        // Step 3: Join the lobby by sending the signed tx
        const joinRes = await fetch('/api/lobbies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lobbyId: lobby.id,
            chickenId: selectedChicken.id,
            signedTransaction: signedTransaction.serialize().toString('base64'),
          }),
        });

        if (!joinRes.ok) {
          const { error } = await joinRes.json()
          throw new Error(error || "Failed to join lobby.")
        }
        
        const updatedLobby = await joinRes.json()
        setJoinedLobby(updatedLobby)
        setIsWaitingForMatch(true)
        toast({ title: "Wager Confirmed!", description: "You have successfully joined the lobby." })

      } 
      // TUTORIAL MATCH LOGIC
      else if (lobby.matchType === 'tutorial') {
        console.log('Processing tutorial match...') // Debug log
        const joinRes = await fetch('/api/lobbies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            lobbyId: lobby.id, 
            chickenId: selectedChicken.id 
          }),
        });

        if (!joinRes.ok) {
          const { error } = await joinRes.json()
          throw new Error(error || "Failed to join tutorial lobby.")
        }
        
        const updatedLobby = await joinRes.json()
        console.log('Tutorial lobby joined successfully:', updatedLobby) // Debug log
        setJoinedLobby(updatedLobby)
        setIsWaitingForMatch(true)
        toast({ title: "Joined Tutorial!", description: "Waiting for other players..." })
      } else {
        throw new Error(`Unknown match type: ${lobby.matchType}`)
      }
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An unknown error occurred."
      console.error("Failed to join lobby:", errorMessage)
      setError(errorMessage)
      toast({
        title: "Error Joining Lobby",
        description: errorMessage,
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    if (inQueue) leaveQueue()
    setError(null)
    setIsWaitingForMatch(false)
    setJoinedLobby(null)
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="bg-[#333333] border-[#666666] text-white max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isWaitingForMatch ? "Waiting for Match..." : "Join the Combat"}
          </DialogTitle>
        </DialogHeader>
        <div className="p-6">
          {isWaitingForMatch && joinedLobby ? (
            <div className="flex flex-col items-center space-y-4">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p className="text-center">
                Joined {joinedLobby.matchType === 'tutorial' ? 'tutorial' : 'wager'} lobby!
              </p>
              <p className="text-sm text-muted-foreground text-center">
                Players: {joinedLobby.players.length}/{joinedLobby.capacity}
              </p>
              <p className="text-xs text-muted-foreground text-center">
                {joinedLobby.matchType === 'tutorial' && joinedLobby.players.length === 1 
                  ? "AI players will join in 60 seconds if needed"
                  : "Waiting for more players..."
                }
              </p>
            </div>
          ) : (
            <Tabs defaultValue="tutorial">
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
                        onClick={() => handleJoinLobby(lobby)}
                        disabled={lobby.isComingSoon || isLoading}
                        className="w-full justify-between"
                      >
                        {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
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
                  {lobbies.filter(l => l.matchType === 'tutorial').map(lobby => (
              <Button
                      key={lobby.id}
                      onClick={() => handleJoinLobby(lobby)}
                      disabled={isLoading}
                      variant="secondary"
                    >
                      <Gamepad2 className="mr-2 h-4 w-4" /> Find Tutorial Match
                      {isLoading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              </Button>
                  ))}
            </div>
              </TabsContent>
            </Tabs>
          )}
          {error && <p className="text-red-500 text-sm mt-4">{error}</p>}
        </div>
      </DialogContent>
    </Dialog>
  )
}
