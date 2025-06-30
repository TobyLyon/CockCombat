"use client"

import React, { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import SpectatorChat from "@/components/spectator/spectator-chat"
import SpectatorBetting from "@/components/spectator/spectator-betting"
import { MessageCircle, Coins } from "lucide-react"

interface SpectatorViewProps {
  matchId?: string
  gameState?: any
  matchResult?: any
  onSendMessage?: (message: string) => void
  onPlaceBet?: (chickenId: string, amount: number) => void
}

export default function SpectatorView({ 
  matchId, 
  gameState,
  matchResult,
  onSendMessage, 
  onPlaceBet 
}: SpectatorViewProps) {
  const [activeTab, setActiveTab] = useState("chat")
  
  const handleTabChange = (value: string) => {
    setActiveTab(value)
  }
  
  return (
    <div className="h-full bg-black/50 backdrop-blur-sm rounded-lg overflow-hidden border border-gray-800">
      <Tabs 
        defaultValue="chat" 
        value={activeTab} 
        onValueChange={handleTabChange}
        className="h-full flex flex-col"
      >
        <div className="border-b border-gray-800 p-2">
          <TabsList className="grid grid-cols-2 w-full bg-gray-900">
            <TabsTrigger value="chat" className="data-[state=active]:bg-primary">
              <MessageCircle className="h-4 w-4 mr-2" />
              Chat
            </TabsTrigger>
            <TabsTrigger value="betting" className="data-[state=active]:bg-primary">
              <Coins className="h-4 w-4 mr-2" />
              Betting
            </TabsTrigger>
          </TabsList>
        </div>
        
        <div className="flex-1 overflow-hidden">
          <TabsContent value="chat" className="h-full m-0 p-0">
            <SpectatorChat matchId={matchId} onSendMessage={onSendMessage} />
          </TabsContent>
          
          <TabsContent value="betting" className="h-full m-0 p-0">
            <SpectatorBetting 
              matchId={matchId} 
              gameState={gameState}
              matchResult={matchResult}
              onPlaceBet={onPlaceBet} 
            />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
} 