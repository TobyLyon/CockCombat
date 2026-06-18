# House-fee → $DINNER Buyback

Spends accumulated **house-fee SOL** to market-buy the project SPL token
(`$DINNER`, mint in `lib/token-config.ts`) via the **Jupiter aggregator**, and
**holds** the bought tokens in the treasury/buyback wallet (no burn).

> Status: built but **off by default**. Nothing moves funds until `BUYBACK_ENABLED=true`
> is set, the wallet key is provided, and a request is made with `{ execute: true }`.
> Review this doc + a few dry-runs before flipping it on.

## How it works

1. **Funding** — the 4% house cut already lands as SOL at settlement
   (`app/api/settlement/run/route.ts`). The buyback wallet is where that SOL
   should accumulate (provisioned via env — see below).
2. **Budget** — per run, spend `BUYBACK_SPEND_FRACTION` (default **0.9**) of the
   wallet's *spendable* SOL (`balance − BUYBACK_RESERVE_SOL`), and never more than
   the house fees actually accrued since the last buyback (estimated from settled
   matches minus prior confirmed buybacks). The remaining ~10% + reserve stays
   behind for transaction fees.
3. **Swap** — get a Jupiter quote (WSOL → `$DINNER`), build the swap tx, sign with
   the buyback wallet, send, and confirm. Jupiter wraps/unwraps SOL automatically
   and deposits `$DINNER` into the wallet's associated token account (= "held in
   treasury").
4. **Ledger** — every attempt is written to the `buyback_runs` table (status,
   SOL spent, expected out, tx signature, op_id) for audit, accrual tracking,
   idempotency, and cooldown.

## Files

- `lib/buyback-service.ts` — budget calc, Jupiter quote/swap, sign/send/confirm, ledger.
- `app/api/buyback/run/route.ts` — token-gated trigger (`GET` preview / `POST` run).
- `supabase/migrations/20260618000000_create_buyback_runs_table.sql` — ledger table
  (review + apply manually; not auto-applied).

## Environment variables

| Var | Required | Default | Purpose |
|-----|----------|---------|---------|
| `BUYBACK_WALLET_PRIVATE_KEY` | to execute | — | bs58 secret of the treasury/buyback wallet (signer) |
| `BUYBACK_WALLET_PUBLIC_KEY` | optional | — | verifies the key; enables balance preview without the secret |
| `BUYBACK_ENABLED` | to execute | `false` | `true` permits real swaps; otherwise dry-run only |
| `BUYBACK_SERVER_SECRET` | yes | falls back to `PAYOUT_SERVER_SECRET` | bearer token for the endpoint |
| `BUYBACK_SPEND_FRACTION` | no | `0.9` | fraction of spendable SOL to spend |
| `BUYBACK_RESERVE_SOL` | no | `0.05` | SOL kept back for gas/buffer |
| `BUYBACK_MIN_SOL` | no | `0.01` | skip runs below this size |
| `BUYBACK_MAX_SOL` | no | — | optional hard cap per run |
| `BUYBACK_SLIPPAGE_BPS` | no | `300` | swap slippage tolerance (3%) |
| `BUYBACK_COOLDOWN_SECONDS` | no | `60` | minimum seconds between executed runs |
| `JUPITER_API_BASE` | no | `https://quote-api.jup.ag/v6` | Jupiter API base |
| `HOUSE_CUT_PERCENTAGE` | no | `0.04` | used to estimate accrued fees |

Also uses existing `SOLANA_RPC_URL` / `NEXT_PUBLIC_SOLANA_RPC_URL` / `NEXT_PUBLIC_SOLANA_NETWORK`
and `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`.

## Runbook

**Preview (safe, never executes):**
```bash
curl -s -H "authorization: Bearer $BUYBACK_SERVER_SECRET" \
  https://<host>/api/buyback/run | jq
```
Returns wallet, balance, accrued fees, computed budget, and a live Jupiter quote
(expected `$DINNER` out, price impact).

**Execute (only after `BUYBACK_ENABLED=true` and review):**
```bash
curl -s -X POST -H "authorization: Bearer $BUYBACK_SERVER_SECRET" \
  -H "content-type: application/json" -d '{"execute":true}' \
  https://<host>/api/buyback/run | jq
```

## Safety properties

- **Dry-run by default** — execution requires `BUYBACK_ENABLED=true` **and**
  `{ execute: true }` **and** a loaded signing key. Any missing piece → preview only.
- **Degrades safely** before the wallet exists — returns a clear "not configured"
  response; never throws or moves funds.
- **Self-limiting budget** — capped by both spendable balance and accrued fees;
  optional `BUYBACK_MAX_SOL` hard cap.
- **No double-spend** — in-process single-flight lock + DB cooldown + per-run
  unique `op_id`; each confirmed run reduces future accrued budget.
- **Confirmation-gated ledger** — a run is marked `confirmed` only after on-chain
  confirmation; otherwise `failed`.

## Open items / scheduler (later)

- A scheduler (cron/interval) is intentionally **not** wired up yet ("manual now,
  scheduler later"). When ready, call `runBuyback({ execute: true })` from an
  interval guarded by `BUYBACK_ENABLED`.
- Single-replica assumption: the in-process lock is sufficient today (one Railway
  replica). If scaled out, add a DB advisory lock around execution.
- `actual_out_raw` is left for optional backfill from the confirmed tx; the quote's
  `expected_out_raw` is always recorded.
