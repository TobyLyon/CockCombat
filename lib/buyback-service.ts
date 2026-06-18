/**
 * Token Buyback Service (Solana)
 * ------------------------------
 * Uses accumulated house-fee SOL to market-buy the project SPL token ($DINNER)
 * via the Jupiter aggregator, and HOLDS the bought tokens in the treasury wallet
 * (no burn). Designed to be reviewed before going live:
 *
 *   - Dry-run by default. Real swaps only fire when BOTH `BUYBACK_ENABLED=true`
 *     and the caller explicitly passes `execute: true`.
 *   - The signing wallet is fully env-driven (key provisioned separately), and
 *     the service degrades safely (clear "not configured" responses) until the
 *     wallet env vars are present — nothing throws or moves funds prematurely.
 *   - Every run is recorded in the `buyback_runs` table for audit + idempotency,
 *     with an in-process single-flight guard and a cooldown to prevent
 *     double-spends from rapid/concurrent triggers.
 *
 * Budget model (per the product decision "90% of accrued house fees, leave the
 * rest for fees"): spend `BUYBACK_SPEND_FRACTION` (default 0.9) of the wallet's
 * spendable SOL (balance minus a gas reserve), and never more than the house
 * fees actually accrued since the last buyback. The remaining ~10% + reserve
 * stays behind to cover transaction fees.
 *
 * Env vars (see also docs/buyback.md):
 *   BUYBACK_WALLET_PRIVATE_KEY  bs58 secret key of the treasury/buyback wallet (required to EXECUTE)
 *   BUYBACK_WALLET_PUBLIC_KEY   optional; verifies the key and enables balance preview without the secret
 *   BUYBACK_ENABLED             'true' to permit real swaps (default: dry-run only)
 *   BUYBACK_SPEND_FRACTION      fraction of spendable SOL to spend (default 0.9)
 *   BUYBACK_RESERVE_SOL         SOL kept back for gas/buffer (default 0.05)
 *   BUYBACK_MIN_SOL             skip runs below this size (default 0.01)
 *   BUYBACK_MAX_SOL             optional hard cap per run
 *   BUYBACK_SLIPPAGE_BPS        swap slippage tolerance in bps (default 300 = 3%)
 *   BUYBACK_COOLDOWN_SECONDS    minimum seconds between executed runs (default 60)
 *   JUPITER_API_BASE            Jupiter API base (default https://quote-api.jup.ag/v6)
 *   HOUSE_CUT_PERCENTAGE        used to estimate accrued fees from settled matches (default 0.04)
 */

import { Connection, Keypair, PublicKey, VersionedTransaction, LAMPORTS_PER_SOL, clusterApiUrl } from '@solana/web3.js'
import bs58 from 'bs58'
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { TOKEN_MINT } from './token-config'

// Native SOL is swapped via wrapped SOL on Jupiter.
const WSOL_MINT = 'So11111111111111111111111111111111111111112'

export interface BuybackConfig {
  spendFraction: number
  reserveLamports: number
  minLamports: number
  maxLamports: number | null
  slippageBps: number
  cooldownSeconds: number
  jupiterBase: string
  enabled: boolean
  houseCutPercentage: number
}

export interface BuybackPreview {
  configured: boolean
  enabled: boolean
  wallet: string | null
  inputMint: string
  outputMint: string
  balanceSol: number | null
  accruedFeesSol: number | null
  budgetSol: number
  budgetLamports: number
  reason?: string
  quote?: {
    inLamports: number
    outRaw: string
    outUi: number | null
    priceImpactPct: number | null
    slippageBps: number
  } | null
}

export interface BuybackResult extends BuybackPreview {
  executed: boolean
  dryRun: boolean
  txSignature?: string | null
  runId?: string | null
  error?: string | null
}

function num(env: string | undefined, fallback: number): number {
  const v = Number(env)
  return Number.isFinite(v) ? v : fallback
}

export function getBuybackConfig(): BuybackConfig {
  const spendFraction = Math.min(1, Math.max(0, num(process.env.BUYBACK_SPEND_FRACTION, 0.9)))
  const reserveSol = Math.max(0, num(process.env.BUYBACK_RESERVE_SOL, 0.05))
  const minSol = Math.max(0, num(process.env.BUYBACK_MIN_SOL, 0.01))
  const maxSolRaw = process.env.BUYBACK_MAX_SOL
  const maxSol = maxSolRaw && Number.isFinite(Number(maxSolRaw)) ? Math.max(0, Number(maxSolRaw)) : null
  const slippageBps = Math.max(1, Math.floor(num(process.env.BUYBACK_SLIPPAGE_BPS, 300)))
  const cooldownSeconds = Math.max(0, Math.floor(num(process.env.BUYBACK_COOLDOWN_SECONDS, 60)))
  const jupiterBase = (process.env.JUPITER_API_BASE || 'https://quote-api.jup.ag/v6').replace(/\/$/, '')
  const enabled = String(process.env.BUYBACK_ENABLED || '').toLowerCase() === 'true'
  const houseCutPercentage = Math.min(1, Math.max(0, num(process.env.HOUSE_CUT_PERCENTAGE, 0.04)))
  return {
    spendFraction,
    reserveLamports: Math.floor(reserveSol * LAMPORTS_PER_SOL),
    minLamports: Math.floor(minSol * LAMPORTS_PER_SOL),
    maxLamports: maxSol === null ? null : Math.floor(maxSol * LAMPORTS_PER_SOL),
    slippageBps,
    cooldownSeconds,
    jupiterBase,
    enabled,
    houseCutPercentage,
  }
}

function getConnection(): Connection {
  const network = (process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet') as 'devnet' | 'testnet' | 'mainnet-beta'
  const base = process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl(network)
  return new Connection(base, 'confirmed')
}

/**
 * Load the buyback signer. Returns null (never throws) when the key is absent or
 * malformed so dry-run/preview paths keep working before the wallet is set up.
 */
export function loadBuybackKeypair(): Keypair | null {
  try {
    const sk = process.env.BUYBACK_WALLET_PRIVATE_KEY
    if (!sk || !sk.trim()) return null
    const kp = Keypair.fromSecretKey(bs58.decode(sk.trim()))
    const expected = process.env.BUYBACK_WALLET_PUBLIC_KEY
    if (expected && expected.trim() && kp.publicKey.toBase58() !== expected.trim()) {
      console.error('❌ BUYBACK_WALLET_PRIVATE_KEY does not match BUYBACK_WALLET_PUBLIC_KEY')
      return null
    }
    return kp
  } catch (e) {
    console.error('❌ Failed to load buyback keypair:', (e as any)?.message || e)
    return null
  }
}

/** Public key for the buyback wallet from the secret, or the declared public key. */
export function getBuybackPublicKey(): PublicKey | null {
  const kp = loadBuybackKeypair()
  if (kp) return kp.publicKey
  try {
    const pk = process.env.BUYBACK_WALLET_PUBLIC_KEY
    if (pk && pk.trim()) return new PublicKey(pk.trim())
  } catch {}
  return null
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  try {
    return createClient(url, key)
  } catch {
    return null
  }
}

/**
 * Estimate house fees accrued (in SOL) that have NOT yet been spent on buybacks.
 * Derived from settled matches (total_prize_pool * houseCutPercentage) minus the
 * sum of confirmed buyback spends. Returns null when it can't be computed (so the
 * caller falls back to the balance-only budget rather than blocking).
 */
async function getAccruedFeesSol(supabase: any, houseCutPercentage: number): Promise<number | null> {
  if (!supabase) return null
  try {
    // Sum house cut across settled/paid matches.
    const { data: matches, error: mErr } = await supabase
      .from('match_results')
      .select('total_prize_pool, outcome, payout_processed')
      .eq('payout_processed', true)
      .eq('outcome', 'settled')
      .limit(100000)
    if (mErr) return null
    let earned = 0
    for (const m of Array.isArray(matches) ? matches : []) {
      const pool = Number((m as any)?.total_prize_pool || 0)
      if (Number.isFinite(pool) && pool > 0) earned += pool * houseCutPercentage
    }

    // Subtract what we've already spent on confirmed buybacks.
    const { data: runs } = await supabase
      .from('buyback_runs')
      .select('sol_spent, status')
      .eq('status', 'confirmed')
      .limit(100000)
    let spent = 0
    for (const r of Array.isArray(runs) ? runs : []) {
      const s = Number((r as any)?.sol_spent || 0)
      if (Number.isFinite(s) && s > 0) spent += s
    }

    return Math.max(0, earned - spent)
  } catch {
    return null
  }
}

async function jupiterQuote(base: string, inLamports: number, slippageBps: number): Promise<any | null> {
  try {
    const url =
      `${base}/quote?inputMint=${WSOL_MINT}&outputMint=${encodeURIComponent(TOKEN_MINT)}` +
      `&amount=${inLamports}&slippageBps=${slippageBps}&swapMode=ExactIn&onlyDirectRoutes=false`
    const res = await fetch(url, { headers: { accept: 'application/json' } })
    if (!res.ok) {
      console.warn('[buyback] jupiter quote failed', res.status, await res.text().catch(() => ''))
      return null
    }
    return await res.json()
  } catch (e) {
    console.warn('[buyback] jupiter quote error', (e as any)?.message || e)
    return null
  }
}

async function jupiterSwapTx(base: string, quoteResponse: any, userPublicKey: string): Promise<string | null> {
  try {
    const res = await fetch(`${base}/swap`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        quoteResponse,
        userPublicKey,
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: 'auto',
      }),
    })
    if (!res.ok) {
      console.warn('[buyback] jupiter swap build failed', res.status, await res.text().catch(() => ''))
      return null
    }
    const json = await res.json()
    return json?.swapTransaction || null
  } catch (e) {
    console.warn('[buyback] jupiter swap build error', (e as any)?.message || e)
    return null
  }
}

async function getTokenDecimals(connection: Connection): Promise<number | null> {
  try {
    const { getMint } = await import('@solana/spl-token')
    const mint = await getMint(connection, new PublicKey(TOKEN_MINT))
    return mint.decimals
  } catch {
    return null
  }
}

// Single-flight guard so concurrent triggers can't both spend.
function inFlight(): Map<string, Promise<any>> {
  ;(global as any).__buybackInFlight = (global as any).__buybackInFlight || new Map<string, Promise<any>>()
  return (global as any).__buybackInFlight
}

/**
 * Run (or preview) a buyback. `execute` only matters when BUYBACK_ENABLED=true;
 * otherwise the function always returns a dry-run preview and never signs.
 */
export async function runBuyback(opts: { execute?: boolean } = {}): Promise<BuybackResult> {
  const cfg = getBuybackConfig()
  const connection = getConnection()
  const supabase = getSupabase()
  const pubkey = getBuybackPublicKey()
  const keypair = loadBuybackKeypair()

  const base: BuybackResult = {
    configured: Boolean(pubkey),
    enabled: cfg.enabled,
    wallet: pubkey ? pubkey.toBase58() : null,
    inputMint: WSOL_MINT,
    outputMint: TOKEN_MINT,
    balanceSol: null,
    accruedFeesSol: null,
    budgetSol: 0,
    budgetLamports: 0,
    quote: null,
    executed: false,
    dryRun: true,
    txSignature: null,
    runId: null,
    error: null,
  }

  if (!pubkey) {
    return { ...base, reason: 'buyback wallet not configured (set BUYBACK_WALLET_PRIVATE_KEY or BUYBACK_WALLET_PUBLIC_KEY)' }
  }

  // Compute budget: 90% of spendable balance, capped by accrued fees.
  let balanceLamports = 0
  try {
    balanceLamports = await connection.getBalance(pubkey)
  } catch (e) {
    return { ...base, reason: `failed to read wallet balance: ${(e as any)?.message || e}` }
  }
  const balanceSol = balanceLamports / LAMPORTS_PER_SOL

  const accruedFeesSol = await getAccruedFeesSol(supabase, cfg.houseCutPercentage)

  const spendableLamports = Math.max(0, balanceLamports - cfg.reserveLamports)
  let budgetLamports = Math.floor(spendableLamports * cfg.spendFraction)
  // Cap by accrued fees (don't spend more than house fees actually earned).
  if (accruedFeesSol !== null) {
    budgetLamports = Math.min(budgetLamports, Math.floor(accruedFeesSol * LAMPORTS_PER_SOL))
  }
  // Optional hard cap per run.
  if (cfg.maxLamports !== null) budgetLamports = Math.min(budgetLamports, cfg.maxLamports)
  budgetLamports = Math.max(0, budgetLamports)

  const previewBase: BuybackResult = {
    ...base,
    balanceSol,
    accruedFeesSol,
    budgetSol: budgetLamports / LAMPORTS_PER_SOL,
    budgetLamports,
  }

  if (budgetLamports < cfg.minLamports || budgetLamports <= 0) {
    return {
      ...previewBase,
      reason: `budget ${budgetLamports / LAMPORTS_PER_SOL} SOL below minimum ${cfg.minLamports / LAMPORTS_PER_SOL} SOL`,
    }
  }

  // Always fetch a quote for preview + execution.
  const quote = await jupiterQuote(cfg.jupiterBase, budgetLamports, cfg.slippageBps)
  if (!quote || !quote.outAmount) {
    return { ...previewBase, reason: 'failed to get Jupiter quote' }
  }
  const decimals = await getTokenDecimals(connection)
  const outRaw = String(quote.outAmount)
  const outUi = decimals !== null ? Number(outRaw) / Math.pow(10, decimals) : null
  const priceImpactPct = quote.priceImpactPct !== undefined ? Number(quote.priceImpactPct) : null
  const quoteSummary = { inLamports: budgetLamports, outRaw, outUi, priceImpactPct, slippageBps: cfg.slippageBps }

  const wantExecute = Boolean(opts.execute)
  // Hard gate: never sign unless explicitly enabled AND requested AND we hold the key.
  if (!wantExecute || !cfg.enabled || !keypair) {
    const reason = !keypair
      ? 'dry-run: signing key not available (BUYBACK_WALLET_PRIVATE_KEY not set)'
      : !cfg.enabled
        ? 'dry-run: BUYBACK_ENABLED is not true'
        : 'dry-run: execute flag not set'
    return { ...previewBase, quote: quoteSummary, dryRun: true, reason }
  }

  // ---- Live execution path ----
  const opId = `buyback:${Date.now()}:${crypto.randomBytes(6).toString('hex')}`

  const exec = async (): Promise<BuybackResult> => {
    // Cooldown: refuse if a confirmed/submitted run happened too recently.
    if (supabase && cfg.cooldownSeconds > 0) {
      try {
        const cutoff = new Date(Date.now() - cfg.cooldownSeconds * 1000).toISOString()
        const { data: recent } = await supabase
          .from('buyback_runs')
          .select('id, created_at, status')
          .in('status', ['submitted', 'confirmed', 'pending'])
          .gte('created_at', cutoff)
          .limit(1)
        if (Array.isArray(recent) && recent.length > 0) {
          return { ...previewBase, quote: quoteSummary, dryRun: false, reason: 'cooldown active; another run happened recently' }
        }
      } catch {}
    }

    // Record a pending run (idempotency via unique op_id).
    let runId: string | null = null
    if (supabase) {
      try {
        const { data: ins, error: insErr } = await supabase
          .from('buyback_runs')
          .insert({
            status: 'pending',
            wallet_address: pubkey.toBase58(),
            input_mint: WSOL_MINT,
            output_mint: TOKEN_MINT,
            sol_spent: budgetLamports / LAMPORTS_PER_SOL,
            lamports_spent: budgetLamports,
            expected_out_raw: outRaw,
            token_decimals: decimals,
            slippage_bps: cfg.slippageBps,
            price_impact_pct: priceImpactPct,
            op_id: opId,
            metadata: { route: quote?.routePlan ? quote.routePlan.length : null },
          })
          .select('id')
          .single()
        if (insErr) {
          return { ...previewBase, quote: quoteSummary, dryRun: false, error: `failed to record run: ${insErr.message}` }
        }
        runId = ins?.id || null
      } catch (e) {
        return { ...previewBase, quote: quoteSummary, dryRun: false, error: `failed to record run: ${(e as any)?.message || e}` }
      }
    }

    // Build, sign, send, confirm.
    try {
      const swapB64 = await jupiterSwapTx(cfg.jupiterBase, quote, pubkey.toBase58())
      if (!swapB64) throw new Error('failed to build swap transaction')
      const tx = VersionedTransaction.deserialize(Buffer.from(swapB64, 'base64'))
      tx.sign([keypair])

      const raw = tx.serialize()
      const sig = await connection.sendRawTransaction(raw, { skipPreflight: false, maxRetries: 3 })

      if (supabase && runId) {
        try { await supabase.from('buyback_runs').update({ status: 'submitted', tx_signature: sig }).eq('id', runId) } catch {}
      }

      // Confirm (poll up to ~60s).
      const confirmed = await (async () => {
        const start = Date.now()
        while (Date.now() - start < 60000) {
          try {
            const st = await connection.getSignatureStatus(sig, { searchTransactionHistory: true })
            const v = st?.value
            if (v) {
              if (v.err) return false
              if (v.confirmationStatus === 'confirmed' || v.confirmationStatus === 'finalized') return true
            }
          } catch {}
          await new Promise((r) => setTimeout(r, 1500))
        }
        return false
      })()

      if (supabase && runId) {
        try {
          await supabase
            .from('buyback_runs')
            .update({ status: confirmed ? 'confirmed' : 'failed', tx_signature: sig, error: confirmed ? null : 'not confirmed within timeout' })
            .eq('id', runId)
        } catch {}
      }

      if (!confirmed) {
        return { ...previewBase, quote: quoteSummary, dryRun: false, executed: true, txSignature: sig, runId, error: 'swap not confirmed within timeout' }
      }

      console.log('[buyback] executed', { sig, budgetSol: budgetLamports / LAMPORTS_PER_SOL, outRaw })
      return { ...previewBase, quote: quoteSummary, dryRun: false, executed: true, txSignature: sig, runId, error: null }
    } catch (e) {
      const msg = (e as any)?.message || String(e)
      if (supabase && runId) {
        try { await supabase.from('buyback_runs').update({ status: 'failed', error: msg }).eq('id', runId) } catch {}
      }
      return { ...previewBase, quote: quoteSummary, dryRun: false, executed: false, runId, error: msg }
    }
  }

  const fl = inFlight()
  const lockKey = `buyback:${pubkey.toBase58()}`
  if (fl.has(lockKey)) {
    return { ...previewBase, quote: quoteSummary, dryRun: false, reason: 'another buyback run is in progress' }
  }
  const p = exec()
  fl.set(lockKey, p)
  try {
    return await p
  } finally {
    try { if (fl.get(lockKey) === p) fl.delete(lockKey) } catch {}
  }
}
