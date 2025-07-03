import { supabase, Profile, Chicken, Match, Transaction, Achievement, FunStats } from './supabase'
import { v4 as uuidv4 } from 'uuid'

/**
 * Profile Service
 * Handles all interactions with Supabase for user profiles
 */
export class ProfileService {
  /**
   * Fetch profile by wallet address
   */
  static async getProfile(walletAddress: string): Promise<Profile | null> {
    console.log('Fetching profile for:', walletAddress)
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('wallet_address', walletAddress)
        .maybeSingle()

      if (error && error.code !== 'PGRST116') {
        throw error
      }
      return data
    } catch (error: any) {
      console.error('Error fetching profile:', JSON.stringify(error, null, 2))
      throw error
    }
  }

  /**
   * Create a new profile
   */
  static async createProfile(walletAddress: string, username: string): Promise<Profile | null> {
    console.log(`Creating profile for ${walletAddress} with username ${username}`);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .insert({
          wallet_address: walletAddress,
          username: username,
        })
        .select()

      if (error) {
        throw error;
      }
      
      return data ? data[0] : null;
    } catch (error: any) {
      console.error('Detailed error creating profile:', JSON.stringify(error, null, 2));
      throw error;
    }
  }

  /**
   * Update an existing profile
   */
  static async updateProfile(walletAddress: string, updates: Partial<Profile>): Promise<Profile | null> {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('wallet_address', walletAddress)
        .select()
        .single()

      if (error) {
        console.error('Error updating profile:', error)
        return null
      }

      return data
    } catch (error) {
      console.error('Error in updateProfile:', error)
      return null
    }
  }

  /**
   * Get all chickens owned by a wallet
   */
  static async getChickens(walletAddress: string): Promise<Chicken[]> {
    try {
      const { data, error } = await supabase
        .from('chickens')
        .select('*')
        .eq('owner_wallet', walletAddress)
        .order('date_acquired', { ascending: false })

      if (error) {
        console.error('Error fetching chickens:', error)
        return []
      }

      return data || []
    } catch (error) {
      console.error('Error in getChickens:', error)
      return []
    }
  }

  /**
   * Get a specific chicken by ID
   */
  static async getChicken(chickenId: string): Promise<Chicken | null> {
    try {
      const { data, error } = await supabase
        .from('chickens')
        .select('*')
        .eq('id', chickenId)
        .single()

      if (error) {
        console.error('Error fetching chicken:', error)
        return null
      }

      return data
    } catch (error) {
      console.error('Error in getChicken:', error)
      return null
    }
  }

  /**
   * Create a new chicken
   */
  static async createChicken(chicken: Partial<Chicken>): Promise<Chicken | null> {
    try {
      const { data, error } = await supabase
        .from('chickens')
        .insert([chicken])
        .select()
        .single()

      if (error) {
        console.error('Error creating chicken:', error)
        return null
      }

      return data
    } catch (error) {
      console.error('Error in createChicken:', error)
      return null
    }
  }

  /**
   * Update an existing chicken
   */
  static async updateChicken(chickenId: string, updates: Partial<Chicken>): Promise<Chicken | null> {
    try {
      const { data, error } = await supabase
        .from('chickens')
        .update(updates)
        .eq('id', chickenId)
        .select()
        .single()

      if (error) {
        console.error('Error updating chicken:', error)
        return null
      }

      return data
    } catch (error) {
      console.error('Error in updateChicken:', error)
      return null
    }
  }

  /**
   * Set active chicken for a user
   */
  static async setActiveChicken(walletAddress: string, chickenId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ active_chicken_id: chickenId })
        .eq('wallet_address', walletAddress)

      if (error) {
        console.error('Error setting active chicken:', error)
        return false
      }

      return true
    } catch (error) {
      console.error('Error in setActiveChicken:', error)
      return false
    }
  }

  /**
   * Get match history for a user
   */
  static async getMatchHistory(walletAddress: string, limit = 20): Promise<Match[]> {
    try {
      const { data, error } = await supabase
        .from('matches')
        .select('*')
        .or(`player1_wallet.eq.${walletAddress},player2_wallet.eq.${walletAddress}`)
        .order('match_timestamp', { ascending: false })
        .limit(limit)

      if (error) {
        console.error('Error fetching match history:', error)
        return []
      }

      return data || []
    } catch (error) {
      console.error('Error in getMatchHistory:', error)
      return []
    }
  }

  /**
   * Record a new match
   */
  static async recordMatch(matchData: Partial<Match>): Promise<Match | null> {
    try {
      const { data, error } = await supabase
        .from('matches')
        .insert([matchData])
        .select()
        .single()

      if (error) {
        console.error('Error recording match:', error)
        return null
      }

      // Update player statistics
      if (matchData.player1_wallet && matchData.player2_wallet && matchData.winner_wallet) {
        // Update player 1 stats
        await ProfileService.updatePlayerAfterMatch(
          matchData.player1_wallet,
          matchData.winner_wallet === matchData.player1_wallet,
          matchData.player1_tokens_wagered || 0,
          matchData.player1_tokens_wagered ? (matchData.player1_tokens_wagered * 2) : 0
        )

        // Update player 2 stats
        await ProfileService.updatePlayerAfterMatch(
          matchData.player2_wallet,
          matchData.winner_wallet === matchData.player2_wallet,
          matchData.player2_tokens_wagered || 0,
          matchData.player2_tokens_wagered ? (matchData.player2_tokens_wagered * 2) : 0
        )

        // Update chicken stats if provided
        if (matchData.player1_chicken_id) {
          await ProfileService.updateChickenAfterMatch(
            matchData.player1_chicken_id,
            matchData.winner_wallet === matchData.player1_wallet
          )
        }

        if (matchData.player2_chicken_id) {
          await ProfileService.updateChickenAfterMatch(
            matchData.player2_chicken_id,
            matchData.winner_wallet === matchData.player2_wallet
          )
        }
      }

      return data
    } catch (error) {
      console.error('Error in recordMatch:', error)
      return null
    }
  }

  /**
   * Get transaction history for a user
   */
  static async getTransactionHistory(walletAddress: string, limit = 50): Promise<Transaction[]> {
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('wallet_address', walletAddress)
        .order('timestamp', { ascending: false })
        .limit(limit)

      if (error) {
        console.error('Error fetching transaction history:', error)
        return []
      }

      return data || []
    } catch (error) {
      console.error('Error in getTransactionHistory:', error)
      return []
    }
  }

  /**
   * Record a new transaction
   */
  static async recordTransaction(transaction: Partial<Transaction>): Promise<Transaction | null> {
    try {
      const { data, error } = await supabase
        .from('transactions')
        .insert([transaction])
        .select()
        .single()

      if (error) {
        console.error('Error recording transaction:', error)
        return null
      }

      return data
    } catch (error) {
      console.error('Error in recordTransaction:', error)
      return null
    }
  }

  /**
   * Get achievements for a user
   */
  static async getAchievements(walletAddress: string): Promise<Achievement[]> {
    try {
      const { data, error } = await supabase
        .from('achievements')
        .select('*')
        .eq('wallet_address', walletAddress)
        .order('date_unlocked', { ascending: false })

      if (error) {
        console.error('Error fetching achievements:', error)
        return []
      }

      return data || []
    } catch (error) {
      console.error('Error in getAchievements:', error)
      return []
    }
  }

  /**
   * Unlock a new achievement
   */
  static async unlockAchievement(achievement: Partial<Achievement>): Promise<Achievement | null> {
    try {
      const { data, error } = await supabase
        .from('achievements')
        .insert([achievement])
        .select()
        .single()

      if (error) {
        console.error('Error unlocking achievement:', error)
        return null
      }

      return data
    } catch (error) {
      console.error('Error in unlockAchievement:', error)
      return null
    }
  }

  /**
   * Helper method to update player statistics after a match
   */
  static async updatePlayerAfterMatch(
    walletAddress: string,
    isWinner: boolean,
    wageredAmount: number,
    winningsAmount: number
  ): Promise<boolean> {
    try {
      // First get current profile data
      const profile = await ProfileService.getProfile(walletAddress)
      if (!profile) return false

      // Calculate new values
      const newWins = isWinner ? profile.wins + 1 : profile.wins
      const newLosses = isWinner ? profile.losses : profile.losses + 1
      const newWinStreak = isWinner ? profile.win_streak + 1 : 0
      const newMaxWinStreak = Math.max(profile.max_win_streak, newWinStreak)
      const newTotalTokensWon = isWinner ? profile.total_tokens_won + winningsAmount : profile.total_tokens_won
      const newTotalTokensLost = isWinner ? profile.total_tokens_lost : profile.total_tokens_lost + wageredAmount
      const newTotalWagered = profile.total_wagered + wageredAmount
      
      // Experience points gained (100 for win, 25 for loss)
      const xpGained = isWinner ? 100 : 25
      const newExperience = profile.experience + xpGained
      
      // Check for level up
      let newLevel = profile.level
      let newNextLevelXp = profile.next_level_xp
      
      if (newExperience >= profile.next_level_xp) {
        newLevel++
        newNextLevelXp = Math.floor(100 * Math.pow(1.5, newLevel - 1))
      }

      // Update profile
      const { error } = await supabase
        .from('profiles')
        .update({
          total_matches: profile.total_matches + 1,
          wins: newWins,
          losses: newLosses,
          win_streak: newWinStreak,
          max_win_streak: newMaxWinStreak,
          total_tokens_won: newTotalTokensWon,
          total_tokens_lost: newTotalTokensLost,
          total_wagered: newTotalWagered,
          experience: newExperience,
          level: newLevel,
          next_level_xp: newNextLevelXp,
          last_login: new Date().toISOString()
        })
        .eq('wallet_address', walletAddress)

      if (error) {
        console.error('Error updating player after match:', error)
        return false
      }

      // Record transactions
      if (wageredAmount > 0) {
        await ProfileService.recordTransaction({
          wallet_address: walletAddress,
          transaction_type: 'wager',
          amount: -wageredAmount,
          timestamp: new Date().toISOString(),
          description: `Match wager ${isWinner ? '(Won)' : '(Lost)'}`
        })
      }

      if (isWinner && winningsAmount > 0) {
        await ProfileService.recordTransaction({
          wallet_address: walletAddress,
          transaction_type: 'win',
          amount: winningsAmount,
          timestamp: new Date().toISOString(),
          description: 'Match winnings'
        })
      }

      // Check for achievements
      if (isWinner) {
        // First win achievement
        if (newWins === 1) {
          await ProfileService.unlockAchievement({
            wallet_address: walletAddress,
            achievement_type: 'first_win',
            name: 'First Victory',
            description: 'Won your first battle',
            icon: '🏆',
            reward_type: 'token',
            reward_amount: 5
          })
        }
        
        // Win streak achievements
        if (newWinStreak === 3) {
          await ProfileService.unlockAchievement({
            wallet_address: walletAddress,
            achievement_type: 'win_streak_3',
            name: 'Hat Trick',
            description: 'Won 3 battles in a row',
            icon: '🔥',
            reward_type: 'token',
            reward_amount: 10
          })
        }
        
        // Win count achievements
        if (newWins === 10) {
          await ProfileService.unlockAchievement({
            wallet_address: walletAddress,
            achievement_type: 'wins_10',
            name: 'Veteran Fighter',
            description: 'Won 10 battles total',
            icon: '⚔️',
            reward_type: 'token',
            reward_amount: 20
          })
        }
      }

      return true
    } catch (error) {
      console.error('Error in updatePlayerAfterMatch:', error)
      return false
    }
  }

  /**
   * Helper method to update chicken statistics after a match
   */
  static async updateChickenAfterMatch(
    chickenId: string,
    isWinner: boolean
  ): Promise<boolean> {
    try {
      // First get current chicken data
      const chicken = await ProfileService.getChicken(chickenId)
      if (!chicken) return false

      // Calculate new values
      const newWins = isWinner ? chicken.wins + 1 : chicken.wins
      const newLosses = isWinner ? chicken.losses : chicken.losses + 1
      
      // Experience points gained (100 for win, 25 for loss)
      const xpGained = isWinner ? 100 : 25
      const newExperience = chicken.experience + xpGained
      
      // Check for level up
      let newLevel = chicken.level
      if (newExperience >= 100 * chicken.level) {
        newLevel++
      }

      // Update chicken
      const { error } = await supabase
        .from('chickens')
        .update({
          wins: newWins,
          losses: newLosses,
          experience: newExperience,
          level: newLevel
        })
        .eq('id', chickenId)

      if (error) {
        console.error('Error updating chicken after match:', error)
        return false
      }

      return true
    } catch (error) {
      console.error('Error in updateChickenAfterMatch:', error)
      return false
    }
  }

  /**
   * Generate random fun stats for a new chicken
   */
  static generateRandomFunStats(): FunStats {
    return {
      fluffiness: Math.floor(Math.random() * 10) + 1,
      attitudeProblem: Math.floor(Math.random() * 10) + 1,
      eggQuality: ["Scrambled", "Over Easy", "Benedict", "Hard Boiled", "Raw"][Math.floor(Math.random() * 5)],
      wingspanInches: Math.floor(Math.random() * 20) + 10,
      squawkVolume: Math.floor(Math.random() * 10) + 1,
      pecksPerMinute: Math.floor(Math.random() * 90) + 30,
      broodiness: ["Never", "Sometimes", "Always Brooding"][Math.floor(Math.random() * 3)],
      favoriteFood: ["Worms", "Corn", "Premium Birdseed", "NFTs", "Bugs", "Pizza"][Math.floor(Math.random() * 6)],
      backtalkLevel: Math.floor(Math.random() * 10) + 1,
      ninjaTechnique: ["Flying Peck", "Stealth Scratch", "Wing Attack", "Egg Bomb", "Dust Bath Jutsu"][Math.floor(Math.random() * 5)],
      intimidationFactor: Math.floor(Math.random() * 10) + 1,
      karaokeSinging: ["Tone Deaf", "American Idol Reject", "Opera Star", "Death Metal Vocalist"][Math.floor(Math.random() * 4)]
    }
  }

  /**
   * Generate random catchphrase
   */
  static generateRandomCatchphrase(): string {
    const catchphrases = [
      "Cluck around and find out!",
      "I'm not chicken, you're chicken!",
      "Winner winner, I'm your dinner?",
      "Egg-cellent moves!",
      "I'm too cluck for you!",
      "Omelet you finish, but...",
      "Feeling cocky today!",
      "It ain't over 'til the chicken crows!",
      "Watch your pecker, buddy!",
      "My coop, my rules!"
    ]
    return catchphrases[Math.floor(Math.random() * catchphrases.length)]
  }

  /**
   * Generate random personality
   */
  static generateRandomPersonality(): string {
    const personalities = [
      "Anxious", "Confident", "Paranoid", "Narcissistic", 
      "Lazy", "Hyperactive", "Dramatic", "Stoic",
      "Sassy", "Brooding", "Optimistic", "Pessimistic"
    ]
    return personalities[Math.floor(Math.random() * personalities.length)]
  }

  /**
   * Create default chicken for a new user
   */
  static async createDefaultChicken(walletAddress: string): Promise<Chicken | null> {
    const defaultChicken: Partial<Chicken> = {
      owner_wallet: walletAddress,
      name: "First Feathers",
      date_acquired: new Date().toISOString(),
      level: 1,
      experience: 0,
      wins: 0,
      losses: 0,
      primary_color: "#f97316",
      secondary_color: "#fbbf24",
      trim_color: "#ffffff",
      fun_stats: ProfileService.generateRandomFunStats(),
      variant: "standard",
      personality: ProfileService.generateRandomPersonality(),
      catchphrase: ProfileService.generateRandomCatchphrase()
    }

    return await ProfileService.createChicken(defaultChicken)
  }

  /**
   * Initialize a new user profile with default values
   */
  static async initializeNewProfile(walletAddress: string): Promise<Profile | null> {
    try {
      const existingProfile = await ProfileService.getProfile(walletAddress);
      if (existingProfile) {
        console.log("Profile already exists, skipping creation.");
        return existingProfile;
      }

      const username = ProfileService.generateUsername(walletAddress);
      const newProfile = await ProfileService.createProfile(walletAddress, username);
      
      return newProfile;
    } catch (error) {
      console.error('Error initializing new profile:', error)
      return null;
    }
  }

  static generateUsername(walletAddress: string): string {
    return `Player_${walletAddress.slice(0, 6)}`
  }

  static async getLeaderboard(limit = 100): Promise<Profile[] | null> {
    // ...
    return null;
  }
}

// Create a singleton instance of the service
const profileService = new ProfileService()
export default profileService

// Utility functions that might be used across the app
// These can remain as static or be moved out of the class if they don't depend on instance state.

// Example of how a static method would be defined, if needed:
// export class ProfileService {
//   static someStaticMethod() { ... }
// } 