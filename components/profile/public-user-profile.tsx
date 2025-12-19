"use client"

import { useEffect, useMemo, useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ExternalLink, Loader2 } from "lucide-react"

type ProfileRow = {
  wallet_address: string
  username: string
  profile_picture?: string | null
  bio?: string | null
  token_balance?: number | null
}

type MatchResultRow = {
  id: string
  lobby_id: string
  winner_wallet: string | null
  total_prize_pool: number
  match_started_at: string
  match_ended_at: string | null
  participants: any
  status: string
  payout_processed: boolean
  payout_bundle_tx_signature: string | null
  payout_tx_signature: string | null
  outcome: string | null
  settlement_state: string | null
}

type WagerDepositRow = {
  id: string
  match_result_id: string | null
  lobby_id: string
  player_wallet: string
  expected_lamports: number | string
  deposit_signature: string | null
  status: string
  created_at: string
}

type PaymentRow = {
  op_id: string
  type: string
  amount_wei: string
  wallet_lamports?: number
  tx_hash: string | null
  state: string
  match_result_id: string | null
  metadata: any
  created_at: string
}

type ApiResponse = {
  walletAddress: string
  profile: ProfileRow | null
  ledger: {
    matches: MatchResultRow[]
    deposits: WagerDepositRow[]
    payments: PaymentRow[]
  }
  stats: {
    matches: number
    depositedLamports: number
    creditedLamports: number
    payoutsLamports: number
    refundsLamports: number
    netLamports: number
  }
}

function shortWallet(w: string) {
  if (!w) return ""
  if (w.length <= 12) return w
  return `${w.slice(0, 6)}...${w.slice(-4)}`
}

function lamportsToSol(lamports: number) {
  return lamports / 1_000_000_000
}

function parseLamports(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0
  if (typeof v === "number") return Number.isFinite(v) ? v : 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function getSolscanTxUrl(sig: string): string {
  const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK || "devnet"
  const base = `https://solscan.io/tx/${encodeURIComponent(sig)}`
  if (network === "mainnet-beta" || network === "mainnet") return base
  return `${base}?cluster=${encodeURIComponent(network)}`
}

function StatCard({
  title,
  value,
  highlight,
}: {
  title: string
  value: any
  highlight?: "positive" | "negative"
}) {
  return (
    <div
      className={`rounded-lg p-4 border ${
        highlight === "positive"
          ? "border-green-600/40 bg-green-900/20"
          : highlight === "negative"
            ? "border-red-600/40 bg-red-900/20"
            : "border-white/10 bg-white/5"
      }`}
    >
      <div className="text-sm text-white/60">{title}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  )
}

export default function PublicUserProfile({ walletAddress }: { walletAddress: string }) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<ApiResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        setLoading(true)
        setError(null)
        const res = await fetch(
          `/api/public/profile/${encodeURIComponent(walletAddress)}?limitMatches=25&limitDeposits=50&limitPayments=100`,
          { method: "GET" }
        )
        if (!res.ok) {
          const j = await res.json().catch(() => null)
          throw new Error(j?.error || `Failed to load profile (${res.status})`)
        }
        const j = (await res.json()) as ApiResponse
        if (mounted) setData(j)
      } catch (e: any) {
        if (mounted) setError(e?.message || "Failed to load profile")
      } finally {
        if (mounted) setLoading(false)
      }
    }
    if (walletAddress) load()
    return () => {
      mounted = false
    }
  }, [walletAddress])

  const computed = useMemo(() => {
    const deposited = data?.stats?.depositedLamports || 0
    const credited = data?.stats?.creditedLamports || 0
    const net = data?.stats?.netLamports || 0
    const payouts = data?.stats?.payoutsLamports || 0
    const refunds = data?.stats?.refundsLamports || 0
    return {
      depositedSol: lamportsToSol(deposited),
      creditedSol: lamportsToSol(credited),
      netSol: lamportsToSol(net),
      payoutsSol: lamportsToSol(payouts),
      refundsSol: lamportsToSol(refunds),
    }
  }, [data])

  if (!walletAddress) {
    return (
      <div className="text-center py-10">
        <p className="text-xl mb-4">Missing wallet address.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-white/70" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-10">
        <p className="text-xl mb-2">Failed to load profile</p>
        <p className="text-sm text-white/60">{error}</p>
      </div>
    )
  }

  const profile = data?.profile
  const matches = data?.ledger?.matches || []
  const deposits = data?.ledger?.deposits || []
  const payments = data?.ledger?.payments || []

  return (
    <div className="bg-white/5 rounded-xl p-6 border border-white/10 backdrop-blur-md">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
        <div className="flex items-center gap-4">
          <Avatar className="h-14 w-14 ring-2 ring-white/20">
            <AvatarImage
              src={profile?.profile_picture || "/placeholder-user.jpg"}
              alt={profile?.username || "Player"}
            />
            <AvatarFallback>{(profile?.username || "P")[0]}</AvatarFallback>
          </Avatar>
          <div>
            <h2 className="text-2xl font-bold">{profile?.username || "Player"}</h2>
            <p className="text-xs text-white/60">Wallet: {shortWallet(walletAddress)}</p>
            {profile?.bio && <p className="text-xs text-white/70 mt-1 max-w-prose">{profile.bio}</p>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard title="Matches" value={data?.stats?.matches ?? matches.length} />
        <StatCard title="Wagered (SOL)" value={computed.depositedSol.toFixed(4)} />
        <StatCard title="Payouts (SOL)" value={computed.payoutsSol.toFixed(4)} />
        <StatCard
          title="Net (SOL)"
          value={computed.netSol.toFixed(4)}
          highlight={computed.netSol >= 0 ? "positive" : "negative"}
        />
      </div>

      <Tabs defaultValue="matches" className="mb-2">
        <TabsList className="bg-white/5 border border-white/10">
          <TabsTrigger value="matches" className="data-[state=active]:bg-white/10">
            Match History
          </TabsTrigger>
          <TabsTrigger value="deposits" className="data-[state=active]:bg-white/10">
            Wagers
          </TabsTrigger>
          <TabsTrigger value="payments" className="data-[state=active]:bg-white/10">
            Payouts & Refunds
          </TabsTrigger>
        </TabsList>

        <TabsContent value="matches" className="pt-4">
          <div className="bg-white/5 rounded-lg divide-y divide-white/10">
            {matches.map((m) => {
              const winner = String(m.winner_wallet || "")
              const isWin = winner && (winner === walletAddress || winner.toLowerCase() === walletAddress.toLowerCase())
              const endedAt = m.match_ended_at ? new Date(m.match_ended_at).toLocaleString() : ""
              const startedAt = m.match_started_at ? new Date(m.match_started_at).toLocaleString() : ""
              return (
                <div key={m.id} className="p-4 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className={`w-3 h-3 rounded-full ${isWin ? "bg-green-500" : "bg-red-500"}`}></div>
                    <div>
                      <div className="font-medium">Match {String(m.id).slice(0, 8)}…</div>
                      <div className="text-sm text-white/60">{endedAt || startedAt}</div>
                    </div>
                  </div>
                  <div className={isWin ? "text-green-400 font-semibold" : "text-white/60"}>
                    {isWin ? "Win" : "Loss"}
                  </div>
                </div>
              )
            })}
            {matches.length === 0 && <div className="p-3 text-sm text-white/60">No matches recorded.</div>}
          </div>
        </TabsContent>

        <TabsContent value="deposits" className="pt-4">
          <Card className="bg-white/5 border-white/10">
            <CardContent className="p-4">
              <div className="bg-white/5 rounded-lg divide-y divide-white/10">
                {deposits.map((d) => {
                  const lamports = parseLamports(d.expected_lamports)
                  const sol = lamportsToSol(lamports)
                  const t = d.created_at ? new Date(d.created_at).toLocaleString() : ""
                  const sig = String(d.deposit_signature || '').trim()
                  return (
                    <div key={d.id} className="p-3 flex items-center justify-between text-sm">
                      <div>
                        <div className="text-white/80">{d.status}</div>
                        <div className="text-xs text-white/60">{t}</div>
                        {sig && (
                          <a
                            className="text-xs text-white/60 underline inline-flex items-center gap-1"
                            href={getSolscanTxUrl(sig)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Solscan <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                      <div className="text-white/80">{sol.toFixed(4)} SOL</div>
                    </div>
                  )
                })}
                {deposits.length === 0 && <div className="p-3 text-sm text-white/60">No wagers yet.</div>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments" className="pt-4">
          <Card className="bg-white/5 border-white/10">
            <CardContent className="p-4">
              <div className="bg-white/5 rounded-lg divide-y divide-white/10">
                {payments.map((p) => {
                  const lamports = Math.max(
                    0,
                    Math.floor(Number((p as any)?.wallet_lamports ?? p.amount_wei) || 0)
                  )
                  const sol = lamportsToSol(lamports)
                  const t = p.created_at ? new Date(p.created_at).toLocaleString() : ""
                  const sig = String(p.tx_hash || '').trim()
                  return (
                    <div key={p.op_id} className="p-3 flex items-center justify-between text-sm">
                      <div>
                        <div className="text-white/80">{p.type}</div>
                        <div className="text-xs text-white/60">{t}</div>
                        <div className="text-xs text-white/50">{p.state}</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className={p.type === "refund" ? "text-green-400" : "text-white/80"}>{sol.toFixed(4)} SOL</div>
                        {sig && (
                          <a
                            className="text-xs text-white/60 underline inline-flex items-center gap-1"
                            href={getSolscanTxUrl(sig)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Solscan <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  )
                })}
                {payments.length === 0 && <div className="p-3 text-sm text-white/60">No payouts/refunds recorded yet.</div>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
