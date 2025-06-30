"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import PixelChickenViewer from "@/components/3d/pixel-chicken-viewer"
import { useRouter } from "next/navigation"
import { WalletMultiButton } from "@/components/wallet/wallet-multi-button"
import { useAudio } from "@/contexts/AudioContext"
import { useWallet } from "@solana/wallet-adapter-react"
import { useWalletAuth } from "@/hooks/use-wallet-auth"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export default function PixelGameInterface() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState("play") // play, about, controls
  const { audioEnabled, volume, playSound } = useAudio()
  const { connected } = useWallet()
  const { 
    authenticated, 
    loading: authLoading, 
    authenticate, 
    skipSigning, 
    disableSigning, 
    setDisableSigning 
  } = useWalletAuth()
  const [showLoginPrompt, setShowLoginPrompt] = useState(false)
  const [destinationAfterLogin, setDestinationAfterLogin] = useState("")

  // Play click sound on any left mouse click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (e.button === 0) playSound('click')
    }
    window.addEventListener('mousedown', handleClick)
    return () => window.removeEventListener('mousedown', handleClick)
  }, [audioEnabled, volume, playSound])

  // Navigation with wallet check
  const navigate = (path: string) => {
    if (connected && authenticated) {
      playSound("button")
      router.push(path)
    } else if (connected && !authenticated) {
      // Already connected but not authenticated
      playSound("button")
      setDestinationAfterLogin(path)
      setShowLoginPrompt(true)
    } else {
      // Not connected
      playSound("button")
      setDestinationAfterLogin(path)
      setShowLoginPrompt(true)
    }
  }

  // Handler for when wallet is connected
  useEffect(() => {
    if (connected && authenticated && destinationAfterLogin) {
      router.push(destinationAfterLogin)
      setDestinationAfterLogin("")
      setShowLoginPrompt(false)
    }
  }, [connected, authenticated, destinationAfterLogin, router])

  // Handle skipping the signing process
  const handleSkipSigning = () => {
    skipSigning();
    if (destinationAfterLogin) {
      router.push(destinationAfterLogin);
      setDestinationAfterLogin("");
      setShowLoginPrompt(false);
    }
  };

  return (
    <div className="h-screen w-screen overflow-hidden relative bg-[#3a8c4f] flex flex-col">
      {/* Pixel art background */}
      <div className="absolute inset-0 z-0">
        {/* Sky */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#87CEEB] to-[#ADD8E6] h-1/2"></div>

        {/* Grass */}
        <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-b from-[#4a9c5f] to-[#3a8c4f]"></div>

        {/* Sun */}
        <div className="absolute top-[5%] right-[8%] w-20 h-20 bg-yellow-300 rounded-full shadow-lg z-10 animate-pulse" style={{ animationDuration: '4s' }}></div>

        {/* Animated clouds (always visible, slower, more variety) */}
        <div className="absolute top-[10%] left-[2%] w-24 h-8 bg-white rounded-full animate-cloud-move" style={{ animationDuration: '70s' }}></div>
        <div className="absolute top-[15%] left-[18%] w-16 h-6 bg-white rounded-full animate-cloud-move" style={{ animationDuration: '80s', animationDelay: '10s' }}></div>
        <div className="absolute top-[8%] left-[35%] w-20 h-7 bg-white rounded-full animate-cloud-move" style={{ animationDuration: '65s', animationDelay: '20s' }}></div>
        <div className="absolute top-[12%] left-[55%] w-24 h-8 bg-white rounded-full animate-cloud-move" style={{ animationDuration: '75s', animationDelay: '25s' }}></div>
        <div className="absolute top-[18%] left-[70%] w-16 h-6 bg-white rounded-full animate-cloud-move" style={{ animationDuration: '60s', animationDelay: '40s' }}></div>
        <div className="absolute top-[22%] left-[50%] w-28 h-10 bg-white rounded-full opacity-80 animate-cloud-move" style={{ animationDuration: '68s', animationDelay: '35s' }}></div>
        <div className="absolute top-[25%] left-[80%] w-20 h-7 bg-white rounded-full opacity-70 animate-cloud-move" style={{ animationDuration: '77s', animationDelay: '55s' }}></div>
        <div className="absolute top-[28%] left-[60%] w-24 h-8 bg-white rounded-full opacity-60 animate-cloud-move" style={{ animationDuration: '72s', animationDelay: '60s' }}></div>
        {/* Pixel trees (grounded, varied, z-0) */}
        <div className="absolute bottom-[44%] left-[7%] w-16 h-24 flex flex-col items-center z-0">
          <div className="w-16 h-16 bg-[#2e7d32] rounded-md"></div>
          <div className="w-12 h-12 bg-[#2e7d32] rounded-md -mt-2"></div>
          <div className="w-8 h-8 bg-[#2e7d32] rounded-md -mt-2"></div>
          <div className="w-4 h-8 bg-[#8B4513] -mt-2"></div>
        </div>
        <div className="absolute bottom-[44%] left-[17%] w-10 h-16 flex flex-col items-center z-0">
          <div className="w-10 h-10 bg-[#388e3c] rounded-md"></div>
          <div className="w-6 h-6 bg-[#388e3c] rounded-md -mt-1"></div>
          <div className="w-3 h-6 bg-[#8B4513] -mt-1"></div>
        </div>
        <div className="absolute bottom-[44%] left-[26%] w-8 h-12 flex flex-col items-center z-0">
          <div className="w-8 h-8 bg-[#43a047] rounded-md"></div>
          <div className="w-2 h-4 bg-[#8B4513] -mt-1"></div>
        </div>
        <div className="absolute bottom-[44%] left-[38%] w-14 h-20 flex flex-col items-center z-0">
          <div className="w-14 h-14 bg-[#388e3c] rounded-md"></div>
          <div className="w-10 h-10 bg-[#388e3c] rounded-md -mt-1"></div>
          <div className="w-3 h-6 bg-[#8B4513] -mt-1"></div>
        </div>
        <div className="absolute bottom-[44%] right-[7%] w-16 h-24 flex flex-col items-center z-0">
          <div className="w-16 h-16 bg-[#2e7d32] rounded-md"></div>
          <div className="w-12 h-12 bg-[#2e7d32] rounded-md -mt-2"></div>
          <div className="w-8 h-8 bg-[#2e7d32] rounded-md -mt-2"></div>
          <div className="w-4 h-8 bg-[#8B4513] -mt-2"></div>
        </div>
        <div className="absolute bottom-[44%] right-[17%] w-10 h-16 flex flex-col items-center z-0">
          <div className="w-10 h-10 bg-[#388e3c] rounded-md"></div>
          <div className="w-6 h-6 bg-[#388e3c] rounded-md -mt-1"></div>
          <div className="w-3 h-6 bg-[#8B4513] -mt-1"></div>
        </div>
        <div className="absolute bottom-[44%] right-[26%] w-8 h-12 flex flex-col items-center z-0">
          <div className="w-8 h-8 bg-[#43a047] rounded-md"></div>
          <div className="w-2 h-4 bg-[#8B4513] -mt-1"></div>
        </div>
        <div className="absolute bottom-[44%] right-[38%] w-14 h-20 flex flex-col items-center z-0">
          <div className="w-14 h-14 bg-[#388e3c] rounded-md"></div>
          <div className="w-10 h-10 bg-[#388e3c] rounded-md -mt-1"></div>
          <div className="w-3 h-6 bg-[#8B4513] -mt-1"></div>
        </div>
        <div className="absolute bottom-[50%] left-[5%] w-16 h-24 flex flex-col items-center">
          <div className="w-16 h-16 bg-[#2e7d32] rounded-md"></div>
          <div className="w-12 h-12 bg-[#2e7d32] rounded-md -mt-2"></div>
          <div className="w-8 h-8 bg-[#2e7d32] rounded-md -mt-2"></div>
          <div className="w-4 h-8 bg-[#8B4513] -mt-2"></div>
        </div>

        <div className="absolute bottom-[50%] right-[5%] w-16 h-24 flex flex-col items-center">
          <div className="w-16 h-16 bg-[#2e7d32] rounded-md"></div>
          <div className="w-12 h-12 bg-[#2e7d32] rounded-md -mt-2"></div>
          <div className="w-8 h-8 bg-[#2e7d32] rounded-md -mt-2"></div>
          <div className="w-4 h-8 bg-[#8B4513] -mt-2"></div>
        </div>

        {/* Arena circle */}
        <div className="absolute bottom-[10%] left-1/2 transform -translate-x-1/2 w-[80vw] h-[30vh] bg-[#8B4513] rounded-full"></div>
        <div className="absolute bottom-[11%] left-1/2 transform -translate-x-1/2 w-[75vw] h-[28vh] bg-[#D2B48C] rounded-full"></div>
      </div>

      {/* Main content */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-6 overflow-hidden">
        <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-12 w-full h-full">
          {/* Chicken */}
          <div className="flex items-center justify-center mb-6 md:mb-0">
            <div className="w-full h-full max-w-[420px] max-h-[420px]">
              <PixelChickenViewer />
            </div>
          </div>
          {/* Menu */}
          <div className="bg-[#222222] border-4 border-[#111111] rounded-lg p-6 max-w-md w-full shadow-lg min-h-[400px] flex flex-col justify-between items-center transition-all duration-300">
            <div className="tabs flex mb-4 border-b-2 border-[#111111] w-full">
              <button
                className={`px-4 py-2 ${activeTab === "play" ? "bg-[#444444] text-yellow-300 font-bold" : "text-gray-300 hover:bg-[#333333]"} rounded-t-lg transition-colors`}
                style={{ minWidth: 0, flex: 1 }}
                onClick={() => {
                  setActiveTab("play")
                }}
              >
                Play
              </button>
              <button
                className={`px-4 py-2 ${activeTab === "about" ? "bg-[#444444] text-yellow-300 font-bold" : "text-gray-300 hover:bg-[#333333]"} rounded-t-lg transition-colors`}
                style={{ minWidth: 0, flex: 1 }}
                onClick={() => {
                  setActiveTab("about")
                }}
              >
                About
              </button>
              <button
                className={`px-4 py-2 ${activeTab === "controls" ? "bg-[#444444] text-yellow-300 font-bold" : "text-gray-300 hover:bg-[#333333]"} rounded-t-lg transition-colors`}
                style={{ minWidth: 0, flex: 1 }}
                onClick={() => {
                  setActiveTab("controls")
                }}
              >
                Controls
              </button>
            </div>
            <div className="flex-1 flex flex-col justify-center w-full">
              {activeTab === "play" && (
                <div className="text-white w-full">
                  <h2 className="text-xl font-bold mb-4 text-yellow-400 pixel-font">ENTER THE ARENA</h2>
                  <p className="mb-6 text-gray-300">
                    Connect your Solana wallet to start battling with your champion chickens!
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      className="bg-[#ff4500] hover:bg-[#ff6347] text-white font-bold py-3 px-6 rounded border-b-4 border-[#8B0000] hover:border-[#ff4500] transition-all pixel-font pixel-shadow"
                      onClick={() => navigate("/arena")}
                    >
                      ARENA
                    </Button>
                    <Button
                      className="bg-[#3b82f6] hover:bg-[#2563eb] text-white font-bold py-3 px-6 rounded border-b-4 border-[#1e40af] hover:border-[#3b82f6] transition-all pixel-font pixel-shadow"
                      onClick={() => navigate("/spectate")}
                    >
                      SPECTATE
                    </Button>
                    <Button
                      className="bg-[#22c55e] hover:bg-[#16a34a] text-white font-bold py-3 px-6 rounded border-b-4 border-[#15803d] hover:border-[#22c55e] transition-all pixel-font pixel-shadow"
                      onClick={() => navigate("/marketplace")}
                    >
                      MARKET
                    </Button>
                    <Button
                      className="bg-[#eab308] hover:bg-[#ca8a04] text-white font-bold py-3 px-6 rounded border-b-4 border-[#a16207] hover:border-[#eab308] transition-all pixel-font pixel-shadow"
                      onClick={() => navigate("/profile")}
                    >
                      MY COCKS
                    </Button>
                  </div>
                </div>
              )}
              {activeTab === "about" && (
                <div className="text-white w-full">
                  <h2 className="text-xl font-bold mb-4 text-yellow-400 pixel-font">ABOUT THE GAME</h2>
                  <p className="mb-4 text-gray-300">
                    Cock Combat is the ultimate voxel chicken fighting arena on Solana blockchain.
                  </p>
                  <p className="mb-4 text-gray-300">
                    Battle for glory, bet on champions, and build your feathered empire in this 8-bit inspired fighting
                    game.
                  </p>
                  <p className="text-gray-300">
                    Each chicken is a unique NFT tied to your wallet until it meets its demise in the arena.
                  </p>
                </div>
              )}
              {activeTab === "controls" && (
                <div className="text-white w-full">
                  <h2 className="text-xl font-bold mb-4 text-yellow-400 pixel-font">GAME CONTROLS</h2>
                  <div className="grid grid-cols-2 gap-2 text-gray-300">
                    <div className="font-bold">Movement:</div>
                    <div>WASD / Arrow Keys</div>
                    <div className="font-bold">Attack:</div>
                    <div>Space / Left Click</div>
                    <div className="font-bold">Special Move:</div>
                    <div>Right Click / E</div>
                    <div className="font-bold">Taunt:</div>
                    <div>T</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Game footer */}
      <footer className="relative z-10 p-3 bg-[#222222] border-t-4 border-[#111111] text-white text-center text-xs">
        <p>&copy; {new Date().getFullYear()} Cock Combat • Powered by Solana</p>
      </footer>

      {/* Login Prompt Dialog */}
      <Dialog 
        open={showLoginPrompt && (!connected || !authenticated)} 
        onOpenChange={() => {
          // Only allow closing if already authenticated
          if (connected && authenticated) {
            setShowLoginPrompt(false);
          } else if (!connected) {
            // Allow closing for non-connected users
            setShowLoginPrompt(false);
          }
        }}
      >
        <DialogContent className="bg-[#333333] border-4 border-[#222222] text-white">
          <DialogHeader>
            <DialogTitle className="text-yellow-400 text-xl pixel-font">
              {!connected ? "CONNECT YOUR WALLET" : !authenticated ? "AUTHENTICATE YOUR WALLET" : "AUTHENTICATION SUCCESSFUL"}
            </DialogTitle>
            <DialogDescription className="text-gray-300">
              {!connected 
                ? "You need to connect your Solana wallet to access this feature." 
                : !authenticated 
                ? "Please sign the message to verify you own this wallet address." 
                : "Your wallet has been authenticated successfully!"}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 my-4">
            {!connected && (
              <div className="flex justify-center">
                <WalletMultiButton 
                  onClickSound={() => playSound("click")} 
                />
              </div>
            )}
            
            {connected && !authenticated && (
              <div className="flex flex-col gap-3 items-center justify-center">
                {!disableSigning && (
                  <Button 
                    className="bg-[#fbbf24] hover:bg-[#f59e0b] text-[#333333] font-bold py-2 px-4 rounded border-b-4 border-[#d97706] transition-all"
                    onClick={authenticate}
                    disabled={authLoading}
                  >
                    {authLoading ? "Waiting for signature..." : "Sign Message"}
                  </Button>
                )}
                
                {!authLoading && (
                  <div className="text-center mt-2">
                    <p className="text-sm text-gray-400 mb-2">
                      Having trouble signing? Some wallets may not support message signing.
                    </p>
                    <Button 
                      variant="ghost"
                      className="text-yellow-400 hover:text-yellow-300 hover:bg-[#444444]"
                      onClick={handleSkipSigning}
                    >
                      Continue without signing
                    </Button>
                    
                    <div className="mt-4 p-3 bg-[#222222] rounded-md">
                      <p className="text-sm text-gray-300 mb-2 font-bold">Experiencing issues with wallet?</p>
                      <div className="flex items-center justify-center gap-2">
                        <input 
                          type="checkbox" 
                          id="disable-signing"
                          checked={disableSigning}
                          onChange={() => setDisableSigning(!disableSigning)}
                          className="w-4 h-4"
                        />
                        <label htmlFor="disable-signing" className="text-sm text-gray-300">
                          Permanently disable signature requests
                        </label>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {connected && authenticated && destinationAfterLogin && (
              <div className="flex justify-center">
                <Button 
                  className="bg-[#22c55e] hover:bg-[#16a34a] text-white font-bold py-2 px-4 rounded border-b-4 border-[#15803d] transition-all"
                  onClick={() => {
                    router.push(destinationAfterLogin)
                    setDestinationAfterLogin("")
                    setShowLoginPrompt(false)
                  }}
                >
                  Continue to {destinationAfterLogin.replace('/', '')}
                </Button>
              </div>
            )}
          </div>
          <DialogFooter className="flex justify-between">
            <Button 
              className="bg-[#444444] hover:bg-[#555555] text-white"
              onClick={() => setShowLoginPrompt(false)}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
