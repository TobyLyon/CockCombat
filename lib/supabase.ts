import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

// Create Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// User profile types
export type UserProfile = {
  id: string
  wallet_address: string
  username: string | null
  wins: number
  losses: number
  cock_earned: number
  cock_lost: number
  chickens_owned: string[] // Array of chicken IDs
  created_at: string
  updated_at: string
}

// Chicken types
export type Chicken = {
  id: string
  owner_id: string
  name: string
  level: number
  wins: number
  losses: number
  attributes: {
    strength: number
    speed: number
    defense: number
    health: number
    special: number
  }
  appearance: {
    color: string
    crest: string
    texture: string
  }
  created_at: string
  updated_at: string
}

// Function to get or create a user profile
export async function getOrCreateProfile(walletAddress: string): Promise<UserProfile | null> {
  try {
    // Check if profile exists
    const { data: existingProfile, error: fetchError } = await supabase
      .from('profiles')
      .select('*')
      .eq('wallet_address', walletAddress)
      .single()

    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('Error fetching profile:', fetchError)
      return null
    }

    // Return existing profile if found
    if (existingProfile) {
      return existingProfile as UserProfile
    }

    // Create new profile
    const { data: newProfile, error: insertError } = await supabase
      .from('profiles')
      .insert([
        {
          wallet_address: walletAddress,
          username: null,
          wins: 0,
          losses: 0,
          cock_earned: 0,
          cock_lost: 0,
          chickens_owned: []
        }
      ])
      .select()
      .single()

    if (insertError) {
      console.error('Error creating profile:', insertError)
      return null
    }

    return newProfile as UserProfile
  } catch (error) {
    console.error('Unexpected error in getOrCreateProfile:', error)
    return null
  }
}

// Function to update profile stats
export async function updateProfileStats(
  profileId: string, 
  stats: Partial<UserProfile>
): Promise<UserProfile | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .update({
        ...stats,
        updated_at: new Date().toISOString()
      })
      .eq('id', profileId)
      .select()
      .single()

    if (error) {
      console.error('Error updating profile stats:', error)
      return null
    }

    return data as UserProfile
  } catch (error) {
    console.error('Unexpected error in updateProfileStats:', error)
    return null
  }
}

// Function to get user's chickens
export async function getUserChickens(profileId: string): Promise<Chicken[]> {
  try {
    const { data, error } = await supabase
      .from('chickens')
      .select('*')
      .eq('owner_id', profileId)

    if (error) {
      console.error('Error fetching user chickens:', error)
      return []
    }

    return data as Chicken[]
  } catch (error) {
    console.error('Unexpected error in getUserChickens:', error)
    return []
  }
} 