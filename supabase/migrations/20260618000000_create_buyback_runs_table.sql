-- Buyback runs ledger
-- Records every house-fee → $DINNER buyback attempt for audit, accrual tracking,
-- idempotency (unique op_id), and cooldown enforcement. Service role only.

CREATE TABLE IF NOT EXISTS buyback_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | submitted | confirmed | failed | dry_run
  wallet_address TEXT NOT NULL,
  input_mint TEXT NOT NULL,
  output_mint TEXT NOT NULL,
  sol_spent NUMERIC NOT NULL DEFAULT 0,      -- SOL spent (lamports / 1e9)
  lamports_spent BIGINT NOT NULL DEFAULT 0,
  expected_out_raw TEXT,                     -- raw token out (base units) from the quote
  actual_out_raw TEXT,                       -- raw token out actually received (if backfilled)
  token_decimals INT,
  slippage_bps INT,
  price_impact_pct NUMERIC,
  tx_signature TEXT,
  op_id TEXT UNIQUE,                         -- idempotency key per run
  error TEXT,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_buyback_runs_status ON buyback_runs(status);
CREATE INDEX IF NOT EXISTS idx_buyback_runs_created_at ON buyback_runs(created_at DESC);

-- Service-role-only access (mirrors payments table).
ALTER TABLE buyback_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage buyback runs" ON buyback_runs;
CREATE POLICY "Service role can manage buyback runs" ON buyback_runs
  FOR ALL USING (auth.role() = 'service_role');

GRANT ALL ON buyback_runs TO service_role;

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_buyback_runs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_buyback_runs_timestamp ON buyback_runs;
CREATE TRIGGER update_buyback_runs_timestamp
  BEFORE UPDATE ON buyback_runs
  FOR EACH ROW
  EXECUTE FUNCTION update_buyback_runs_updated_at();
