-- Create the lobbies table
CREATE TABLE lobbies (
    id TEXT PRIMARY KEY,
    amount NUMERIC NOT NULL,
    currency TEXT NOT NULL,
    players JSONB DEFAULT '[]'::jsonb,
    capacity INTEGER NOT NULL,
    high_roller BOOLEAN DEFAULT FALSE,
    status TEXT NOT NULL DEFAULT 'open',
    match_type TEXT NOT NULL,
    is_coming_soon BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed the table with initial lobby data
INSERT INTO lobbies (id, amount, currency, capacity, high_roller, match_type, is_coming_soon)
VALUES
    ('tutorial-match', 0, 'FREE', 8, FALSE, 'tutorial', FALSE),
    ('lobby-0.1', 0.1, 'SOL', 8, FALSE, 'ranked', FALSE),
    ('lobby-0.25', 0.25, 'SOL', 8, FALSE, 'ranked', FALSE),
    ('lobby-0.5', 0.5, 'SOL', 8, FALSE, 'ranked', FALSE),
    ('lobby-1.0', 1.0, 'SOL', 8, FALSE, 'ranked', TRUE),
    ('lobby-2.5', 2.5, 'SOL', 4, TRUE, 'ranked', TRUE),
    ('lobby-5.0', 5.0, 'SOL', 4, TRUE, 'ranked', TRUE),
    ('lobby-10.0', 10.0, 'SOL', 2, TRUE, 'ranked', TRUE);

-- Enable Row Level Security
ALTER TABLE lobbies ENABLE ROW LEVEL SECURITY;

-- Create policies for lobbies
-- Allow public read access
CREATE POLICY "Allow public read access" ON lobbies FOR SELECT USING (true);
-- Allow authenticated users to join (update players array)
CREATE POLICY "Allow authenticated users to join" ON lobbies FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated'); 