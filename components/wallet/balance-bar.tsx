"use client"

import { useEffect, useMemo, useState } from "react"
import { useWallet } from "@/hooks/use-wallet"
import { Connection, LAMPORTS_PER_SOL, clusterApiUrl } from '@solana/web3.js'
import escrowService from '@/lib/escrow-service'
import { toast } from "sonner"
import Image from "next/image"
// Token service removed for EVM-only build
import { getEvmProvider } from "@/lib/evm-config"
import { ethers } from "ethers"

interface BalanceBarProps {
  className?: string
  compact?: boolean
  pollIntervalMs?: number
}

export default function BalanceBar({ className = "", compact = false, pollIntervalMs = 15000 }: BalanceBarProps) {
  const { publicKey, connected } = useWallet()
  const [connection, setConnection] = useState<Connection | null>(null)
  const [mounted, setMounted] = useState(false)

  const [sol, setSol] = useState<number>(0)
  const [spl, setSpl] = useState<number>(0)
  const [bnb, setBnb] = useState<number>(0)
  const [initialized, setInitialized] = useState(false)

  const tokenMint = useMemo(() => null, [])

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!mounted || !connected || !publicKey) return
    let timer: number | undefined

    const fetchBalances = async () => {
      try {
        {
          try {
            const net = (process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet') as 'devnet' | 'testnet' | 'mainnet-beta'
            const base = (() => {
              const configured = process.env.NEXT_PUBLIC_SOLANA_RPC_URL
              if (configured && String(configured).trim()) return String(configured).trim()
              if (net === 'mainnet-beta') return 'https://rpc.ankr.com/solana'
              return clusterApiUrl(net)
            })()
            const url = (() => {
              try {
                const rebate = process.env.NEXT_PUBLIC_HELIUS_REBATE_ADDRESS || ''
                const isHelius = /helius/i.test(String(base || ''))
                if (net === 'mainnet-beta' && rebate && isHelius) {
                  const sep = base.includes('?') ? '&' : '?'
                  return `${base}${sep}rebate-address=${encodeURIComponent(rebate)}`
                }
              } catch {}
              return base
            })()
            const conn = connection || new Connection(url)
            if (!connection) setConnection(conn)
            const balLamports = await conn.getBalance({ toBase58: () => publicKey.toString() } as any)
            const val = balLamports / LAMPORTS_PER_SOL
            if (val !== sol) setSol(val)
          } catch {}
        }
        if (tokenMint) {
          // no-op
        } else {
          if (spl !== 0) setSpl(0)
        }
        if (!initialized) setInitialized(true)
      } catch {}
    }

    fetchBalances()
    timer = window.setInterval(fetchBalances, pollIntervalMs)
    // Socket listener for payout success to immediately refresh
    const onPayout = (p: any) => {
      try {
        const me = (publicKey as any)?.toString?.() || ''
        if (me && String(p?.winner || '').toLowerCase() === me.toLowerCase()) {
          // Immediate refresh
          fetchBalances()
          try {
            const amt = typeof p?.amount === 'number' ? p.amount : null
            const cur = p?.currency || 'SOL'
            const nice = amt !== null ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }).format(amt) : ''
            toast.success(`Winnings received${nice ? `: ${nice} ${cur}` : ''}`)
          } catch {}
        }
      } catch {}
    }
    try { (window as any)?.__socket__?.on?.('payout_success', onPayout) } catch {}
    return () => { if (timer) window.clearInterval(timer); try { (window as any)?.__socket__?.off?.('payout_success', onPayout) } catch {} }
  }, [mounted, connected, publicKey, tokenMint, pollIntervalMs, sol, spl, initialized, bnb])

  if (!mounted) {
    return (
      <div className={`rounded-lg border border-white/10 bg-white/5 backdrop-blur px-3 py-2 ${className}`} suppressHydrationWarning>
        <div className="h-4 w-40 bg-white/10 rounded animate-pulse" />
      </div>
    )
  }

  return (
    <div className={`flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 backdrop-blur px-3 py-2 ${className}`}>
      <div className="flex items-center gap-1.5 text-white/90">
        <SolanaLogo className="h-4 w-4" />
        <span className="font-semibold">{sol.toFixed(4)}</span>
        {!compact && <span className="text-xs text-white/70 ml-1">SOL</span>}
      </div>

      <div className="h-4 w-px bg-white/15" />

      {false && (
        <div className="flex items-center gap-1.5 text-white/90">
          <BnbLogo className="h-4 w-4" />
          <span className="font-semibold">{bnb.toFixed(4)}</span>
          {!compact && <span className="text-xs text-white/70 ml-1">SOL</span>}
        </div>
      )}

      {/* SPL token balance hidden in EVM-only mode */}
    </div>
  )
}

function SolanaLogo({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 397 311" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="sol1" x1=".5" y1="0" x2=".5" y2="1">
          <stop stopColor="#14F195" />
          <stop offset="1" stopColor="#9945FF" />
        </linearGradient>
      </defs>
      <path d="M64 0h312l-64 64H0L64 0Z" fill="url(#sol1)"/>
      <path d="M64 124h312l-64 64H0l64-64Z" fill="url(#sol1)"/>
      <path d="M64 247h312l-64 64H0l64-64Z" fill="url(#sol1)"/>
    </svg>
  )
}


function BnbLogo({ className = "h-4 w-4" }: { className?: string }) {
  // Simplified SOL glyph placeholder
  return (
    <svg className={className} viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
      <g fill="#F0B90B">
        {/* center diamond */}
        <path d="M16 12l4 4-4 4-4-4 4-4z"/>
        {/* top diamond */}
        <path d="M16 4l3 3-3 3-3-3 3-3z"/>
        {/* left diamond */}
        <path d="M8 12l3 3-3 3-3-3 3-3z"/>
        {/* right diamond */}
        <path d="M24 12l3 3-3 3-3-3 3-3z"/>
        {/* bottom diamond */}
        <path d="M16 20l3 3-3 3-3-3 3-3z"/>
      </g>
    </svg>
  )
}


