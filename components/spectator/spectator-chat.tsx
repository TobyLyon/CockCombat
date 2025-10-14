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
  const scrollRef = useRef<HTMLDivElement>(null)
  const { socket, isConnected } = useSocket()
  const { publicKey } = useWallet()
  
  // Socket.IO event listeners for real-time chat
  useEffect(() => {
    if (!socket || !isConnected || !matchId) return;
    
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
    
    // Listen for spectator count updates
    const handleSpectatorJoined = (data: any) => {
      setSpectatorCount(data.spectatorCount);
    };
    
    const handleSpectatorLeft = (data: any) => {
      setSpectatorCount(data.spectatorCount);
    };
    
    // Listen for match metadata
    const handleMatchMetadata = (data: any) => {
      setSpectatorCount(data.spectatorCount);
    };
    
    socket.on('chat_message', handleChatMessage);
    socket.on('spectator_joined', handleSpectatorJoined);
    socket.on('spectator_left', handleSpectatorLeft);
    socket.on('match_metadata', handleMatchMetadata);
    
    return () => {
      socket.off('chat_message', handleChatMessage);
      socket.off('spectator_joined', handleSpectatorJoined);
      socket.off('spectator_left', handleSpectatorLeft);
      socket.off('match_metadata', handleMatchMetadata);
      socket.emit('leave_spectate', { matchId });
    };
  }, [socket, isConnected, matchId, onNewMessage]);
  
  // Mock initial welcome message
  useEffect(() => {
    const initialMessages: ChatMessage[] = [
      {
        id: "1",
        user: { name: "CryptoChicken", address: "0x1a2...3b4c", avatar: "/images/avatars/avatar-1.png" },
        message: "Anyone else betting on the red chicken?",
        timestamp: new Date(Date.now() - 1000 * 60 * 5),
        isSpectator: true
      },
      {
        id: "2",
        user: { name: "BlockchainRooster", address: "0x5d6...7e8f", avatar: "/images/avatars/avatar-2.png" },
        message: "Blue chicken is the real deal!",
        timestamp: new Date(Date.now() - 1000 * 60 * 3),
        isSpectator: true
      },
      {
        id: "3",
        user: { name: "System", address: "0x000", avatar: "/images/avatars/system.png" },
        message: "Red chicken has attacked Blue chicken for 25 damage!",
        timestamp: new Date(Date.now() - 1000 * 60 * 2),
        isPrediction: true
      },
      {
        id: "4",
        user: { name: "EggMaster", address: "0x9a0...1b2c", avatar: "/images/avatars/avatar-3.png" },
        message: "This match is insane, already put 500 tokens on yellow!",
        timestamp: new Date(Date.now() - 1000 * 60 * 1),
        isSpectator: true
      },
      {
        id: "5",
        user: { name: "System", address: "0x000", avatar: "/images/avatars/system.png" },
        message: "Blue chicken is down to 50% health!",
        timestamp: new Date(Date.now() - 1000 * 30),
        isPrediction: true
      }
    ]
    
    setMessages(initialMessages)
  }, [])
  
  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [messages])
  
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault()
    if (!messageText.trim() || !socket || !matchId || !canSend) return
    
    // Get username from wallet or use fallback
    const username = publicKey ? `${publicKey.toString().slice(0, 4)}...${publicKey.toString().slice(-4)}` : 'Anonymous';
    
    // Send via Socket.IO
    socket.emit('spectator_chat', {
      matchId,
      message: messageText,
      username,
    });
    
    setMessageText("")
    
    if (onSendMessage) {
      onSendMessage(messageText)
    }
  }
  
  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-black/20 to-black/40">
      {/* Spectator Count Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-black/30 backdrop-blur-sm border-b border-yellow-500/20">
        <div className="flex items-center gap-2 text-xs text-yellow-300/80 font-semibold">
          <Users className="h-4 w-4" />
          <span>{spectatorCount} {spectatorCount === 1 ? 'spectator' : 'spectators'}</span>
        </div>
        <Badge variant="outline" className="bg-green-600/30 text-green-300 border-green-500/40 text-xs pixel-font backdrop-blur-sm">
          LIVE
        </Badge>
      </div>

      <ScrollArea className="flex-1 p-3">
        <div className="flex flex-col gap-3">
          {messages.map((message) => (
            <div key={message.id} className="flex gap-2">
              <Avatar className="h-8 w-8 ring-2 ring-yellow-500/20">
                <AvatarImage src={message.user.avatar} />
                <AvatarFallback className="bg-yellow-900/40 text-yellow-300 text-xs font-bold">{message.user.name.substring(0, 2)}</AvatarFallback>
              </Avatar>
              
              <div className="flex flex-col flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-sm text-yellow-400">{message.user.name}</span>
                  <span className="text-xs text-gray-400 truncate">
                    {message.user.address}
                  </span>
                  <span className="text-xs text-gray-500">
                    {typeof message.timestamp === 'string' 
                      ? formatDistanceToNow(new Date(message.timestamp), { addSuffix: true })
                      : formatDistanceToNow(message.timestamp, { addSuffix: true })}
                  </span>
                  
                  {message.isPrediction && (
                    <Badge variant="outline" className="bg-yellow-900/40 text-yellow-300 border-yellow-600/40 text-xs pixel-font">
                      🎯 Update
                    </Badge>
                  )}
                </div>
                
                <p className={`text-sm mt-1 ${message.isPrediction ? "text-yellow-300 font-semibold" : "text-white/90"} break-words`}>
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
            placeholder={!isConnected ? "Connecting..." : (canSend ? "Type a message..." : "Connect X to chat")}
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
        {isConnected && !canSend && (
          <p className="text-xs text-yellow-300/80 mt-2 pixel-font">🔒 Connect X to send messages</p>
        )}
      </form>
    </div>
  )
} 