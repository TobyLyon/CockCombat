"use client"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useState } from "react"
import { useWallet } from "@solana/wallet-adapter-react"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"

interface ProfileSetupModalProps {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  onProfileCreated: () => void
}

export function ProfileSetupModal({
  isOpen,
  onOpenChange,
  onProfileCreated,
}: ProfileSetupModalProps) {
  const { publicKey } = useWallet()
  const [username, setUsername] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const handleCreateProfile = async () => {
    if (!publicKey || !username.trim()) {
      toast.error("Please enter a username.")
      return
    }

    if (username.length < 3) {
      toast.error("Username must be at least 3 characters long.")
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch("/api/profile/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: username.trim(),
          walletAddress: publicKey.toBase58(),
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        
        // Handle specific case where profile already exists
        if (response.status === 409 && errorData.error.includes("Profile already exists")) {
          console.log("Profile already exists for this wallet, refreshing...")
          toast.info("Profile already exists for this wallet. Redirecting...")
          onProfileCreated() // Refresh profile data
          onOpenChange(false) // Close modal
          return
        }
        
        throw new Error(errorData.error || "Failed to create profile.")
      }

      const data = await response.json()
      console.log("Profile created successfully:", data)

      toast.success("Profile created successfully!")
      onProfileCreated() // This will refresh the profile data in the context
      onOpenChange(false) // This will close the modal
    } catch (error) {
      console.error("Profile creation error:", error)
      const errorMessage = error instanceof Error ? error.message : "Failed to create profile."
      toast.error(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create Your Profile</DialogTitle>
          <DialogDescription>
            Choose a username to start your journey in Cock Combat.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <Input
            id="username"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={isLoading}
          />
        </div>
        <DialogFooter>
          <Button
            type="button"
            onClick={handleCreateProfile}
            disabled={isLoading}
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Profile
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
} 