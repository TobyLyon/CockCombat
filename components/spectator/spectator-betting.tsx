"use client"

import React, { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { 
  CircularProgressbarWithChildren, 
  buildStyles 
} from "react-circular-progressbar"
import "react-circular-progressbar/dist/styles.css"
import { Coins, ArrowRight, Trophy, Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useWallet } from "@/hooks/use-wallet"
import { WalletMultiButton } from "@/components/wallet/wallet-multi-button"

interface Chicken {
  id: string
  name: string
  color: string
  health: number
  maxHealth: number
  odds: number
  betAmount: number
  totalBets: number
}

interface SpectatorBettingProps {
  matchId?: string
  onPlaceBet?: (chickenId: string, amount: number) => void
  gameState?: any
  matchResult?: any
}

export default function SpectatorBetting({ matchId, onPlaceBet, gameState, matchResult }: SpectatorBettingProps) {
  const { connected } = useWallet()
  const [selectedChicken, setSelectedChicken] = useState<string | null>(null)
  const [betAmount, setBetAmount] = useState(50)
  const [userBalance, setUserBalance] = useState(1000)
  const [isLoading, setIsLoading] = useState(false)
  const bettingOpen = gameState?.battleStatus !== 'ended' && gameState?.battleStatus !== 'active'
  const [recentBets, setRecentBets] = useState<{
    user: string;
    chickenId: string;
    amount: number;
    timestamp: Date;
  }[]>([])
  
  const [chickens, setChickens] = useState<Chicken[]>([
    {
      id: "chicken-1",
      name: "Red Destroyer",
      color: "#EF4444",
      health: 75,
      maxHealth: 100,
      odds: 2.5,
      betAmount: 0,
      totalBets: 750
    },
    {
      id: "chicken-2",
      name: "Blue Thunder",
      color: "#3B82F6",
      health: 100,
      maxHealth: 100,
      odds: 1.8,
      betAmount: 0,
      totalBets: 1200
    },
    {
      id: "chicken-3",
      name: "Yellow Flash",
      color: "#EAB308",
      health: 65,
      maxHealth: 100,
      odds: 3.2,
      betAmount: 0,
      totalBets: 500
    },
    {
      id: "chicken-4",
      name: "Green Machine",
      color: "#22C55E",
      health: 90,
      maxHealth: 100,
      odds: 2.1,
      betAmount: 0,
      totalBets: 900
    }
  ])
  
  useEffect(() => {
    const initialBets = [
      {
        user: "CryptoChicken",
        chickenId: "chicken-1",
        amount: 200,
        timestamp: new Date(Date.now() - 1000 * 60 * 5)
      },
      {
        user: "EggLayer",
        chickenId: "chicken-2",
        amount: 350,
        timestamp: new Date(Date.now() - 1000 * 60 * 4)
      },
      {
        user: "FeatherFriend",
        chickenId: "chicken-3",
        amount: 150,
        timestamp: new Date(Date.now() - 1000 * 60 * 3)
      },
      {
        user: "CluckMaster",
        chickenId: "chicken-4",
        amount: 250,
        timestamp: new Date(Date.now() - 1000 * 60 * 2)
      },
      {
        user: "RoosterRuler",
        chickenId: "chicken-2",
        amount: 500,
        timestamp: new Date(Date.now() - 1000 * 60 * 1)
      }
    ]
    
    setRecentBets(initialBets)
  }, [])
  
  const handlePlaceBet = () => {
    if (!connected || !selectedChicken || betAmount <= 0 || betAmount > userBalance || !bettingOpen) return
    
    setIsLoading(true)
    
    setTimeout(() => {
      setUserBalance(prev => prev - betAmount)
      
      setChickens(prev => 
        prev.map(chicken => 
          chicken.id === selectedChicken 
            ? { ...chicken, betAmount: chicken.betAmount + betAmount, totalBets: chicken.totalBets + betAmount }
            : chicken
        )
      )
      
      setRecentBets(prev => [
        {
          user: "You", 
          chickenId: selectedChicken, 
          amount: betAmount,
          timestamp: new Date()
        },
        ...prev
      ])
      
      if (onPlaceBet) {
        onPlaceBet(selectedChicken, betAmount)
      }
      
      setIsLoading(false)
      setSelectedChicken(null)
      setBetAmount(50)
    }, 1500)
  }
  
  const formatTimeAgo = (date: Date) => {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000)
    
    let interval = seconds / 31536000
    if (interval > 1) return Math.floor(interval) + "y ago"
    
    interval = seconds / 2592000
    if (interval > 1) return Math.floor(interval) + "mo ago"
    
    interval = seconds / 86400
    if (interval > 1) return Math.floor(interval) + "d ago"
    
    interval = seconds / 3600
    if (interval > 1) return Math.floor(interval) + "h ago"
    
    interval = seconds / 60
    if (interval > 1) return Math.floor(interval) + "m ago"
    
    return Math.floor(seconds) + "s ago"
  }
  
  const getChickenById = (id: string) => chickens.find(chicken => chicken.id === id)
  
  return (
    <div className="flex flex-col h-full">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-gray-950 rounded-md mb-4">
        <div className="flex flex-col gap-4">
          <div className="text-sm text-gray-400">
            {bettingOpen ? (
              <div className="flex items-center">
                <Badge className="bg-green-700 text-green-100">
                  Betting Open
                </Badge>
                <span className="ml-2">Place your bets!</span>
              </div>
            ) : (
              <div className="flex items-center">
                <Badge className="bg-red-700 text-red-100">
                  Betting Closed
                </Badge>
                <span className="ml-2">Battle in progress or ended.</span>
              </div>
            )}
          </div>
          
          {connected ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Coins className="h-5 w-5 text-yellow-500" />
                <span className="font-medium">Your Balance:</span>
                <span className="font-bold text-yellow-500">{userBalance} $COCK</span>
              </div>
              
              {!bettingOpen && (
                <div className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-yellow-500" />
                  <span className="font-medium">Total Prize Pool:</span>
                  <span className="font-bold text-yellow-500">
                    {chickens.reduce((acc, chicken) => acc + chicken.totalBets, 0)} tokens
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 text-center p-4 bg-gray-800 rounded-md">
              <p className="text-sm text-gray-400">Connect your wallet to place bets.</p>
              <WalletMultiButton className="!bg-primary hover:!bg-primary/90 !h-9 !rounded-md !px-3"/>
            </div>
          )}
        </div>
        
        {selectedChicken && bettingOpen && (
          <div className="flex flex-col gap-2">
            <div className="font-medium text-sm">Bet Amount: {betAmount} $COCK</div>
            <Slider 
              value={[betAmount]} 
              max={userBalance}
              min={1}
              step={1}
              onValueChange={(values) => setBetAmount(values[0])}
              className="my-2"
              disabled={isLoading || !bettingOpen}
            />
            <div className="flex justify-between text-xs text-gray-400">
              <span>Min: 1</span>
              <span>Max: {userBalance}</span>
            </div>
            <Button 
              onClick={handlePlaceBet} 
              className="w-full mt-2"
              disabled={isLoading || !selectedChicken || betAmount <= 0 || betAmount > userBalance || !bettingOpen}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                `Bet ${betAmount} on ${chickens.find(c=>c.id === selectedChicken)?.name || 'Chicken'}`
              )}
            </Button>
          </div>
        )}
      </div>
      
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 px-4">
        {chickens.map((chicken) => (
          <Card 
            key={chicken.id}
            className={`group border-2 cursor-pointer transition-all ${selectedChicken === chicken.id ? 'border-primary' : 'border-gray-800'} bg-gray-950`}
            onClick={() => bettingOpen && setSelectedChicken(chicken.id)}
          >
            <CardContent className="p-3">
              <div className="w-16 h-16 mx-auto my-2">
                <CircularProgressbarWithChildren 
                  value={chicken.health} 
                  maxValue={chicken.maxHealth}
                  styles={buildStyles({
                    pathColor: chicken.color,
                    trailColor: 'rgba(255,255,255,0.1)'
                  })}
                >
                  <div className="h-10 w-10 rounded-full" style={{ backgroundColor: chicken.color }} />
                </CircularProgressbarWithChildren>
              </div>
              
              <div className="text-center mt-2">
                <h4 className="font-bold">{chicken.name}</h4>
                <div className="text-xs text-gray-400 mt-1">
                  HP: {chicken.health}/{chicken.maxHealth}
                </div>
                
                <div className="mt-2 flex justify-between text-xs">
                  <div>
                    <div className="text-gray-400">Odds</div>
                    <div className="font-bold">{chicken.odds.toFixed(1)}x</div>
                  </div>
                  <div>
                    <div className="text-gray-400">Total Bets</div>
                    <div className="font-bold">{chicken.totalBets}</div>
                  </div>
                </div>
                
                {chicken.betAmount > 0 && (
                  <Badge className="w-full mt-2 justify-center bg-primary/20 text-primary border-primary/50">
                    Your bet: {chicken.betAmount} $COCK
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      
      <div className="mt-4 flex-1 px-4">
        <h3 className="font-bold mb-2">Recent Bets</h3>
        <ScrollArea className="h-[200px] rounded-md border border-gray-800 bg-gray-950 p-2">
          <div className="space-y-2">
            {recentBets.map((bet, index) => {
              const chicken = getChickenById(bet.chickenId)
              return (
                <div 
                  key={index} 
                  className="flex items-center justify-between p-2 bg-gray-900 rounded-md"
                >
                  <div className="flex items-center gap-2">
                    <Avatar className="h-6 w-6">
                      <AvatarFallback style={{ backgroundColor: chicken?.color || "#888" }}>
                        {bet.user.substring(0, 1)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="font-medium text-sm">{bet.user}</span>
                    <ArrowRight className="h-3 w-3 text-gray-500" />
                    <div className="flex items-center">
                      <div 
                        className="h-3 w-3 rounded-full mr-1" 
                        style={{ backgroundColor: chicken?.color }}
                      ></div>
                      <span className="text-xs">{chicken?.name}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-yellow-500">{bet.amount} $COCK</span>
                    <span className="text-xs text-gray-400">
                      {formatTimeAgo(bet.timestamp)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
} 