-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  wallet_address TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  date_created TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  last_login TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  profile_picture TEXT,
  bio TEXT,
  
  -- Game statistics
  total_matches INTEGER DEFAULT 0,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  win_streak INTEGER DEFAULT 0,
  max_win_streak INTEGER DEFAULT 0,
  total_tokens_won DECIMAL DEFAULT 0,
  total_tokens_lost DECIMAL DEFAULT 0,
  total_wagered DECIMAL DEFAULT 0,
  
  -- Progression
  level INTEGER DEFAULT 1,
  experience INTEGER DEFAULT 0,
  next_level_xp INTEGER DEFAULT 100,
  
  -- Active chicken
  active_chicken_id UUID,
  
  -- Cache token balance 
  token_balance DECIMAL DEFAULT 0
);

-- Create chicken table
CREATE TABLE IF NOT EXISTS chickens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_wallet TEXT REFERENCES profiles(wallet_address) ON DELETE CASCADE,
  name TEXT NOT NULL,
  date_acquired TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  level INTEGER DEFAULT 1,
  experience INTEGER DEFAULT 0,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  
  -- Colors
  primary_color TEXT DEFAULT '#f97316',
  secondary_color TEXT DEFAULT '#fbbf24',
  trim_color TEXT DEFAULT '#ffffff',
  
  -- Equipment 
  headgear TEXT,
  body_armor TEXT,
  weapon TEXT,
  accessory TEXT,
  
  -- Comedic stats as JSON
  fun_stats JSONB NOT NULL DEFAULT '{
    "fluffiness": 5,
    "attitudeProblem": 5,
    "eggQuality": "Scrambled",
    "wingspanInches": 15,
    "squawkVolume": 5,
    "pecksPerMinute": 60,
    "broodiness": "Sometimes",
    "favoriteFood": "Corn",
    "backtalkLevel": 5,
    "ninjaTechnique": "Wing Attack",
    "intimidationFactor": 5,
    "karaokeSinging": "Tone Deaf"
  }',
  
  -- Personality traits
  variant TEXT DEFAULT 'standard',
  personality TEXT DEFAULT 'Confident',
  catchphrase TEXT DEFAULT 'Cluck around and find out!'
);

-- Create matches table
CREATE TABLE IF NOT EXISTS matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_timestamp TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  
  -- Player 1 info
  player1_wallet TEXT REFERENCES profiles(wallet_address),
  player1_chicken_id UUID REFERENCES chickens(id),
  player1_tokens_wagered DECIMAL DEFAULT 0,
  
  -- Player 2 info
  player2_wallet TEXT REFERENCES profiles(wallet_address),
  player2_chicken_id UUID REFERENCES chickens(id),
  player2_tokens_wagered DECIMAL DEFAULT 0,
  
  -- Match details
  winner_wallet TEXT,
  duration_seconds INTEGER DEFAULT 0,
  map TEXT DEFAULT 'standard',
  
  -- Extra data
  metadata JSONB
);

-- Create transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT REFERENCES profiles(wallet_address) ON DELETE CASCADE,
  transaction_type TEXT NOT NULL, -- 'wager', 'win', 'purchase', 'sale', 'airdrop'
  amount DECIMAL NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  related_entity_id TEXT, -- Match ID, item ID, etc.
  description TEXT
);

-- Create achievements table
CREATE TABLE IF NOT EXISTS achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT REFERENCES profiles(wallet_address) ON DELETE CASCADE,
  achievement_type TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  date_unlocked TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  icon TEXT,
  reward_type TEXT, -- 'token', 'cosmetic', 'chicken'
  reward_amount DECIMAL,
  reward_id TEXT
);

-- Create RLS policies
-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE chickens ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;

-- Create policies
-- Profiles: Users can read any profile but only update their own
CREATE POLICY "Public profiles are viewable by everyone" ON profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can update their own profile" ON profiles
  FOR UPDATE USING (auth.uid()::text = wallet_address);

CREATE POLICY "Users can insert their own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid()::text = wallet_address);

-- Chickens: Users can view all chickens but only update their own
CREATE POLICY "Chickens are viewable by everyone" ON chickens
  FOR SELECT USING (true);

CREATE POLICY "Users can insert their own chickens" ON chickens
  FOR INSERT WITH CHECK (auth.uid()::text = owner_wallet);

CREATE POLICY "Users can update their own chickens" ON chickens
  FOR UPDATE USING (auth.uid()::text = owner_wallet);

CREATE POLICY "Users can delete their own chickens" ON chickens
  FOR DELETE USING (auth.uid()::text = owner_wallet);

-- Matches: Anyone can view matches
CREATE POLICY "Matches are viewable by everyone" ON matches
  FOR SELECT USING (true);

-- Transactions: Users can only view their own transactions
CREATE POLICY "Users can view their own transactions" ON transactions
  FOR SELECT USING (auth.uid()::text = wallet_address);

-- Achievements: Users can only view their own achievements
CREATE POLICY "Users can view their own achievements" ON achievements
  FOR SELECT USING (auth.uid()::text = wallet_address);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_chickens_owner ON chickens(owner_wallet);
CREATE INDEX IF NOT EXISTS idx_matches_player1 ON matches(player1_wallet);
CREATE INDEX IF NOT EXISTS idx_matches_player2 ON matches(player2_wallet);
CREATE INDEX IF NOT EXISTS idx_transactions_wallet ON transactions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_achievements_wallet ON achievements(wallet_address); 