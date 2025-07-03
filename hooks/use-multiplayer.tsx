"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useWallet } from "@/hooks/use-wallet"
import { useSocket } from "@/hooks/use-socket"

export function useMultiplayer() {
  const { connected, publicKey } = useWallet()
  const { socket, isConnected } = useSocket()
  const [connectionStatus, setConnectionStatus] = useState("disconnected")
  const [inQueue, setInQueue] = useState(false)
  const [inBattle, setInBattle] = useState(false)
  const [opponent, setOpponent] = useState(null)
  const [gameState, setGameState] = useState<any>(null)
  const [roomId, setRoomId] = useState<string | null>(null)
  const [isPlayer1, setIsPlayer1] = useState(false)
  const [battleResult, setBattleResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [queueTime, setQueueTime] = useState(0)
  const queueTimerRef = useRef<NodeJS.Timeout | null>(null)
  const socketInitialized = useRef(false)

  // Reset game state
  const resetGameState = useCallback(() => {
    setInQueue(false)
    setInBattle(false)
    setOpponent(null)
    setGameState(null)
    setRoomId(null)
    setIsPlayer1(false)
    setBattleResult(null)

    // Clear queue timer
    if (queueTimerRef.current) {
      clearInterval(queueTimerRef.current)
      queueTimerRef.current = null
    }
  }, [])

  // Update connection status based on socket state
  useEffect(() => {
    if (isConnected) {
      setConnectionStatus("connected")
      setError(null)
    } else {
      setConnectionStatus("disconnected")
      resetGameState()
    }
  }, [isConnected, resetGameState])

  // Initialize socket event listeners
  useEffect(() => {
    if (!connected || !socket || !isConnected || socketInitialized.current) return

    console.log("🎮 Setting up multiplayer event listeners...")
    
    try {
      socketInitialized.current = true

      // Set up event listeners
      socket.on("match_found", (data: any) => {
        console.log("🎯 Match found:", data)
        setInQueue(false)
        setInBattle(true)
        setOpponent(data.opponent)
        setGameState(data.gameState)
        setRoomId(data.roomId)
        setIsPlayer1(data.isPlayer1)
        setBattleResult(null)

        // Clear queue timer
        if (queueTimerRef.current) {
          clearInterval(queueTimerRef.current)
          queueTimerRef.current = null
        }
      })

      socket.on("action_result", (result: any) => {
        console.log("⚔️ Action result:", result)

        // Update game state based on action result
        setGameState((prevState: any) => {
          if (!prevState) return prevState

          const newState = { ...prevState }

          // Update player states
          if (result.newPlayerState) {
            if (isPlayer1) {
              newState.player1 = result.newPlayerState
            } else {
              newState.player2 = result.newPlayerState
            }
          }

          if (result.newOpponentState) {
            if (isPlayer1) {
              newState.player2 = result.newOpponentState
            } else {
              newState.player1 = result.newOpponentState
            }
          }

          // Check if battle is over
          if (result.battleOver) {
            newState.battleStatus = "ended"
            setBattleResult({
              winner: result.winner,
              isWinner: result.winner === socket.id,
            })
            setInBattle(false)
          }

          return newState
        })
      })

      socket.on("opponent_disconnected", () => {
        console.log("🔌 Opponent disconnected")
        setBattleResult({
          winner: socket.id,
          isWinner: true,
          byDisconnect: true,
        })
        setInBattle(false)

        // Update game state
        setGameState((prevState: any) => {
          if (!prevState) return prevState
          return {
            ...prevState,
            battleStatus: "ended",
          }
        })
      })

      console.log("✅ Multiplayer event listeners ready")

    } catch (err) {
      console.error("❌ Socket initialization error:", err)
      setConnectionStatus("error")
      setError("Failed to initialize multiplayer")
    }

    // Cleanup function
    return () => {
      if (socket) {
        socket.off("match_found")
        socket.off("action_result")
        socket.off("opponent_disconnected")
      }
    }
  }, [connected, socket, isConnected, isPlayer1])

  // Join matchmaking queue
  const joinQueue = useCallback(
    (chickenData: any) => {
      if (!connected || !socket || !publicKey) {
        setError("Not connected to game server")
        return
      }

      console.log("🎯 Joining matchmaking queue...")

      // Prepare player data
      const playerData = {
        name: `Player_${publicKey.toString().slice(0, 6)}`,
        chicken: chickenData,
        walletAddress: publicKey.toString(),
      }

      // Join queue
      socket.emit("join_queue", playerData)
      setInQueue(true)
      setQueueTime(0)

      // Start queue timer
      if (queueTimerRef.current) {
        clearInterval(queueTimerRef.current)
      }

      queueTimerRef.current = setInterval(() => {
        setQueueTime((prev) => prev + 1)
      }, 1000)
    },
    [connected, socket, publicKey],
  )

  // Leave matchmaking queue
  const leaveQueue = useCallback(() => {
    if (!socket || !inQueue) return

    console.log("❌ Leaving matchmaking queue...")
    socket.emit("leave_queue")
    setInQueue(false)

    // Clear queue timer
    if (queueTimerRef.current) {
      clearInterval(queueTimerRef.current)
      queueTimerRef.current = null
    }
  }, [socket, inQueue])

  // Send battle action
  const sendAction = useCallback(
    (action: any, targetPosition: any = null) => {
      if (!socket || !inBattle || !roomId) {
        console.error("Cannot send action: not in battle or no room ID")
        return
      }

      console.log("⚔️ Sending battle action:", action)
      socket.emit("battle_action", {
        roomId,
        action,
        targetPosition,
      })
    },
    [socket, inBattle, roomId],
  )

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (queueTimerRef.current) {
        clearInterval(queueTimerRef.current)
      }

      // Socket cleanup is handled by the SocketProvider
      socketInitialized.current = false
    }
  }, [])

  return {
    connectionStatus,
    inQueue,
    inBattle,
    opponent,
    gameState,
    roomId,
    isPlayer1,
    battleResult,
    error,
    queueTime,
    joinQueue,
    leaveQueue,
    sendAction,
    resetGameState,
  }
}
