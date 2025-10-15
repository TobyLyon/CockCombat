"use client"

import { useEffect, useMemo, useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useWallet } from "@/hooks/use-wallet"
import { ProfileService } from "@/lib/profile-service"
// Solana-specific polling removed for EVM-only build
import type { Profile, Transaction, Match } from "@/lib/supabase"
import { toast } from "sonner"
import { Loader2, Pencil } from "lucide-react"
import { getEvmExplorerUrl } from "@/lib/evm-config"

export default function UserProfilePro() {
  const { connected, publicKey } = useWallet()
  const walletAddress = typeof publicKey === 'string'
    ? publicKey
    : (publicKey && typeof (publicKey as any).toBase58 === 'function'
        ? (publicKey as any).toBase58()
        : (publicKey?.toString?.() || ''))

  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [txs, setTxs] = useState<Transaction[]>([])

  const [editOpen, setEditOpen] = useState(false)
  const [editName, setEditName] = useState("")
  const [editPfp, setEditPfp] = useState("")
  const [editBio, setEditBio] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const load = async () => {
      if (!connected || !walletAddress) return
      setLoading(true)
      try {
        let p = await ProfileService.getProfile(walletAddress)
        if (!p) {
          p = await ProfileService.initializeNewProfile(walletAddress)
        }
        setProfile(p)
        setEditName(p?.username || "")
        setEditPfp(p?.profile_picture || "")
        setEditBio(p?.bio || "")
        const [mh, th] = await Promise.all([
          ProfileService.getMatchHistory(walletAddress, 25),
          ProfileService.getTransactionHistory(walletAddress, 50),
        ])
        setMatches(mh)
        setTxs(th)
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
      const updated = await ProfileService.updateProfile(walletAddress, {
        username: name || profile?.username,
        profile_picture: editPfp.trim() || null,
        bio: editBio.trim() || null,
      })
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
        <Loader2 className="h-6 w-6 animate-spin text-yellow-400" />
      </div>
    )
  }

  return (
    <div className="bg-purple-900/20 rounded-xl p-6 border border-purple-700/40 backdrop-blur-sm">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
        <div className="flex items-center gap-4">
          <Avatar className="h-14 w-14 ring-2 ring-white/20">
            <AvatarImage src={profile?.profile_picture || "/placeholder-user.jpg"} alt={profile?.username || "Player"} />
            <AvatarFallback>{(profile?.username || 'P')[0]}</AvatarFallback>
          </Avatar>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold">{profile?.username || 'Player'}</h2>
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} className="h-7 px-2 text-xs">
                <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
              </Button>
            </div>
            <p className="text-xs text-purple-300">Wallet: {walletAddress.slice(0,6)}...{walletAddress.slice(-4)}</p>
            {profile?.bio && <p className="text-xs text-purple-200/90 mt-1 max-w-prose">{profile.bio}</p>}
          </div>
        </div>
        <div className="mt-4 md:mt-0 flex items-center gap-3">
          <div className="bg-purple-800/40 px-3 py-1.5 rounded-lg border border-purple-700/50">
            <span className="text-yellow-400 font-bold">{(profile?.token_balance ?? 0).toLocaleString()} $COCK</span>
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
        <TabsList className="bg-purple-800/40 border border-purple-700/50">
          <TabsTrigger value="overview" className="data-[state=active]:bg-purple-700">Overview</TabsTrigger>
          <TabsTrigger value="history" className="data-[state=active]:bg-purple-700">Match History</TabsTrigger>
          <TabsTrigger value="transactions" className="data-[state=active]:bg-purple-700">Transactions</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="pt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="bg-purple-800/40 border-purple-700/50">
              <CardContent className="p-4">
                <h3 className="text-sm text-purple-200 mb-3">Recent Matches</h3>
                <div className="bg-purple-900/30 rounded-lg divide-y divide-purple-700/40">
                  {matches.slice(0,5).map((m) => (
                    <HistoryItem key={m.id} result={m.winner_wallet === walletAddress ? 'win':'loss'} fighter={''} opponent={''} reward={0} date={new Date(m.match_timestamp).toLocaleString()} />
                  ))}
                  {matches.length === 0 && <div className="p-3 text-sm text-purple-300">No matches yet.</div>}
                </div>
              </CardContent>
            </Card>
            <Card className="bg-purple-800/40 border-purple-700/50">
              <CardContent className="p-4">
                <h3 className="text-sm text-purple-200 mb-3">Recent Transactions</h3>
                <div className="bg-purple-900/30 rounded-lg divide-y divide-purple-700/40">
                  {txs.slice(0,5).map(t => (
                    <div key={t.id} className="p-3 flex items-center justify-between text-sm">
                      <div className="text-purple-200">{t.description || t.transaction_type}</div>
                      <div className={t.amount >= 0 ? 'text-green-400' : 'text-red-400'}>{t.amount >= 0 ? '+' : ''}{t.amount}</div>
                    </div>
                  ))}
                  {txs.length === 0 && <div className="p-3 text-sm text-purple-300">No transactions yet.</div>}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="history" className="pt-4">
          <div className="bg-purple-800/30 rounded-lg divide-y divide-purple-700/40">
            {matches.slice(0,10).map((m) => (
              <HistoryItem key={m.id} result={m.winner_wallet === walletAddress ? 'win':'loss'} fighter={''} opponent={''} reward={0} date={new Date(m.match_timestamp).toLocaleString()} />
            ))}
            {matches.length === 0 && <div className="p-3 text-sm text-purple-300">No matches recorded.</div>}
          </div>
        </TabsContent>

        <TabsContent value="transactions" className="pt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="bg-purple-800/40 border-purple-700/50">
              <CardContent className="p-4">
                <h3 className="text-sm text-purple-200 mb-3">Wagers & Results</h3>
                <div className="bg-purple-900/30 rounded-lg divide-y divide-purple-700/40">
                  {txs.map(t => (
                    <div key={t.id} className="p-3 flex items-center justify-between text-sm">
                      <div className="text-purple-200">{t.description || t.transaction_type}</div>
                      <div className={t.amount >= 0 ? 'text-green-400' : 'text-red-400'}>{t.amount >= 0 ? '+' : ''}{t.amount}</div>
                    </div>
                  ))}
                  {txs.length === 0 && <div className="p-3 text-sm text-purple-300">No transactions yet.</div>}
                </div>
              </CardContent>
            </Card>
            <Card className="bg-purple-800/40 border-purple-700/50">
              <CardContent className="p-4">
                <h3 className="text-sm text-purple-200 mb-3">On-chain Payouts (Solana)</h3>
                <div className="bg-purple-900/30 rounded-lg divide-y divide-purple-700/40">
                  {matches.filter(m => m.winner_wallet === walletAddress && (m as any)?.metadata?.payout_tx).map((m) => {
                    const hash = (m as any).metadata.payout_tx as string
                    return (
                      <div key={m.id} className="p-3 flex items-center justify-between text-sm">
                        <div className="text-purple-200">Match {m.id?.toString().slice(0,8)}…</div>
                        <span className="text-yellow-400">{hash.slice(0,8)}…</span>
                      </div>
                    )
                  })}
                  {matches.filter(m => m.winner_wallet === walletAddress && (m as any)?.metadata?.payout_tx).length === 0 && (
                    <div className="p-3 text-sm text-purple-300">No on-chain payouts recorded yet.</div>
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
              <label className="text-xs text-purple-300">Username</label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-purple-300">Profile Picture URL</label>
              <Input value={editPfp} onChange={(e) => setEditPfp(e.target.value)} placeholder="https://..." />
            </div>
            <div>
              <label className="text-xs text-purple-300">Bio</label>
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
    <div className={`rounded-lg p-4 border ${highlight==='positive' ? 'border-green-600/40 bg-green-900/20' : highlight==='negative' ? 'border-red-600/40 bg-red-900/20' : 'border-purple-700/50 bg-purple-800/40'}`}>
      <div className="text-sm text-purple-300">{title}</div>
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
          <div className="text-sm text-purple-300">{date}</div>
        </div>
      </div>
      <div className={result === "win" ? "text-yellow-400 font-bold" : "text-purple-300"}>
        {result === "win" ? `+${reward} $COCK` : "No reward"}
      </div>
    </div>
  )
}


