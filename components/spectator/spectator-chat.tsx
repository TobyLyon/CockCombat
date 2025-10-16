"use client"

import React, { useState, useEffect, useRef } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Send, Users } from "lucide-react"
import { formatDistanceToNow } from 'date-fns'
import { useSocket } from "@/hooks/use-socket"
import { useWallet } from "@/hooks/use-wallet"
import { supabase } from "@/lib/supabase"
import { useUsername } from "@/hooks/use-username"

interface ChatMessage {
  id: string
  user: {
    id?: string
    name: string
    address: string
    avatar?: string
  }
  message: string
  timestamp: Date | string
  isSpectator?: boolean
  isPrediction?: boolean
}

interface SpectatorChatProps {
  matchId?: string
  onNewMessage?: (message: string) => void
  onSendMessage?: (message: string) => void
  canSend?: boolean
}

export default function SpectatorChat({ matchId, onNewMessage, onSendMessage, canSend = true }: SpectatorChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [messageText, setMessageText] = useState("")
  const [spectatorCount, setSpectatorCount] = useState(0)
  const [countsByLobby, setCountsByLobby] = useState<Record<string, { humans: number; total: number }>>({})
  const scrollRef = useRef<HTMLDivElement>(null)
  const { socket, isConnected } = useSocket()
  const { publicKey } = useWallet()
  const walletAddr = (() => { try { return (publicKey as any)?.toBase58?.() || (publicKey as any)?.toString?.() || '' } catch { return '' } })()
  const displayName = useUsername(walletAddr || "")
  
  // Load existing messages from Supabase when matchId changes
  useEffect(() => {
    const loadHistory = async () => {
      try {
        if (!supabase || !matchId) return
        const { data, error } = await supabase
          .from('chat_messages')
          .select('*')
          .eq('match_id', matchId)
          .order('created_at', { ascending: true })
        if (!error && Array.isArray(data)) {
          const initial = data.map((row: any) => ({
            id: row.id || String(row.created_at),
            user: { id: row.user_id || row.wallet || '', name: row.username || (row.wallet ? `${row.wallet.slice(0,4)}...${row.wallet.slice(-4)}` : 'Anonymous'), address: row.wallet || '' },
            message: row.message,
            timestamp: row.created_at,
            isSpectator: true
          }))
          setMessages(initial)
        }
      } catch {}
    }
    setMessages([])
    loadHistory()
  }, [matchId])

  // Socket.IO event listeners for real-time chat
  useEffect(() => {
    if (!socket || !isConnected) return;
    
    // Join match as spectator
    socket.emit('spectate_match', { matchId });
    
    // Listen for chat messages
    const handleChatMessage = (msg: any) => {
      const chatMsg: ChatMessage = {
        id: msg.id || `${msg.user.id}-${Date.now()}`,
        user: msg.user,
        message: msg.message,
        timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
        isSpectator: msg.isSpectator,
        isPrediction: msg.isPrediction,
      };
      setMessages(prev => [...prev, chatMsg]);
      if (onNewMessage) onNewMessage(msg.message);
    };
    
    // Listen for global lobby/visitor counts and sum totals across all lobbies
    const handleLobbyCounts = (payload: any) => {
      try {
        const id = String(payload?.id || '')
        const humans = Number(payload?.liveHumans || 0)
        const total = Number(payload?.liveTotal || 0)
        if (!id) return
        setCountsByLobby(prev => {
          const next = { ...prev, [id]: { humans, total } }
          try {
            const sum = Object.values(next).reduce((acc, v) => acc + (Number(v?.total) || 0), 0)
            setSpectatorCount(sum)
          } catch {}
          return next
        })
      } catch {}
    }
    const handleSnapshot = (snap: any) => {
      try {
        const counts = snap?.counts || {}
        const next: Record<string, { humans: number; total: number }> = {}
        for (const k in counts) {
          const c = counts[k]
          next[k] = { humans: Number(c?.liveHumans||0), total: Number(c?.liveTotal||0) }
        }
        setCountsByLobby(next)
        try {
          const sum = Object.values(next).reduce((acc, v) => acc + (Number(v?.total) || 0), 0)
          setSpectatorCount(sum)
        } catch {}
      } catch {}
    }
    
    socket.on('chat_message', handleChatMessage);
    socket.on('lobby_counts', handleLobbyCounts)
    socket.on('lobby_counts_snapshot', handleSnapshot)
    // Ask server for a snapshot once when mounted
    try { socket.emit('get_lobby_counts') } catch {}
    
    return () => {
      socket.off('chat_message', handleChatMessage);
      socket.off('lobby_counts', handleLobbyCounts)
      socket.off('lobby_counts_snapshot', handleSnapshot)
      socket.emit('leave_spectate', { matchId });
    };
  }, [socket, isConnected, matchId, onNewMessage]);
  
  // Mock initial welcome message
  useEffect(() => {
    setMessages([])
  }, [])
  
  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [messages])
  
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!messageText.trim() || !socket || !matchId || !canSend) return
    
    // Get username from wallet or use fallback
    const username = (displayName && displayName.trim())
      ? displayName
      : (walletAddr ? `${walletAddr.slice(0, 4)}...${walletAddr.slice(-4)}` : 'Anonymous');
    
    // Send via Socket.IO
    socket.emit('spectator_chat', {
      matchId,
      message: messageText,
      username,
    });
    // Persist to Supabase for history
    try {
      if (supabase) {
        await supabase.from('chat_messages').insert({
          match_id: matchId,
          message: messageText,
          username,
          wallet: walletAddr || null,
          user_id: walletAddr || socket?.id || null
        })
      }
    } catch {}
    
    setMessageText("")
    
    if (onSendMessage) {
      onSendMessage(messageText)
    }
  }
  
  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-black/20 to-black/40">
      {/* Spectator Count Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-black/30 backdrop-blur-sm border-b border-yellow-500/20">
        <div className="flex items-center gap-1.5 text-[10px] text-yellow-300/80 font-semibold leading-none">
          <Users className="h-3.5 w-3.5" />
          <span className="truncate">{spectatorCount} {spectatorCount === 1 ? 'spectator' : 'spectators'}</span>
        </div>
        <Badge variant="outline" className="bg-green-600/30 text-green-300 border-green-500/40 text-[10px] leading-none pixel-font px-1.5 py-0.5 backdrop-blur-sm">
          LIVE
        </Badge>
      </div>

      <ScrollArea className="flex-1 p-3">
        <div className="flex flex-col gap-3">
          {messages.map((message) => (
            <div key={message.id} className="flex gap-2">
              <Avatar className="h-7 w-7 ring-2 ring-yellow-500/20">
                <AvatarImage src={message.user.avatar} />
                <AvatarFallback className="bg-yellow-900/40 text-yellow-300 text-[10px] font-bold">{message.user.name.substring(0, 2)}</AvatarFallback>
              </Avatar>
              
              <div className="flex flex-col flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-bold text-[11px] leading-none text-yellow-400 truncate max-w-[40%]">{message.user.name}</span>
                  <span className="text-[10px] text-gray-400 truncate max-w-[40%]">
                    {message.user.address}
                  </span>
                  <span className="text-[10px] text-gray-500 whitespace-nowrap">
                    {typeof message.timestamp === 'string' 
                      ? formatDistanceToNow(new Date(message.timestamp), { addSuffix: true })
                      : formatDistanceToNow(message.timestamp, { addSuffix: true })}
                  </span>
                  
                  {/* suppress system/prediction badges */}
                </div>
                
                <p className={`text-[12px] mt-0.5 text-white/90 break-words leading-snug`}>
                  {message.message}
                </p>
              </div>
            </div>
          ))}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>
      
      <form onSubmit={handleSendMessage} className="p-3 border-t-2 border-yellow-500/20 bg-black/40 backdrop-blur-md mt-auto">
        <div className="flex gap-2">
          <Input 
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            placeholder={!isConnected ? "Connecting..." : "Type a message..."}
            className="bg-black/50 backdrop-blur-sm border-yellow-500/30 text-white placeholder:text-gray-500 focus:border-yellow-500/60 transition-all"
            disabled={!isConnected || !canSend}
          />
          <Button 
            type="submit" 
            size="icon" 
            disabled={!messageText.trim() || !isConnected || !canSend}
            className="bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-black border-2 border-yellow-600/50 shadow-lg disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        {!isConnected && (
          <p className="text-xs text-yellow-300/60 mt-2 pixel-font">⏳ Connecting to chat...</p>
        )}
      </form>
    </div>
  )
} 