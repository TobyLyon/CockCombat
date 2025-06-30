"use client"

import React, { useState, useEffect, useRef } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Send } from "lucide-react"
import { formatDistanceToNow } from 'date-fns'

interface ChatMessage {
  id: string
  user: {
    name: string
    address: string
    avatar?: string
  }
  message: string
  timestamp: Date
  isSpectator?: boolean
  isPrediction?: boolean
}

interface SpectatorChatProps {
  matchId?: string
  onNewMessage?: (message: string) => void
}

export default function SpectatorChat({ matchId, onNewMessage }: SpectatorChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [messageText, setMessageText] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)
  
  // Mock initial messages
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
    
    if (!messageText.trim()) return
    
    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      user: {
        name: "You",
        address: "0xYou...r123",
        avatar: "/images/avatars/you.png"
      },
      message: messageText,
      timestamp: new Date(),
      isSpectator: true
    }
    
    setMessages(prev => [...prev, newMessage])
    setMessageText("")
    
    if (onNewMessage) {
      onNewMessage(messageText)
    }
  }
  
  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1 p-3">
        <div className="flex flex-col gap-3">
          {messages.map((message) => (
            <div key={message.id} className="flex gap-2">
              <Avatar className="h-8 w-8">
                <AvatarImage src={message.user.avatar} />
                <AvatarFallback>{message.user.name.substring(0, 2)}</AvatarFallback>
              </Avatar>
              
              <div className="flex flex-col flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{message.user.name}</span>
                  <span className="text-xs text-gray-500 truncate">
                    {message.user.address}
                  </span>
                  <span className="text-xs text-gray-500">
                    {formatDistanceToNow(message.timestamp, { addSuffix: true })}
                  </span>
                  
                  {message.isPrediction && (
                    <Badge variant="outline" className="bg-yellow-950/20 text-yellow-500 border-yellow-900">
                      Battle Update
                    </Badge>
                  )}
                </div>
                
                <p className={`text-sm mt-1 ${message.isPrediction ? "text-yellow-500" : ""}`}>
                  {message.message}
                </p>
              </div>
            </div>
          ))}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>
      
      <form onSubmit={handleSendMessage} className="p-3 border-t border-gray-800 bg-gray-900 mt-auto">
        <div className="flex gap-2">
          <Input 
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            placeholder="Type a message..."
            className="bg-gray-950 border-gray-800"
          />
          <Button type="submit" size="icon" disabled={!messageText.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  )
} 