# Cock Combat — Validation Runbook (Launch-Readiness)

This runbook is designed to validate **real-money SOL wagering integrity** and multiplayer reliability before enabling production stakes.

## 0) Safety prerequisites

- **Use a test Supabase project** for all validations.
- **Never** run smoke tests with real escrow keys unless you intend to pay real funds.
- For automated smoke tests:
  - `SOLANA_PAYMENTS_DRY_RUN=true`
  - `TEST_CONTROL_TOKEN=<random secret>`
  - `NODE_ENV=development`

## 1) Environment checklist

- **Backend**
  - `NEXT_PUBLIC_APP_URL` set to your server origin in production.
  - `PAYOUT_SERVER_SECRET` set.
  - `REFUND_SERVER_TOKEN` set.
  - `NEXT_PUBLIC_SUPABASE_URL` set.
  - `SUPABASE_SERVICE_ROLE_KEY` set.

- **Solana**
  - `NEXT_PUBLIC_SOLANA_NETWORK` correct (`devnet` for staging).
  - `NEXT_PUBLIC_SOLANA_RPC_URL` set to a reliable RPC.
  - `ESCROW_WALLET_A_PUBLIC_KEY` / `_PRIVATE_KEY` etc configured.

- **Database**
  - Run migrations including:
    - `used_signatures`, `auth_sessions`, `match_results` (already present)
    - `payments`, `escrow_wallets` (added: `20251217000000_create_payments_table.sql`)

## 2) Invariants (must always hold)

- **I1 — Escrow binding**
  - A paid match has an `escrow_wallet_id` and payout/refund uses that escrow.

- **I2 — Replay protection**
  - A wager confirm signature cannot be confirmed twice.
  - If Supabase is unavailable, wager confirmation fails closed.

- **I3 — Exactly-once settlement**
  - Payout/refund operations are idempotent via `payments(op_id)`.

- **I4 — Server authoritative settlement**
  - Clients cannot trigger payout.
  - Server determines winner from authoritative HP (`matchStateBySession.hp`).

## 3) Automated smoke tests

### 3.1 Socket wiring smoke test (existing)

Run:

```bash
node scripts/integration.test.js
```

Expected:
- Both sockets connect.
- `lobby_updated` events are received.

### 3.2 Money-path smoke test (new)

Run with:

```bash
set TEST_CONTROL_TOKEN=yourtoken
set SOLANA_PAYMENTS_DRY_RUN=true
node scripts/money-path-smoke.test.js
```

Expected:
- Receives `arena_match_ended` with winner equal to the canonical wallet string.
- Server calls payout path internally (dry-run only). If Supabase is configured, a `payments` row should exist.

Failure triage:
- No `arena_match_ended`:
  - Confirm server is not `NODE_ENV=production`.
  - Confirm `TEST_CONTROL_TOKEN` matches.

## 4) Manual production readiness scenarios

### 4.1 Wager confirm correctness

Scenario:
- Create a wager tx from `/api/wager`.
- Confirm via `/api/wager/confirm`.

Expected:
- Confirm rejects if recipient escrow is not assigned.
- Confirm rejects on replay.

### 4.2 Queue handshake under latency

Scenario:
- Use throttling (Chrome devtools) to simulate 500ms–2s RTT.

Expected:
- Players aren’t incorrectly refunded if they ack within the configured deadline.

### 4.3 Server restart mid-match

Scenario:
- Start a match, restart server.

Expected:
- Match does not pay incorrectly.
- Reconciliation job does not double-pay.

### 4.4 Double payout attempt

Scenario:
- Trigger payout reconciliation + live payout path around the same time.

Expected:
- Only one payout tx (idempotency).

## 5) Launch checklist (go/no-go)

- [ ] `payments` table exists and RLS policies correct.
- [ ] `used_signatures` exists and server fails closed on errors.
- [ ] Paid matches always have `escrow_wallet_id`.
- [ ] Client cannot trigger payouts.
- [ ] Reconcile job is safe under retries.
- [ ] Monitoring alerts enabled for escrow low balance and large payouts.
