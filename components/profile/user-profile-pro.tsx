"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useWallet } from "@/hooks/use-wallet"
import { useUsername, getDisplayName } from "@/hooks/use-username"
import { ProfileService } from "@/lib/profile-service"
// Solana-specific polling removed for EVM-only build
import type { Profile, Transaction, Match } from "@/lib/supabase"
import { supabase } from "@/lib/supabase"
import { toast } from "sonner"
import { Loader2, Pencil, Upload, ExternalLink } from "lucide-react"
import { getEvmExplorerUrl } from "@/lib/evm-config"
import { useAuth } from "@/contexts/AuthContext"

type WagerDepositRow = {
  id: string
  intent_id?: string
  match_result_id?: string | null
  match_session_id?: string | null
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
  match_result_id?: string | null
  match_session_id?: string | null
  metadata: any
  created_at: string
}

export default function UserProfilePro() {
  const { connected, publicKey } = useWallet()
  const { sessionId, signIn } = useAuth()
  const walletAddress = typeof publicKey === 'string'
    ? publicKey
    : (publicKey && typeof (publicKey as any).toBase58 === 'function'
        ? (publicKey as any).toBase58()
        : (publicKey?.toString?.() || ''))

  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<Profile | null>(null)
  const username = useUsername(walletAddress)
  const [matches, setMatches] = useState<Match[]>([])
  const [txs, setTxs] = useState<Transaction[]>([])
  const [ledgerDeposits, setLedgerDeposits] = useState<WagerDepositRow[]>([])
  const [ledgerPayments, setLedgerPayments] = useState<PaymentRow[]>([])

  const [editOpen, setEditOpen] = useState(false)
  const [editName, setEditName] = useState("")
  const [editPfp, setEditPfp] = useState("")
  const [editBio, setEditBio] = useState("")
  const [saving, setSaving] = useState(false)
  const [uploadingPfp, setUploadingPfp] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const solscanTxUrl = (sig: string) => {
    const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK || "devnet"
    const base = `https://solscan.io/tx/${encodeURIComponent(sig)}`
    if (network === "mainnet-beta" || network === "mainnet") return base
    return `${base}?cluster=${encodeURIComponent(network)}`
  }

  const txUrl = (hashOrSig: string) => {
    const h = String(hashOrSig || "").trim()
    if (!h) return ""
    if (h.startsWith("0x")) return getEvmExplorerUrl(h)
    return solscanTxUrl(h)
  }

  const getTxHashOrSig = (t: any): string => {
    try {
      const candidates = [
        t?.blockchain_signature,
        t?.tx_hash,
        t?.deposit_signature,
        t?.signature,
        t?.metadata?.tx_hash,
        t?.metadata?.signature,
      ]
      for (const c of candidates) {
        const v = String(c || '').trim()
        if (v) return v
      }
    } catch {}
    return ''
  }

  const lamportsToSol = (lamports: number) => lamports / 1_000_000_000

  const parseLamports = (v: number | string | null | undefined): number => {
    if (v === null || v === undefined) return 0
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }

  useEffect(() => {
    const load = async () => {
      if (!connected || !walletAddress) return
      setLoading(true)
      try {
        const [profileRes, matchRes, txRes, ledgerRes] = await Promise.all([
          fetch(`/api/profile/${encodeURIComponent(walletAddress)}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
          }),
          fetch(`/api/profile/${encodeURIComponent(walletAddress)}/match`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
          }),
          fetch(`/api/profile/${encodeURIComponent(walletAddress)}/transactions?limit=50`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
          }),
          fetch(
            `/api/public/profile/${encodeURIComponent(walletAddress)}?limitMatches=25&limitDeposits=50&limitPayments=100`,
            { method: 'GET' }
          ),
        ])

        if (profileRes.status === 404) {
          setProfile(null)
          setMatches([])
          setTxs([])
          return
        }

        if (!profileRes.ok) {
          const err = await profileRes.json().catch(() => ({}))
          throw new Error(err?.error || 'Failed to load profile')
        }

        const p = await profileRes.json().catch(() => null)
        setProfile(p)
        setEditName(p?.username || "")
        setEditPfp(p?.profile_picture || "")
        setEditBio(p?.bio || "")

        if (matchRes.ok) {
          const mh = await matchRes.json().catch(() => [])
          setMatches(Array.isArray(mh) ? mh : [])
        } else {
          setMatches([])
        }

        if (txRes.ok) {
          const th = await txRes.json().catch(() => [])
          setTxs(Array.isArray(th) ? th : [])
        } else {
          setTxs([])
        }

        if (ledgerRes.ok) {
          const ledgerJson = await ledgerRes.json().catch(() => null)
          const deposits = ledgerJson?.ledger?.deposits
          const payments = ledgerJson?.ledger?.payments
          setLedgerDeposits(Array.isArray(deposits) ? deposits : [])
          setLedgerPayments(Array.isArray(payments) ? payments : [])
        } else {
          setLedgerDeposits([])
          setLedgerPayments([])
        }
      } catch (e:any) {
        toast.error(e?.message || 'Failed to load profile')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [connected, walletAddress])

  // EVM-only view: omit on-chain polling here

  // EVM-only: disable Solana balance polling UI

  const computed = useMemo(() => {
    const totalWagered = profile?.total_wagered ?? txs.filter(t => t.transaction_type === 'wager').reduce((s,t)=> s + Math.abs(t.amount), 0)
    const totalWon = profile?.total_tokens_won ?? txs.filter(t => t.transaction_type === 'win').reduce((s,t)=> s + Math.max(0,t.amount), 0)
    const totalLost = profile?.total_tokens_lost ?? txs.filter(t => t.transaction_type === 'wager').reduce((s,t)=> s + Math.max(0, Math.abs(t.amount)), 0)
    const totalMatches = profile?.total_matches ?? matches.length
    const wins = profile?.wins ?? matches.filter(m => m.winner_wallet === walletAddress).length
    const losses = profile?.losses ?? Math.max(0, totalMatches - wins)
    const winRate = totalMatches > 0 ? Math.round((wins/totalMatches)*100) : 0
    const net = (totalWon - totalLost)
    return { totalWagered, totalWon, totalLost, totalMatches, wins, losses, winRate, net }
  }, [profile, txs, matches, walletAddress])

  const onSaveProfile = async () => {
    if (!walletAddress) return
    setSaving(true)
    try {
      const sid = sessionId || (await signIn())
      if (!sid) {
        return
      }

      const name = (editName || '').trim()
      if (name.length > 20) {
        toast.error('Username must be 20 characters or fewer')
        setSaving(false)
        return
      }
      if (name && name.length < 3) {
        toast.error('Username must be at least 3 characters long')
        setSaving(false)
        return
      }
      const res = await fetch(`/api/profile/${encodeURIComponent(walletAddress)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sid,
          username: name || profile?.username,
          profile_picture: editPfp.trim() || null,
          bio: editBio.trim() || null,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error || 'Failed to update profile')
      }

      const updated = await res.json().catch(() => null)
      if (updated) {
        setProfile(updated)
        toast.success('Profile updated')
        setEditOpen(false)
      } else {
        toast.error('Failed to update profile')
      }
    } catch (e:any) {
      toast.error(e?.message || 'Failed to update')
    } finally {
      setSaving(false)
    }
  }

  if (!connected) {
    return (
      <div className="text-center py-10">
        <p className="text-xl mb-4">Please connect your wallet to view your profile.</p>
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

  return (
    <div className="bg-white/5 rounded-xl p-6 border border-white/10 backdrop-blur-md">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
        <div className="flex items-center gap-4">
          <Avatar className="h-14 w-14 ring-2 ring-white/20">
            <AvatarImage src={profile?.profile_picture || "/placeholder-user.jpg"} alt={profile?.username || "Player"} />
            <AvatarFallback>{(profile?.username || 'P')[0]}</AvatarFallback>
          </Avatar>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold">{getDisplayName(profile?.username || username, walletAddress)}</h2>
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} className="h-7 px-2 text-xs">
                <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
              </Button>
            </div>
            <p className="text-xs text-white/60">Wallet: {walletAddress.slice(0,6)}...{walletAddress.slice(-4)}</p>
            {profile?.bio && <p className="text-xs text-white/70 mt-1 max-w-prose">{profile.bio}</p>}
          </div>
        </div>
        <div className="mt-4 md:mt-0 flex items-center gap-3">
          <div className="bg-white/5 px-3 py-1.5 rounded-lg border border-white/10">
            <span className="text-white font-semibold">{(profile?.token_balance ?? 0).toLocaleString()} $COCK</span>
          </div>
          {/* EVM-only build: remove Solana token balance display */}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard title="Matches" value={computed.totalMatches} />
        <StatCard title="Win Rate" value={`${computed.winRate}%`} />
        <StatCard title="Wagered" value={`${computed.totalWagered}`} />
        <StatCard title="Net" value={`${computed.net}`} highlight={computed.net >= 0 ? 'positive' : 'negative'} />
      </div>

      <Tabs defaultValue="overview" className="mb-2">
        <TabsList className="bg-white/5 border border-white/10">
          <TabsTrigger value="overview" className="data-[state=active]:bg-white/10">Overview</TabsTrigger>
          <TabsTrigger value="history" className="data-[state=active]:bg-white/10">Match History</TabsTrigger>
          <TabsTrigger value="transactions" className="data-[state=active]:bg-white/10">Transactions</TabsTrigger>
          <TabsTrigger value="ledger" className="data-[state=active]:bg-white/10">Ledger</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="pt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="bg-white/5 border-white/10">
              <CardContent className="p-4">
                <h3 className="text-sm text-white/80 mb-3">Recent Matches</h3>
                <div className="bg-white/5 rounded-lg divide-y divide-white/10">
                  {matches.slice(0,5).map((m) => (
                    <HistoryItem key={m.id} result={m.winner_wallet === walletAddress ? 'win':'loss'} fighter={''} opponent={''} reward={0} date={new Date(m.match_timestamp).toLocaleString()} />
                  ))}
                  {matches.length === 0 && <div className="p-3 text-sm text-white/60">No matches yet.</div>}
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white/5 border-white/10">
              <CardContent className="p-4">
                <h3 className="text-sm text-white/80 mb-3">Recent Transactions</h3>
                <div className="bg-white/5 rounded-lg divide-y divide-white/10">
                  {txs.slice(0,5).map(t => (
                    <div key={t.id} className="p-3 flex items-center justify-between text-sm">
                      <div className="min-w-0">
                        <div className="text-white/80 truncate">{t.description || t.transaction_type}</div>
                        {getTxHashOrSig(t) && (
                          <a
                            className="text-xs text-white/60 underline inline-flex items-center gap-1"
                            href={txUrl(getTxHashOrSig(t))}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Explorer <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                      <div className={t.amount >= 0 ? 'text-green-400' : 'text-red-400'}>{t.amount >= 0 ? '+' : ''}{t.amount}</div>
                    </div>
                  ))}
                  {txs.length === 0 && <div className="p-3 text-sm text-white/60">No transactions yet.</div>}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="history" className="pt-4">
          <div className="bg-white/5 rounded-lg divide-y divide-white/10">
            {matches.slice(0,10).map((m) => (
              <HistoryItem key={m.id} result={m.winner_wallet === walletAddress ? 'win':'loss'} fighter={''} opponent={''} reward={0} date={new Date(m.match_timestamp).toLocaleString()} />
            ))}
            {matches.length === 0 && <div className="p-3 text-sm text-white/60">No matches recorded.</div>}
          </div>
        </TabsContent>

        <TabsContent value="transactions" className="pt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="bg-white/5 border-white/10">
              <CardContent className="p-4">
                <h3 className="text-sm text-white/80 mb-3">Wagers & Results</h3>
                <div className="bg-white/5 rounded-lg divide-y divide-white/10">
                  {txs.map(t => (
                    <div key={t.id} className="p-3 flex items-center justify-between text-sm">
                      <div className="min-w-0">
                        <div className="text-white/80 truncate">{t.description || t.transaction_type}</div>
                        {getTxHashOrSig(t) && (
                          <a
                            className="text-xs text-white/60 underline inline-flex items-center gap-1"
                            href={txUrl(getTxHashOrSig(t))}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Explorer <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                      <div className={t.amount >= 0 ? 'text-green-400' : 'text-red-400'}>{t.amount >= 0 ? '+' : ''}{t.amount}</div>
                    </div>
                  ))}
                  {txs.length === 0 && <div className="p-3 text-sm text-white/60">No transactions yet.</div>}
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white/5 border-white/10">
              <CardContent className="p-4">
                <h3 className="text-sm text-white/80 mb-3">On-chain Payouts (Solana)</h3>
                <div className="bg-white/5 rounded-lg divide-y divide-white/10">
                  {matches.filter(m => m.winner_wallet === walletAddress && (m as any)?.metadata?.payout_tx).map((m) => {
                    const hash = (m as any).metadata.payout_tx as string
                    return (
                      <div key={m.id} className="p-3 flex items-center justify-between text-sm">
                        <div className="text-white/80">Match {m.id?.toString().slice(0,8)}…</div>
                        <a
                          className="text-white/70 underline inline-flex items-center gap-1"
                          href={solscanTxUrl(hash)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {hash.slice(0, 8)}… <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    )
                  })}
                  {matches.filter(m => m.winner_wallet === walletAddress && (m as any)?.metadata?.payout_tx).length === 0 && (
                    <div className="p-3 text-sm text-white/60">No on-chain payouts recorded yet.</div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="ledger" className="pt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="bg-white/5 border-white/10">
              <CardContent className="p-4">
                <h3 className="text-sm text-white/80 mb-3">Wagers & Intents</h3>
                <div className="bg-white/5 rounded-lg divide-y divide-white/10">
                  {ledgerDeposits.map((d) => {
                    const lamports = parseLamports(d.expected_lamports)
                    const sol = lamportsToSol(lamports)
                    const t = d.created_at ? new Date(d.created_at).toLocaleString() : ""
                    const sig = String(d.deposit_signature || '').trim()
                    return (
                      <div key={d.id} className="p-3 flex items-center justify-between text-sm">
                        <div className="min-w-0">
                          <div className="text-white/80 truncate">{d.status || 'wager'}</div>
                          <div className="text-xs text-white/60">{t}</div>
                          {sig && (
                            <a
                              className="text-xs text-white/60 underline inline-flex items-center gap-1"
                              href={txUrl(sig)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Explorer <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                        <div className="text-white/80">{sol.toFixed(4)} SOL</div>
                      </div>
                    )
                  })}
                  {ledgerDeposits.length === 0 && (
                    <div className="p-3 text-sm text-white/60">No wagers/intents recorded yet.</div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white/5 border-white/10">
              <CardContent className="p-4">
                <h3 className="text-sm text-white/80 mb-3">Payouts & Refunds</h3>
                <div className="bg-white/5 rounded-lg divide-y divide-white/10">
                  {ledgerPayments.map((p) => {
                    const lamports = Math.max(
                      0,
                      Math.floor(Number((p as any)?.wallet_lamports ?? p.amount_wei) || 0)
                    )
                    const sol = lamportsToSol(lamports)
                    const t = p.created_at ? new Date(p.created_at).toLocaleString() : ""
                    const hash = String(p.tx_hash || '').trim()
                    const isRefund = String(p.type || '') === 'refund'
                    return (
                      <div key={p.op_id} className="p-3 flex items-center justify-between text-sm">
                        <div className="min-w-0">
                          <div className="text-white/80 truncate">{p.type}</div>
                          <div className="text-xs text-white/60">{t}</div>
                          <div className="text-xs text-white/50 truncate">{p.state}</div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className={isRefund ? 'text-green-400' : 'text-white/80'}>{sol.toFixed(4)} SOL</div>
                          {hash && (
                            <a
                              className="text-xs text-white/60 underline inline-flex items-center gap-1"
                              href={txUrl(hash)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Explorer <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  {ledgerPayments.length === 0 && (
                    <div className="p-3 text-sm text-white/60">No payouts/refunds recorded yet.</div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Edit Modal */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Profile</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div>
              <label className="text-xs text-white/60">Username</label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-white/60">Profile Picture</label>
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10 ring-1 ring-white/15">
                  <AvatarImage src={editPfp || profile?.profile_picture || "/placeholder-user.jpg"} alt="Profile" />
                  <AvatarFallback>{(editName || profile?.username || 'P')[0]}</AvatarFallback>
                </Avatar>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file || !walletAddress) return

                    try {
                      const sid = sessionId || (await signIn())
                      if (!sid) {
                        toast.error('Please sign in to upload a profile picture')
                        return
                      }
                      setUploadingPfp(true)

                      const form = new FormData()
                      form.append('walletAddress', walletAddress)
                      form.append('sessionId', sid)
                      form.append('file', file)

                      const uploadRes = await fetch('/api/profile/avatar/upload', {
                        method: 'POST',
                        body: form,
                      })

                      if (!uploadRes.ok) {
                        const err = await uploadRes.json().catch(() => ({}))
                        throw new Error(err?.error || 'Failed to upload profile picture')
                      }

                      const json = await uploadRes.json().catch(() => ({}))
                      const url = String(json?.publicUrl || '').trim()
                      if (!url) throw new Error('Failed to generate public URL')

                      setEditPfp(url)
                      toast.success('Profile picture uploaded')
                    } catch (err: any) {
                      toast.error(err?.message || 'Failed to upload profile picture')
                    } finally {
                      setUploadingPfp(false)
                      try { e.target.value = '' } catch {}
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  disabled={uploadingPfp}
                  onClick={() => {
                    try { fileInputRef.current?.click() } catch {}
                  }}
                >
                  {uploadingPfp ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                  Upload
                </Button>
              </div>
            </div>
            <div>
              <label className="text-xs text-white/60">Bio</label>
              <Input value={editBio} onChange={(e) => setEditBio(e.target.value)} placeholder="Tell us about your chicken skills" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={onSaveProfile} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function StatCard({ title, value, highlight }: { title: string; value: any; highlight?: 'positive' | 'negative' }) {
  return (
    <div className={`rounded-lg p-4 border ${highlight==='positive' ? 'border-green-600/30 bg-green-900/10' : highlight==='negative' ? 'border-red-600/30 bg-red-900/10' : 'border-white/10 bg-white/5'}`}>
      <div className="text-sm text-white/60">{title}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  )
}

function HistoryItem({ result, fighter, opponent, reward, date }: { result: 'win'|'loss'; fighter: string; opponent: string; reward: number; date: string }) {
  return (
    <div className="p-4 flex items-center justify-between">
      <div className="flex items-center space-x-3">
        <div className={`w-3 h-3 rounded-full ${result === "win" ? "bg-green-500" : "bg-red-500"}`}></div>
        <div>
          <div className="font-medium">
            {fighter || 'You'} vs {opponent || 'Opponent'}
          </div>
          <div className="text-sm text-white/60">{date}</div>
        </div>
      </div>
      <div className={result === "win" ? "text-green-400 font-semibold" : "text-white/60"}>
        {result === "win" ? `+${reward} $COCK` : "No reward"}
      </div>
    </div>
  )
}


