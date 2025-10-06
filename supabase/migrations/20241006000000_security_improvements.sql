-- Security Improvements Migration
-- Adds replay protection, session management, and audit logging

-- 1. Create table for replay protection (prevent signature reuse)
CREATE TABLE IF NOT EXISTS used_signatures (
  signature TEXT PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  used_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  endpoint TEXT NOT NULL, -- which endpoint used this signature
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_used_signatures_wallet ON used_signatures(wallet_address);
CREATE INDEX IF NOT EXISTS idx_used_signatures_used_at ON used_signatures(used_at);

-- 2. Create session management table for wallet-based auth
CREATE TABLE IF NOT EXISTS auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  nonce TEXT NOT NULL UNIQUE,
  signature TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  last_active TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  is_valid BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_wallet ON auth_sessions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_nonce ON auth_sessions(nonce);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires ON auth_sessions(expires_at);

-- 3. Create match results table (for payout verification)
CREATE TABLE IF NOT EXISTS match_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lobby_id TEXT NOT NULL,
  escrow_wallet_id TEXT, -- Which escrow wallet (A/B/C) holds funds for this match
  match_started_at TIMESTAMPTZ NOT NULL,
  match_ended_at TIMESTAMPTZ,
  winner_wallet TEXT,
  total_prize_pool DECIMAL NOT NULL,
  participants JSONB NOT NULL DEFAULT '[]'::jsonb, -- array of {wallet, wager_amount, placement}
  game_data JSONB DEFAULT '{}'::jsonb, -- game events, actions, etc
  status TEXT DEFAULT 'in_progress', -- in_progress, completed, cancelled, disputed
  payout_processed BOOLEAN DEFAULT FALSE,
  payout_tx_signature TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_match_results_lobby ON match_results(lobby_id);
CREATE INDEX IF NOT EXISTS idx_match_results_winner ON match_results(winner_wallet);
CREATE INDEX IF NOT EXISTS idx_match_results_status ON match_results(status);
CREATE INDEX IF NOT EXISTS idx_match_results_payout ON match_results(payout_processed);

-- 4. Create audit log table
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  event_type TEXT NOT NULL, -- 'lobby_join', 'wager_placed', 'payout_executed', etc
  actor_wallet TEXT, -- who performed the action
  target_wallet TEXT, -- who was affected (if applicable)
  endpoint TEXT,
  ip_address TEXT,
  user_agent TEXT,
  request_body JSONB,
  response_status INTEGER,
  metadata JSONB DEFAULT '{}'::jsonb,
  severity TEXT DEFAULT 'info' -- info, warning, error, critical
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_wallet);
CREATE INDEX IF NOT EXISTS idx_audit_logs_severity ON audit_logs(severity);

-- 5. Create API rate limit tracking table
CREATE TABLE IF NOT EXISTS rate_limit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier TEXT NOT NULL, -- IP or wallet address
  endpoint TEXT NOT NULL,
  request_count INTEGER DEFAULT 1,
  window_start TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  last_request TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_identifier ON rate_limit_log(identifier, endpoint);
CREATE INDEX IF NOT EXISTS idx_rate_limit_window ON rate_limit_log(window_start);

-- 6. Update lobbies table to be used (was created but not used)
-- Add columns for better tracking
ALTER TABLE lobbies ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE lobbies ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE lobbies ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE lobbies ADD COLUMN IF NOT EXISTS escrow_wallet_id TEXT; -- Which escrow wallet (A/B/C) is assigned to this lobby

-- 7. Add payout tracking to transactions table
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS match_result_id UUID REFERENCES match_results(id);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'completed';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS blockchain_signature TEXT;

-- 8. Enable RLS on new tables
ALTER TABLE used_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limit_log ENABLE ROW LEVEL SECURITY;

-- 9. Create RLS policies
-- used_signatures: service role only
CREATE POLICY "Service role can manage used signatures" ON used_signatures
  FOR ALL USING (auth.role() = 'service_role');

-- auth_sessions: service role can manage, users can view their own
CREATE POLICY "Service role can manage auth sessions" ON auth_sessions
  FOR ALL USING (auth.role() = 'service_role');

-- match_results: public read, service role write
CREATE POLICY "Anyone can view match results" ON match_results
  FOR SELECT USING (true);

CREATE POLICY "Service role can manage match results" ON match_results
  FOR ALL USING (auth.role() = 'service_role');

-- audit_logs: service role only
CREATE POLICY "Service role can manage audit logs" ON audit_logs
  FOR ALL USING (auth.role() = 'service_role');

-- rate_limit_log: service role only
CREATE POLICY "Service role can manage rate limits" ON rate_limit_log
  FOR ALL USING (auth.role() = 'service_role');

-- 10. Create function to clean up old data periodically
CREATE OR REPLACE FUNCTION cleanup_old_security_data()
RETURNS void AS $$
BEGIN
  -- Delete signatures older than 30 days
  DELETE FROM used_signatures WHERE used_at < NOW() - INTERVAL '30 days';
  
  -- Delete expired sessions
  DELETE FROM auth_sessions WHERE expires_at < NOW() OR (is_valid = FALSE AND last_active < NOW() - INTERVAL '7 days');
  
  -- Delete old rate limit logs (keep 7 days)
  DELETE FROM rate_limit_log WHERE window_start < NOW() - INTERVAL '7 days';
  
  -- Delete old audit logs (keep 90 days for most, 1 year for critical)
  DELETE FROM audit_logs WHERE timestamp < NOW() - INTERVAL '90 days' AND severity NOT IN ('error', 'critical');
  DELETE FROM audit_logs WHERE timestamp < NOW() - INTERVAL '1 year';
END;
$$ LANGUAGE plpgsql;

-- 11. Grant permissions
GRANT ALL ON used_signatures TO service_role;
GRANT ALL ON auth_sessions TO service_role;
GRANT ALL ON match_results TO service_role;
GRANT ALL ON audit_logs TO service_role;
GRANT ALL ON rate_limit_log TO service_role;

GRANT SELECT ON match_results TO anon;

-- 12. Create trigger for match_results updated_at
CREATE OR REPLACE FUNCTION update_match_results_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_match_results_timestamp
    BEFORE UPDATE ON match_results
    FOR EACH ROW
    EXECUTE FUNCTION update_match_results_updated_at();

