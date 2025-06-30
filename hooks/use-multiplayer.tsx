"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useWallet } from "@/hooks/use-wallet"
import socketService from "@/lib/socket-service"

export function useMultiplayer() {
  const { connected, publicKey } = useWallet()
  const [connectionStatus, setConnectionStatus] = useState("disconnected")
  const [inQueue, setInQueue] = useState(false)
  const [inBattle, setInBattle] = useState(false)
  const [opponent, setOpponent] = useState(null)
  const [gameState, setGameState] = useState(null)
  const [roomId, setRoomId] = useState(null)
  const [isPlayer1, setIsPlayer1] = useState(false)
  const [battleResult, setBattleResult] = useState(null)
  const [error, setError] = useState(null)
  const [queueTime, setQueueTime] = useState(0)
  const queueTimerRef = useRef(null)
  const socketInitialized = useRef(false)
  const socketRef = useRef(null)

  // Initialize socket connection
  useEffect(() => {
    if (!connected || socketInitialized.current) return

    // Initialize Socket.io connection
    const initSocket = async () => {
      try {
        setConnectionStatus("connecting")

        // First, initialize the socket server
        await fetch("/api/socketio")

        // Then connect to it
        const socket = await socketService.connect()
        socketRef.current = socket

        setConnectionStatus("connected")
        setError(null)
        socketInitialized.current = true

        // Set up event listeners
        socket.on("match_found", (data) => {
          console.log("Match found:", data)
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

        socket.on("action_result", (result) => {
          console.log("Action result:", result)

          // Update game state based on action result
          setGameState((prevState) => {
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
          console.log("Opponent disconnected")
          setBattleResult({
            winner: socket.id,
            isWinner: true,
            byDisconnect: true,
          })
          setInBattle(false)

          // Update game state
          setGameState((prevState) => {
            if (!prevState) return prevState
            return {
              ...prevState,
              battleStatus: "ended",
            }
          })
        })

        socket.on("disconnect", () => {
          console.log("Socket disconnected")
          setConnectionStatus("disconnected")
          resetGameState()
        })

        socket.on("connect_error", (err) => {
          console.error("Socket connection error:", err)
          setConnectionStatus("error")
          setError("Failed to connect to game server")
        })
      } catch (err) {
        console.error("Socket initialization error:", err)
        setConnectionStatus("error")
        setError("Failed to initialize game server")
      }
    }

    initSocket()
  }, [connected, isPlayer1])

  // Join matchmaking queue
  const joinQueue = useCallback(
    (chickenData) => {
      if (!connected || !socketRef.current) {
        setError("Not connected to game server")
        return
      }

      // Prepare player data
      const playerData = {
        name: `Player_${publicKey.slice(0, 6)}`,
        chicken: chickenData,
        walletAddress: publicKey,
      }

      // Join queue
      socketRef.current.emit("join_queue", playerData)
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
    [connected, publicKey],
  )

  // Leave matchmaking queue
  const leaveQueue = useCallback(() => {
    if (!socketRef.current || !inQueue) return

    socketRef.current.emit("leave_queue")
    setInQueue(false)

    // Clear queue timer
    if (queueTimerRef.current) {
      clearInterval(queueTimerRef.current)
      queueTimerRef.current = null
    }
  }, [inQueue])

  // Send battle action
  const sendAction = useCallback(
    (action, targetPosition = null) => {
      if (!socketRef.current || !inBattle || !roomId) {
        console.error("Cannot send action: not in battle or no room ID")
        return
      }

      socketRef.current.emit("battle_action", {
        roomId,
        action,
        targetPosition,
      })
    },
    [inBattle, roomId],
  )

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

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (queueTimerRef.current) {
        clearInterval(queueTimerRef.current)
      }

      socketService.disconnect()
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
