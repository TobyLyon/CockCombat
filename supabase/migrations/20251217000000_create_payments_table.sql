-- Create payments and escrow_wallets tables for idempotent settlements
-- Used by both EVM and Solana payment senders.

CREATE TABLE IF NOT EXISTS payments (
  op_id TEXT PRIMARY KEY,
  type TEXT NOT NULL, -- payout | refund | house
  from_address TEXT,
  to_address TEXT,
  token TEXT NOT NULL DEFAULT 'SOL',
  amount_wei TEXT NOT NULL,
  tx_hash TEXT,
  state TEXT NOT NULL DEFAULT 'pending', -- pending | in_progress | sent | confirmed_soft | failed
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payments_type ON payments(type);
CREATE INDEX IF NOT EXISTS idx_payments_state ON payments(state);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at DESC);

CREATE TABLE IF NOT EXISTS escrow_wallets (
  id TEXT PRIMARY KEY,
  address TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable RLS
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE escrow_wallets ENABLE ROW LEVEL SECURITY;

-- Policies: service role only
DROP POLICY IF EXISTS "Service role can manage payments" ON payments;
CREATE POLICY "Service role can manage payments" ON payments
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role can manage escrow wallets" ON escrow_wallets;
CREATE POLICY "Service role can manage escrow wallets" ON escrow_wallets
  FOR ALL USING (auth.role() = 'service_role');

-- Grant permissions
GRANT ALL ON payments TO service_role;
GRANT ALL ON escrow_wallets TO service_role;

-- updated_at triggers
CREATE OR REPLACE FUNCTION update_payments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_payments_timestamp ON payments;
CREATE TRIGGER update_payments_timestamp
  BEFORE UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_payments_updated_at();

CREATE OR REPLACE FUNCTION update_escrow_wallets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_escrow_wallets_timestamp ON escrow_wallets;
CREATE TRIGGER update_escrow_wallets_timestamp
  BEFORE UPDATE ON escrow_wallets
  FOR EACH ROW
  EXECUTE FUNCTION update_escrow_wallets_updated_at();
