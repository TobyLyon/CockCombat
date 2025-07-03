import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

// Create Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Define database types
export type UserProfile = Profile // Add alias for compatibility
export type Profile = {
  wallet_address: string
  username: string
  date_created: string
  last_login: string
  profile_picture?: string
  bio?: string
  total_matches: number
  wins: number
  losses: number
  win_streak: number
  max_win_streak: number
  total_tokens_won: number
  total_tokens_lost: number
  total_wagered: number
  level: number
  experience: number
  next_level_xp: number
  active_chicken_id?: string
  token_balance: number
}

export type FunStats = {
  fluffiness: number
  attitudeProblem: number
  eggQuality: string
  wingspanInches: number
  squawkVolume: number
  pecksPerMinute: number
  broodiness: string
  favoriteFood: string
  backtalkLevel: number
  ninjaTechnique: string
  intimidationFactor: number
  karaokeSinging: string
}

// Chicken types
export type Chicken = {
  id: string
  owner_wallet: string
  name: string
  date_acquired: string
  level: number
  experience: number
  wins: number
  losses: number
  primary_color: string
  secondary_color: string
  trim_color: string
  headgear?: string
  body_armor?: string
  weapon?: string
  accessory?: string
  fun_stats: FunStats
  variant: string
  personality: string
  catchphrase: string
}

export type Match = {
  id: string
  match_timestamp: string
  player1_wallet: string
  player1_chicken_id: string
  player1_tokens_wagered: number
  player2_wallet: string
  player2_chicken_id: string
  player2_tokens_wagered: number
  winner_wallet?: string
  duration_seconds: number
  map: string
  metadata?: any
}

export type Transaction = {
  id: string
  wallet_address: string
  transaction_type: string
  amount: number
  timestamp: string
  related_entity_id?: string
  description?: string
}

export type Achievement = {
  id: string
  wallet_address: string
  achievement_type: string
  name: string
  description: string
  date_unlocked: string
  icon?: string
  reward_type?: string
  reward_amount?: number
  reward_id?: string
}

// Function to get a user profile
export async function getProfile(walletAddress: string): Promise<Profile | null> {
  try {
    const { data: existingProfile, error: fetchError } = await supabase
      .from('profiles')
      .select('*')
      .eq('wallet_address', walletAddress)
      .single()

    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('Error fetching profile:', fetchError)
      return null
    }

    return existingProfile as Profile
  } catch (error) {
    console.error('Unexpected error in getProfile:', error)
    return null
  }
}

// Function to update profile stats
export async function updateProfileStats(
  profileId: string, 
  stats: Partial<Profile>
): Promise<Profile | null> {
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

    return data as Profile
  } catch (error) {
    console.error('Unexpected error in updateProfileStats:', error)
    return null
  }
}

// Function to get user's chickens
export async function getUserChickens(walletAddress: string): Promise<Chicken[]> {
  try {
    const { data, error } = await supabase
      .from('chickens')
      .select('*')
      .eq('owner_wallet', walletAddress)

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