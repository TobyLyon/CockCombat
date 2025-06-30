"use client"

import React, { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import SpectatorChat from "./spectator-chat"
import SpectatorBetting from "./spectator-betting"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { ChevronUpIcon, ChevronDownIcon, DollarSignIcon, MessageSquareIcon } from "lucide-react"

interface SpectatorPanelProps {
  matchId?: string
  expanded?: boolean
  className?: string
}

export default function SpectatorPanel({ 
  matchId, 
  expanded: initialExpanded = true,
  className = ""
}: SpectatorPanelProps) {
  const [expanded, setExpanded] = useState(initialExpanded)
  const [activeTab, setActiveTab] = useState("betting")
  const [unreadMessages, setUnreadMessages] = useState(0)

  const handleNewMessage = () => {
    if (activeTab !== "chat") {
      setUnreadMessages(prev => prev + 1)
    }
  }

  const handleTabChange = (value: string) => {
    setActiveTab(value)
    if (value === "chat") {
      setUnreadMessages(0)
    }
  }
  
  return (
    <Card className={`border border-gray-800 bg-gray-950/90 rounded-t-lg ${className}`}>
      <div 
        className="flex items-center justify-between px-4 py-2 border-b border-gray-800 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm">Spectator Zone</h3>
          <Badge variant="outline" className="text-xs">LIVE</Badge>
        </div>
        <button 
          className="p-1 hover:bg-gray-800 rounded-full transition-colors"
          aria-label={expanded ? "Collapse panel" : "Expand panel"}
        >
          {expanded ? 
            <ChevronDownIcon className="h-4 w-4" /> : 
            <ChevronUpIcon className="h-4 w-4" />
          }
        </button>
      </div>
      
      {expanded && (
        <div className="h-[400px] flex flex-col">
          <Tabs 
            defaultValue="betting" 
            value={activeTab} 
            onValueChange={handleTabChange}
            className="flex flex-col h-full"
          >
            <TabsList className="grid w-full grid-cols-2 bg-gray-900 rounded-none border-b border-gray-800">
              <TabsTrigger value="betting" className="relative flex gap-2 items-center">
                <DollarSignIcon className="h-4 w-4" />
                <span>Betting</span>
              </TabsTrigger>
              <TabsTrigger value="chat" className="relative flex gap-2 items-center">
                <MessageSquareIcon className="h-4 w-4" />
                <span>Chat</span>
                {unreadMessages > 0 && (
                  <Badge 
                    variant="default" 
                    className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs"
                  >
                    {unreadMessages}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="betting" className="flex-1 p-0 m-0 overflow-hidden">
              <SpectatorBetting matchId={matchId} />
            </TabsContent>
            
            <TabsContent value="chat" className="flex-1 p-0 m-0 overflow-hidden">
              <SpectatorChat 
                matchId={matchId} 
                onNewMessage={handleNewMessage} 
              />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </Card>
  )
} 