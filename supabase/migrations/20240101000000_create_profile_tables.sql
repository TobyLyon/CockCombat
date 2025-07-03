-- Clean up existing policies first (in case of partial migration)
DO $$ 
BEGIN
    -- Drop existing policies if they exist
    DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
    DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
    DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
    DROP POLICY IF EXISTS "Chickens are viewable by everyone" ON chickens;
    DROP POLICY IF EXISTS "Users can insert their own chickens" ON chickens;
    DROP POLICY IF EXISTS "Users can update their own chickens" ON chickens;
    DROP POLICY IF EXISTS "Users can delete their own chickens" ON chickens;
    DROP POLICY IF EXISTS "Matches are viewable by everyone" ON matches;
    DROP POLICY IF EXISTS "Service role can insert matches" ON matches;
    DROP POLICY IF EXISTS "Users can view their own transactions" ON transactions;
    DROP POLICY IF EXISTS "Service role can insert transactions" ON transactions;
    DROP POLICY IF EXISTS "Users can view their own achievements" ON achievements;
    DROP POLICY IF EXISTS "Service role can insert achievements" ON achievements;
EXCEPTION
    WHEN OTHERS THEN NULL;
END $$;

-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  wallet_address TEXT PRIMARY KEY,
  username TEXT UNIQUE,
  x_handle TEXT,
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

-- Handle chickens table - check if it exists and what columns it has
DO $$
DECLARE
    has_owner_wallet boolean := false;
    has_owner boolean := false;
BEGIN
    -- Check if chickens table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'chickens') THEN
        -- Check what owner column exists
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'chickens' AND column_name = 'owner_wallet'
        ) INTO has_owner_wallet;
        
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'chickens' AND column_name = 'owner'
        ) INTO has_owner;
        
        -- If table exists but has wrong column name, rename it
        IF has_owner AND NOT has_owner_wallet THEN
            ALTER TABLE chickens RENAME COLUMN owner TO owner_wallet;
        END IF;
        
        -- Add missing columns if they don't exist
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chickens' AND column_name = 'owner_wallet') THEN
            ALTER TABLE chickens ADD COLUMN owner_wallet TEXT NOT NULL DEFAULT '';
        END IF;
        
    ELSE
        -- Create table if it doesn't exist
        CREATE TABLE chickens (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          owner_wallet TEXT NOT NULL,
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
    END IF;
END $$;

-- Add foreign key constraint for chickens if it doesn't exist
DO $$
BEGIN
    -- First ensure the column exists and is not null
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'chickens' AND column_name = 'owner_wallet'
    ) THEN
        -- Add foreign key constraint if it doesn't exist
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE constraint_name = 'chickens_owner_wallet_fkey'
        ) THEN
            ALTER TABLE chickens 
            ADD CONSTRAINT chickens_owner_wallet_fkey 
            FOREIGN KEY (owner_wallet) REFERENCES profiles(wallet_address) ON DELETE CASCADE;
        END IF;
    END IF;
EXCEPTION
    WHEN OTHERS THEN 
        RAISE NOTICE 'Could not add foreign key constraint for chickens: %', SQLERRM;
END $$;

-- Create matches table
CREATE TABLE IF NOT EXISTS matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_timestamp TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  
  -- Player 1 info
  player1_wallet TEXT,
  player1_chicken_id UUID,
  player1_tokens_wagered DECIMAL DEFAULT 0,
  
  -- Player 2 info
  player2_wallet TEXT,
  player2_chicken_id UUID,
  player2_tokens_wagered DECIMAL DEFAULT 0,
  
  -- Match details
  winner_wallet TEXT,
  duration_seconds INTEGER DEFAULT 0,
  map TEXT DEFAULT 'standard',
  
  -- Extra data
  metadata JSONB
);

-- Add foreign key constraints for matches if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'matches_player1_wallet_fkey'
    ) THEN
        ALTER TABLE matches 
        ADD CONSTRAINT matches_player1_wallet_fkey 
        FOREIGN KEY (player1_wallet) REFERENCES profiles(wallet_address);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'matches_player2_wallet_fkey'
    ) THEN
        ALTER TABLE matches 
        ADD CONSTRAINT matches_player2_wallet_fkey 
        FOREIGN KEY (player2_wallet) REFERENCES profiles(wallet_address);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'matches_player1_chicken_id_fkey'
    ) THEN
        ALTER TABLE matches 
        ADD CONSTRAINT matches_player1_chicken_id_fkey 
        FOREIGN KEY (player1_chicken_id) REFERENCES chickens(id);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'matches_player2_chicken_id_fkey'
    ) THEN
        ALTER TABLE matches 
        ADD CONSTRAINT matches_player2_chicken_id_fkey 
        FOREIGN KEY (player2_chicken_id) REFERENCES chickens(id);
    END IF;
EXCEPTION
    WHEN OTHERS THEN 
        RAISE NOTICE 'Could not add foreign key constraints for matches: %', SQLERRM;
END $$;

-- Create transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  transaction_type TEXT NOT NULL, -- 'wager', 'win', 'purchase', 'sale', 'airdrop'
  amount DECIMAL NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  related_entity_id TEXT, -- Match ID, item ID, etc.
  description TEXT
);

-- Add foreign key constraint for transactions if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'transactions_wallet_address_fkey'
    ) THEN
        ALTER TABLE transactions 
        ADD CONSTRAINT transactions_wallet_address_fkey 
        FOREIGN KEY (wallet_address) REFERENCES profiles(wallet_address) ON DELETE CASCADE;
    END IF;
EXCEPTION
    WHEN OTHERS THEN 
        RAISE NOTICE 'Could not add foreign key constraint for transactions: %', SQLERRM;
END $$;

-- Create achievements table
CREATE TABLE IF NOT EXISTS achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  achievement_type TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  date_unlocked TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  icon TEXT,
  reward_type TEXT, -- 'token', 'cosmetic', 'chicken'
  reward_amount DECIMAL,
  reward_id TEXT
);

-- Add foreign key constraint for achievements if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'achievements_wallet_address_fkey'
    ) THEN
        ALTER TABLE achievements 
        ADD CONSTRAINT achievements_wallet_address_fkey 
        FOREIGN KEY (wallet_address) REFERENCES profiles(wallet_address) ON DELETE CASCADE;
    END IF;
EXCEPTION
    WHEN OTHERS THEN 
        RAISE NOTICE 'Could not add foreign key constraint for achievements: %', SQLERRM;
END $$;

-- Create lobbies table for matchmaking
CREATE TABLE IF NOT EXISTS lobbies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  wager_amount DECIMAL NOT NULL,
  currency TEXT DEFAULT 'SOL',
  max_players INTEGER DEFAULT 8,
  is_tutorial BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'waiting', -- 'waiting', 'starting', 'in_progress', 'completed'
  players JSONB DEFAULT '[]'::jsonb,
  ai_backfill_at TIMESTAMP WITH TIME ZONE,
  match_id UUID
);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE chickens ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE lobbies ENABLE ROW LEVEL SECURITY;

-- Create new simplified policies that work with service role
-- PROFILES: Public read, service role can do everything
CREATE POLICY "Anyone can view profiles" ON profiles
  FOR SELECT USING (true);

CREATE POLICY "Service role can manage profiles" ON profiles
  FOR ALL USING (auth.role() = 'service_role');

-- CHICKENS: Public read, service role can do everything
CREATE POLICY "Anyone can view chickens" ON chickens
  FOR SELECT USING (true);

CREATE POLICY "Service role can manage chickens" ON chickens
  FOR ALL USING (auth.role() = 'service_role');

-- MATCHES: Public read, service role can do everything
CREATE POLICY "Anyone can view matches" ON matches
  FOR SELECT USING (true);

CREATE POLICY "Service role can manage matches" ON matches
  FOR ALL USING (auth.role() = 'service_role');

-- TRANSACTIONS: Service role only (sensitive financial data)
CREATE POLICY "Service role can manage transactions" ON transactions
  FOR ALL USING (auth.role() = 'service_role');

-- ACHIEVEMENTS: Public read, service role can manage
CREATE POLICY "Anyone can view achievements" ON achievements
  FOR SELECT USING (true);

CREATE POLICY "Service role can manage achievements" ON achievements
  FOR ALL USING (auth.role() = 'service_role');

-- LOBBIES: Public read, service role can manage
CREATE POLICY "Anyone can view lobbies" ON lobbies
  FOR SELECT USING (true);

CREATE POLICY "Service role can manage lobbies" ON lobbies
  FOR ALL USING (auth.role() = 'service_role');

-- Create indexes for better performance (only if they don't exist)
DO $$
BEGIN
    -- Create indexes with error handling
    CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);
    CREATE INDEX IF NOT EXISTS idx_profiles_wallet ON profiles(wallet_address);
    
    -- Only create chicken indexes if the column exists
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chickens' AND column_name = 'owner_wallet') THEN
        CREATE INDEX IF NOT EXISTS idx_chickens_owner ON chickens(owner_wallet);
    END IF;
    
    CREATE INDEX IF NOT EXISTS idx_chickens_id ON chickens(id);
    CREATE INDEX IF NOT EXISTS idx_matches_player1 ON matches(player1_wallet);
    CREATE INDEX IF NOT EXISTS idx_matches_player2 ON matches(player2_wallet);
    CREATE INDEX IF NOT EXISTS idx_matches_timestamp ON matches(match_timestamp);
    CREATE INDEX IF NOT EXISTS idx_transactions_wallet ON transactions(wallet_address);
    CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON transactions(timestamp);
    CREATE INDEX IF NOT EXISTS idx_achievements_wallet ON achievements(wallet_address);
    CREATE INDEX IF NOT EXISTS idx_lobbies_status ON lobbies(status);
    CREATE INDEX IF NOT EXISTS idx_lobbies_wager ON lobbies(wager_amount);
    CREATE INDEX IF NOT EXISTS idx_lobbies_created ON lobbies(created_at);
EXCEPTION
    WHEN OTHERS THEN 
        RAISE NOTICE 'Could not create some indexes: %', SQLERRM;
END $$;

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for lobbies updated_at
DROP TRIGGER IF EXISTS update_lobbies_updated_at ON lobbies;
CREATE TRIGGER update_lobbies_updated_at
    BEFORE UPDATE ON lobbies
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Grant necessary permissions to service role
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Grant read permissions to anon role for public data
GRANT SELECT ON profiles TO anon;
GRANT SELECT ON chickens TO anon;
GRANT SELECT ON matches TO anon;
GRANT SELECT ON achievements TO anon;
GRANT SELECT ON lobbies TO anon;

-- Insert some default data for testing (optional)
-- Uncomment these if you want some sample data

-- INSERT INTO profiles (wallet_address, username, bio) VALUES 
-- ('test_wallet_1', 'TestUser1', 'A brave chicken fighter')
-- ON CONFLICT (wallet_address) DO NOTHING;

-- INSERT INTO chickens (owner_wallet, name, variant, personality) VALUES 
-- ('test_wallet_1', 'Clucky McFeathers', 'standard', 'Brave')
-- ON CONFLICT (id) DO NOTHING; 