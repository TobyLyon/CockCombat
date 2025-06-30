"use client"

import React, { createContext, useContext, useState, useEffect } from "react"
import { useWallet } from "@/hooks/use-wallet"
import { UserProfile, Chicken, getOrCreateProfile, getUserChickens } from "@/lib/supabase"

interface ProfileContextType {
  profile: UserProfile | null
  loading: boolean
  error: string | null
  chickens: Chicken[]
  refreshProfile: () => Promise<void>
  updateWagerAmount: (amount: number) => void
  currentWagerAmount: number
}

const ProfileContext = createContext<ProfileContextType>({
  profile: null,
  loading: false,
  error: null,
  chickens: [],
  refreshProfile: async () => {},
  updateWagerAmount: () => {},
  currentWagerAmount: 10 // Default wager amount
})

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { connected, publicKey } = useWallet()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [chickens, setChickens] = useState<Chicken[]>([])
  const [currentWagerAmount, setCurrentWagerAmount] = useState(10) // Default wager amount

  // Load profile when wallet connects
  useEffect(() => {
    if (connected && publicKey) {
      loadUserProfile()
    } else {
      // Clear profile if wallet disconnects
      setProfile(null)
      setChickens([])
    }
  }, [connected, publicKey])

  // Load user profile from Supabase
  const loadUserProfile = async () => {
    if (!publicKey) return

    setLoading(true)
    setError(null)

    try {
      // Get or create profile
      const userProfile = await getOrCreateProfile(publicKey)
      setProfile(userProfile)

      // Load user's chickens
      if (userProfile) {
        const userChickens = await getUserChickens(userProfile.id)
        setChickens(userChickens)
      }
    } catch (err) {
      console.error("Error loading profile:", err)
      setError("Failed to load profile data")
    } finally {
      setLoading(false)
    }
  }

  // Function to refresh profile data
  const refreshProfile = async () => {
    await loadUserProfile()
  }

  // Function to update wager amount
  const updateWagerAmount = (amount: number) => {
    setCurrentWagerAmount(amount)
  }

  return (
    <ProfileContext.Provider
      value={{
        profile,
        loading,
        error,
        chickens,
        refreshProfile,
        updateWagerAmount,
        currentWagerAmount
      }}
    >
      {children}
    </ProfileContext.Provider>
  )
}

export const useProfile = () => useContext(ProfileContext) 