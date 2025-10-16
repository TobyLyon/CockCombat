"use client"

import React, { createContext, useContext, useState, useEffect } from "react"
import { primeUsernameCache } from "@/hooks/use-username"
import { useWallet } from "@/hooks/use-wallet"
import { UserProfile, Chicken, getProfile, getUserChickens } from "@/lib/supabase"
import { ProfileSetupModal } from "@/components/profile/setup-modal"

interface ProfileContextType {
  profile: UserProfile | null
  loading: boolean
  error: string | null
  chickens: Chicken[]
  refreshProfile: () => Promise<void>
  updateWagerAmount: (amount: number) => void
  currentWagerAmount: number
  needsSetup: boolean
  setNeedsSetup: (needsSetup: boolean) => void
  setActiveChicken: (chickenId: string) => Promise<boolean>
  recordMatch: (matchData: any) => Promise<any>
}

const ProfileContext = createContext<ProfileContextType>({
  profile: null,
  loading: false,
  error: null,
  chickens: [],
  refreshProfile: async () => {},
  updateWagerAmount: () => {},
  currentWagerAmount: 10,
  needsSetup: false,
  setNeedsSetup: () => {},
  setActiveChicken: async () => false,
  recordMatch: async () => null,
})

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { connected, publicKey } = useWallet()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [chickens, setChickens] = useState<Chicken[]>([])
  const [currentWagerAmount, setCurrentWagerAmount] = useState(10)
  const [needsSetup, setNeedsSetup] = useState(false)

  useEffect(() => {
    if (connected && publicKey) {
      console.log('🔍 Wallet connected, loading profile for:', publicKey.toBase58())
      loadUserProfile()
    } else {
      console.log('🔌 Wallet disconnected, clearing profile state')
      setProfile(null)
      setChickens([])
      setNeedsSetup(false)
      setError(null)
    }
  }, [connected, publicKey])

  const loadUserProfile = async () => {
    if (!publicKey) {
      console.log('❌ No public key available')
      return
    }

    setLoading(true)
    setError(null)
    setNeedsSetup(false) // Reset setup flag while loading

    const walletAddress = publicKey.toBase58()
    console.log('🔄 Loading profile for wallet:', walletAddress)

    try {
      // Use API endpoint directly (has service role access, avoids RLS issues)
      console.log('🌐 Loading profile via API...')
      const response = await fetch(`/api/profile/${walletAddress}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })
      
      if (response.ok) {
        const apiProfile = await response.json()
        if (apiProfile && apiProfile.wallet_address) {
          console.log('✅ Profile found via API:', {
            wallet: apiProfile.wallet_address,
            username: apiProfile.username,
            created: apiProfile.date_created
          })
          setProfile(apiProfile)
          // Prime username cache for the current user so UI always has it
          try {
            if (apiProfile?.wallet_address && apiProfile?.username) {
              primeUsernameCache({ [apiProfile.wallet_address]: apiProfile.username })
            }
          } catch {}
          
          // Note: Skipping last_login update due to schema cache issues
          // This can be re-enabled once the database schema is fully synchronized
          
          // Skip chicken loading for now - everyone gets random chicken
          console.log('🐔 Skipping chicken loading - using random assignment')
          setChickens([])
          
          setNeedsSetup(false)
          setError(null)
          return
        }
      } else if (response.status === 404) {
        console.log('🆕 Profile does not exist (404) - this is a new user')
        setProfile(null)
        setChickens([])
        setNeedsSetup(true)
        setError(null)
        return
      } else {
        console.log('⚠️ API returned error:', response.status, await response.text())
        throw new Error(`API returned ${response.status}`)
      }
      
      // If we reach here, something unexpected happened
      console.log('🆕 No profile found - treating as new user')
      setProfile(null)
      setChickens([])
      setNeedsSetup(true)
      setError(null)

    } catch (err) {
      console.error('❌ Error loading profile:', err)
      setError("Failed to load profile data")
      setProfile(null)
      setChickens([])
      // Don't set needsSetup on error - we're not sure if user exists or not
      // This prevents incorrectly showing setup modal due to network issues
      setNeedsSetup(false)
    } finally {
      setLoading(false)
    }
  }

  const refreshProfile = async () => {
    console.log('🔄 Refreshing profile...')
    await loadUserProfile()
  }

  const updateWagerAmount = (amount: number) => {
    setCurrentWagerAmount(amount)
  }

  const setActiveChicken = async (chickenId: string): Promise<boolean> => {
    // Simplified - no chicken ownership for now
    console.log('🐔 setActiveChicken called but skipped - using random assignment')
    return true
  }

  const recordMatch = async (matchData: any): Promise<any> => {
    if (!publicKey) return null
    
    try {
      const response = await fetch(`/api/profile/${publicKey.toBase58()}/match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(matchData)
      })
      
      if (response.ok) {
        return await response.json()
      }
      return null
    } catch (error) {
      console.error('Error recording match:', error)
      return null
    }
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
        currentWagerAmount,
        needsSetup,
        setNeedsSetup,
        setActiveChicken,
        recordMatch,
      }}
    >
      {children}
      <ProfileSetupModal isOpen={needsSetup} onOpenChange={setNeedsSetup} onProfileCreated={refreshProfile} />
    </ProfileContext.Provider>
  )
}

export const useProfile = () => useContext(ProfileContext) 