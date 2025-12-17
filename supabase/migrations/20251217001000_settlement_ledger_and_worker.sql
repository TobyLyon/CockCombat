
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;

ALTER TABLE match_results ADD COLUMN IF NOT EXISTS match_session_id TEXT;
ALTER TABLE match_results ADD COLUMN IF NOT EXISTS outcome TEXT DEFAULT 'pending';
ALTER TABLE match_results ADD COLUMN IF NOT EXISTS settlement_state TEXT DEFAULT 'not_started';
ALTER TABLE match_results ADD COLUMN IF NOT EXISTS settlement_claimed_at TIMESTAMPTZ;
ALTER TABLE match_results ADD COLUMN IF NOT EXISTS settlement_claimed_by TEXT;
ALTER TABLE match_results ADD COLUMN IF NOT EXISTS settlement_last_error TEXT;
ALTER TABLE match_results ADD COLUMN IF NOT EXISTS payout_house_tx_signature TEXT;
ALTER TABLE match_results ADD COLUMN IF NOT EXISTS payout_bundle_tx_signature TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_match_results_match_session_unique ON match_results(match_session_id) WHERE match_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_match_results_settlement_state ON match_results(settlement_state);
CREATE INDEX IF NOT EXISTS idx_match_results_outcome ON match_results(outcome);

ALTER TABLE payments ADD COLUMN IF NOT EXISTS chain TEXT DEFAULT 'solana';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS match_result_id UUID REFERENCES match_results(id);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS match_session_id TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS claimed_by TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_payments_match_result ON payments(match_result_id);
CREATE INDEX IF NOT EXISTS idx_payments_match_session ON payments(match_session_id);
CREATE INDEX IF NOT EXISTS idx_payments_locked_until ON payments(locked_until);

CREATE TABLE IF NOT EXISTS wager_deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_id UUID NOT NULL DEFAULT gen_random_uuid(),
  match_result_id UUID REFERENCES match_results(id) ON DELETE SET NULL,
  match_session_id TEXT,
  lobby_id TEXT NOT NULL,
  player_wallet TEXT NOT NULL,
  escrow_wallet_id TEXT NOT NULL,
  expected_lamports BIGINT NOT NULL,
  deposit_signature TEXT,
  slot BIGINT,
  commitment TEXT,
  status TEXT NOT NULL DEFAULT 'intent',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_wager_deposits_intent_id ON wager_deposits(intent_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wager_deposits_unique_sig ON wager_deposits(deposit_signature) WHERE deposit_signature IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_wager_deposits_match_player ON wager_deposits(match_result_id, player_wallet) WHERE match_result_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wager_deposits_lobby ON wager_deposits(lobby_id);
CREATE INDEX IF NOT EXISTS idx_wager_deposits_status ON wager_deposits(status);

CREATE OR REPLACE FUNCTION update_wager_deposits_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_wager_deposits_timestamp ON wager_deposits;
CREATE TRIGGER update_wager_deposits_timestamp
  BEFORE UPDATE ON wager_deposits
  FOR EACH ROW
  EXECUTE FUNCTION update_wager_deposits_updated_at();

ALTER TABLE wager_deposits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role can manage wager deposits" ON wager_deposits;
CREATE POLICY "Service role can manage wager deposits" ON wager_deposits
  FOR ALL USING (auth.role() = 'service_role');
GRANT ALL ON wager_deposits TO service_role;

CREATE OR REPLACE FUNCTION claim_match_results_for_settlement(p_claimed_by TEXT, p_max_rows INT DEFAULT 5)
RETURNS SETOF match_results
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM set_config('search_path', 'public,extensions', true);
  RETURN QUERY
  WITH cte AS (
    SELECT id
    FROM match_results
    WHERE status = 'completed'
      AND payout_processed = FALSE
      AND (outcome IS NULL OR outcome = 'pending')
      AND (settlement_state IS NULL OR settlement_state IN ('not_started', 'retry', 'failed'))
    ORDER BY updated_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT p_max_rows
  )
  UPDATE match_results mr
  SET settlement_state = 'in_progress',
      settlement_claimed_at = NOW(),
      settlement_claimed_by = p_claimed_by,
      settlement_last_error = NULL
  FROM cte
  WHERE mr.id = cte.id
  RETURNING mr.*;
END;
$$;

GRANT EXECUTE ON FUNCTION claim_match_results_for_settlement(TEXT, INT) TO service_role;

CREATE OR REPLACE FUNCTION claim_match_result_for_settlement(p_match_id UUID, p_claimed_by TEXT)
RETURNS SETOF match_results
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM set_config('search_path', 'public,extensions', true);
  RETURN QUERY
  WITH cte AS (
    SELECT id
    FROM match_results
    WHERE id = p_match_id
      AND status = 'completed'
      AND payout_processed = FALSE
      AND (outcome IS NULL OR outcome = 'pending')
      AND (settlement_state IS NULL OR settlement_state IN ('not_started', 'retry', 'failed'))
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  UPDATE match_results mr
  SET settlement_state = 'in_progress',
      settlement_claimed_at = NOW(),
      settlement_claimed_by = p_claimed_by,
      settlement_last_error = NULL
  FROM cte
  WHERE mr.id = cte.id
  RETURNING mr.*;
END;
$$;

GRANT EXECUTE ON FUNCTION claim_match_result_for_settlement(UUID, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION link_wager_deposits_to_match(
  p_match_result_id UUID,
  p_match_session_id TEXT,
  p_lobby_id TEXT,
  p_player_wallets TEXT[]
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  updated_count INT := 0;
BEGIN
  PERFORM set_config('search_path', 'public,extensions', true);
  UPDATE wager_deposits wd
  SET match_result_id = p_match_result_id,
      match_session_id = p_match_session_id
  WHERE wd.lobby_id = p_lobby_id
    AND wd.match_result_id IS NULL
    AND (
      wd.player_wallet = ANY (p_player_wallets)
      OR lower(wd.player_wallet) = ANY (
        SELECT lower(x) FROM unnest(p_player_wallets) AS x
      )
    );
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

GRANT EXECUTE ON FUNCTION link_wager_deposits_to_match(UUID, TEXT, TEXT, TEXT[]) TO service_role;

CREATE OR REPLACE FUNCTION backfill_match_results_match_session_id(p_limit INT DEFAULT 500)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  updated_count INT := 0;
BEGIN
  PERFORM set_config('search_path', 'public,extensions', true);
  WITH cte AS (
    SELECT id
    FROM match_results
    WHERE match_session_id IS NULL
      AND game_data IS NOT NULL
      AND (
        (game_data ? 'matchSessionId')
        OR (game_data ? 'match_session_id')
        OR (game_data ? 'match_sessionId')
      )
    ORDER BY updated_at DESC
    LIMIT p_limit
  )
  UPDATE match_results mr
  SET match_session_id = COALESCE(
    mr.match_session_id,
    NULLIF(mr.game_data->>'matchSessionId', ''),
    NULLIF(mr.game_data->>'match_session_id', ''),
    NULLIF(mr.game_data->>'match_sessionId', '')
  )
  FROM cte
  WHERE mr.id = cte.id;
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

GRANT EXECUTE ON FUNCTION backfill_match_results_match_session_id(INT) TO service_role;

CREATE OR REPLACE FUNCTION backfill_link_wager_deposits(p_limit_matches INT DEFAULT 200)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r RECORD;
  updated_total INT := 0;
  wallets TEXT[];
  updated_one INT := 0;
BEGIN
  PERFORM set_config('search_path', 'public,extensions', true);
  FOR r IN
    SELECT id, lobby_id, match_session_id, participants
    FROM match_results
    WHERE lobby_id IS NOT NULL
      AND match_session_id IS NOT NULL
      AND (participants IS NOT NULL)
    ORDER BY updated_at DESC
    LIMIT p_limit_matches
  LOOP
    wallets := ARRAY(
      SELECT COALESCE(elem->>'wallet', '')
      FROM jsonb_array_elements(r.participants) AS elem
      WHERE COALESCE(elem->>'wallet', '') <> ''
    );
    IF wallets IS NULL OR array_length(wallets, 1) IS NULL THEN
      CONTINUE;
    END IF;
    SELECT link_wager_deposits_to_match(r.id, r.match_session_id, r.lobby_id, wallets) INTO updated_one;
    updated_total := updated_total + COALESCE(updated_one, 0);
  END LOOP;
  RETURN updated_total;
END;
$$;

GRANT EXECUTE ON FUNCTION backfill_link_wager_deposits(INT) TO service_role;

CREATE OR REPLACE FUNCTION claim_payment_op(p_op_id TEXT, p_claimed_by TEXT, p_ttl_seconds INT DEFAULT 60)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  updated_count INT := 0;
BEGIN
  PERFORM set_config('search_path', 'public,extensions', true);
  UPDATE payments
  SET claimed_by = p_claimed_by,
      claimed_at = NOW(),
      locked_until = NOW() + make_interval(secs => p_ttl_seconds)
  WHERE op_id = p_op_id
    AND (locked_until IS NULL OR locked_until < NOW())
    AND (tx_hash IS NULL)
    AND state IN ('pending', 'in_progress', 'failed');

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count = 1;
END;
$$;

GRANT EXECUTE ON FUNCTION claim_payment_op(TEXT, TEXT, INT) TO service_role;
