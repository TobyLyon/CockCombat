"use client"

import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from 'react'
import { useWallet } from '@/hooks/use-wallet'
import { ProfileService } from '@/lib/profile-service'
import { Profile, Chicken, Match, Transaction, Achievement } from '@/lib/supabase-client'
import { toast } from 'sonner'

// Profile context interface
interface ProfileContextType {
  profile: Profile | null
  isLoadingProfile: boolean
  chickens: Chicken[]
  isLoadingChickens: boolean
  activeChicken: Chicken | null
  matches: Match[]
  achievements: Achievement[]
  transactions: Transaction[]
  refreshProfile: () => Promise<void>
  updateUsername: (username: string) => Promise<boolean>
  addChicken: (chickenData: Partial<Chicken>) => Promise<Chicken | null>
  setActiveChicken: (chickenId: string) => Promise<boolean>
  updateChicken: (chickenId: string, updates: Partial<Chicken>) => Promise<Chicken | null>
  recordMatch: (matchData: Partial<Match>) => Promise<Match | null>
  currentWagerAmount: number
  setCurrentWagerAmount: (amount: number) => void
}

// Create context with default values
const ProfileContext = createContext<ProfileContextType>({
  profile: null,
  isLoadingProfile: false,
  chickens: [],
  isLoadingChickens: false,
  activeChicken: null,
  matches: [],
  achievements: [],
  transactions: [],
  refreshProfile: async () => {},
  updateUsername: async () => false,
  addChicken: async () => null,
  setActiveChicken: async () => false,
  updateChicken: async () => null,
  recordMatch: async () => null,
  currentWagerAmount: 10,
  setCurrentWagerAmount: () => {},
})

// Provider component
export function ProfileProvider({ children }: { children: ReactNode }) {
  const { connected, publicKey } = useWallet()
  
  // State variables
  const [profile, setProfile] = useState<Profile | null>(null)
  const [chickens, setChickens] = useState<Chicken[]>([])
  const [activeChicken, setActiveChickenState] = useState<Chicken | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [achievements, setAchievements] = useState<Achievement[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [isLoadingProfile, setIsLoadingProfile] = useState<boolean>(false)
  const [isLoadingChickens, setIsLoadingChickens] = useState<boolean>(false)
  const [currentWagerAmount, setCurrentWagerAmount] = useState<number>(10)
  
  // Fetch profile when wallet connects
  useEffect(() => {
    if (connected && publicKey) {
      fetchProfile(publicKey.toString())
    } else {
      // Reset state when wallet disconnects
      setProfile(null)
      setChickens([])
      setActiveChickenState(null)
      setMatches([])
      setAchievements([])
      setTransactions([])
    }
  }, [connected, publicKey])
  
  // Fetch profile data
  const fetchProfile = async (walletAddress: string) => {
    setIsLoadingProfile(true)
    try {
      // Try to get profile
      const profileData = await ProfileService.getProfile(walletAddress)
      
      if (profileData) {
        setProfile(profileData)
        
        // Fetch chickens
        fetchChickens(walletAddress, profileData.active_chicken_id)
        
        // Fetch matches
        fetchMatches(walletAddress)
        
        // Fetch achievements
        fetchAchievements(walletAddress)
        
        // Fetch transactions
        fetchTransactions(walletAddress)
        
        // Update last login
        ProfileService.updateProfile(walletAddress, {
          last_login: new Date().toISOString()
        })
      } else {
        // Profile doesn't exist, create new profile
        const newProfile = await ProfileService.initializeNewProfile(walletAddress)
        if (newProfile) {
          setProfile(newProfile)
          fetchChickens(walletAddress, newProfile.active_chicken_id)
          toast.success('Profile created successfully!')
        }
      }
    } catch (error) {
      console.error('Error fetching profile:', error)
      toast.error('Error loading profile')
    } finally {
      setIsLoadingProfile(false)
    }
  }
  
  // Fetch chickens for the current user
  const fetchChickens = async (walletAddress: string, activeChickenId?: string) => {
    setIsLoadingChickens(true)
    try {
      const chickenList = await ProfileService.getChickens(walletAddress)
      setChickens(chickenList)
      
      // Set active chicken
      if (activeChickenId && chickenList.length > 0) {
        const active = chickenList.find(chicken => chicken.id === activeChickenId)
        setActiveChickenState(active || chickenList[0])
      } else if (chickenList.length > 0) {
        setActiveChickenState(chickenList[0])
      }
    } catch (error) {
      console.error('Error fetching chickens:', error)
    } finally {
      setIsLoadingChickens(false)
    }
  }
  
  // Fetch match history
  const fetchMatches = async (walletAddress: string) => {
    try {
      const matchList = await ProfileService.getMatchHistory(walletAddress)
      setMatches(matchList)
    } catch (error) {
      console.error('Error fetching matches:', error)
    }
  }
  
  // Fetch achievements
  const fetchAchievements = async (walletAddress: string) => {
    try {
      const achievementList = await ProfileService.getAchievements(walletAddress)
      setAchievements(achievementList)
    } catch (error) {
      console.error('Error fetching achievements:', error)
    }
  }
  
  // Fetch transactions
  const fetchTransactions = async (walletAddress: string) => {
    try {
      const transactionList = await ProfileService.getTransactionHistory(walletAddress)
      setTransactions(transactionList)
    } catch (error) {
      console.error('Error fetching transactions:', error)
    }
  }
  
  // Refresh profile data
  const refreshProfile = async () => {
    if (!connected || !publicKey) return
    await fetchProfile(publicKey.toString())
  }
  
  // Update username
  const updateUsername = async (username: string): Promise<boolean> => {
    if (!connected || !publicKey || !profile) return false
    
    try {
      const walletAddress = publicKey.toString()
      const updatedProfile = await ProfileService.updateProfile(walletAddress, { username })
      
      if (updatedProfile) {
        setProfile(updatedProfile)
        toast.success('Username updated successfully!')
        return true
      }
      
      return false
    } catch (error) {
      console.error('Error updating username:', error)
      toast.error('Failed to update username')
      return false
    }
  }
  
  // Add a new chicken
  const addChicken = async (chickenData: Partial<Chicken>): Promise<Chicken | null> => {
    if (!connected || !publicKey) return null
    
    try {
      const walletAddress = publicKey.toString()
      
      // Make sure owner is set correctly
      const newChickenData = {
        ...chickenData,
        owner_wallet: walletAddress,
        date_acquired: new Date().toISOString()
      }
      
      // Create the chicken
      const newChicken = await ProfileService.createChicken(newChickenData)
      
      if (newChicken) {
        // Update local state
        setChickens(prev => [newChicken, ...prev])
        toast.success(`${newChicken.name} has joined your flock!`)
        
        // Record transaction (if it was a purchase)
        if (chickenData.variant !== 'standard') {
          await ProfileService.recordTransaction({
            wallet_address: walletAddress,
            transaction_type: 'purchase',
            amount: -20, // Placeholder amount
            timestamp: new Date().toISOString(),
            description: `Purchased ${newChicken.name} (${newChicken.variant})`
          })
        }
        
        return newChicken
      }
      
      return null
    } catch (error) {
      console.error('Error adding chicken:', error)
      toast.error('Failed to add chicken')
      return null
    }
  }
  
  // Set active chicken
  const setActiveChicken = async (chickenId: string): Promise<boolean> => {
    if (!connected || !publicKey) return false
    
    try {
      const walletAddress = publicKey.toString()
      const success = await ProfileService.setActiveChicken(walletAddress, chickenId)
      
      if (success) {
        // Update local state
        const chicken = chickens.find(c => c.id === chickenId)
        if (chicken) {
          setActiveChickenState(chicken)
          toast.success(`${chicken.name} is now your active chicken!`)
        }
        
        // Update profile
        setProfile(prev => prev ? { ...prev, active_chicken_id: chickenId } : null)
        
        return true
      }
      
      return false
    } catch (error) {
      console.error('Error setting active chicken:', error)
      toast.error('Failed to set active chicken')
      return false
    }
  }
  
  // Update a chicken
  const updateChicken = async (chickenId: string, updates: Partial<Chicken>): Promise<Chicken | null> => {
    if (!connected || !publicKey) return null
    
    try {
      const updatedChicken = await ProfileService.updateChicken(chickenId, updates)
      
      if (updatedChicken) {
        // Update local state
        setChickens(prev => prev.map(c => c.id === chickenId ? updatedChicken : c))
        
        // If this is the active chicken, update it too
        if (activeChicken && activeChicken.id === chickenId) {
          setActiveChickenState(updatedChicken)
        }
        
        toast.success(`${updatedChicken.name} updated!`)
        return updatedChicken
      }
      
      return null
    } catch (error) {
      console.error('Error updating chicken:', error)
      toast.error('Failed to update chicken')
      return null
    }
  }
  
  // Record a match
  const recordMatch = async (matchData: Partial<Match>): Promise<Match | null> => {
    if (!connected || !publicKey) return null
    
    try {
      const walletAddress = publicKey.toString()
      
      // Set player1 to current user if not set
      const completeMatchData = {
        ...matchData,
        player1_wallet: matchData.player1_wallet || walletAddress,
        player1_chicken_id: matchData.player1_chicken_id || (activeChicken ? activeChicken.id : undefined),
        player1_tokens_wagered: matchData.player1_tokens_wagered || currentWagerAmount
      }
      
      const match = await ProfileService.recordMatch(completeMatchData)
      
      if (match) {
        // Update local state
        setMatches(prev => [match, ...prev])
        
        // Refresh profile to get updated stats
        await refreshProfile()
        
        return match
      }
      
      return null
    } catch (error) {
      console.error('Error recording match:', error)
      toast.error('Failed to record match')
      return null
    }
  }
  
  // Context value
  const value = {
    profile,
    isLoadingProfile,
    chickens,
    isLoadingChickens,
    activeChicken,
    matches,
    achievements,
    transactions,
    refreshProfile,
    updateUsername,
    addChicken,
    setActiveChicken,
    updateChicken,
    recordMatch,
    currentWagerAmount,
    setCurrentWagerAmount
  }
  
  return (
    <ProfileContext.Provider value={value}>
      {children}
    </ProfileContext.Provider>
  )
}

// Hook to use the profile context
export function useProfile() {
  return useContext(ProfileContext)
} 