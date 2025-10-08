"use client"

import { useEffect, useMemo, useState } from "react"
import { useWallet } from "@/hooks/use-wallet"
import { useConnection } from "@solana/wallet-adapter-react"
import { isBsc } from "@/lib/chain"
import { PublicKey } from "@solana/web3.js"
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
  const { connection } = useConnection()
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
        const pk = publicKey as PublicKey
        if (!isBsc()) {
          const lamports = await connection.getBalance(pk)
          const solNew = lamports / 1_000_000_000
          if (solNew !== sol) {
            setSol(solNew)
            if (initialized) toast.info(`SOL: ${solNew.toFixed(4)}`)
          }
        } else {
          const addr = (publicKey as any)?.toString?.() || ''
          if (addr) {
            const provider = getEvmProvider()
            const bal = await provider.getBalance(addr)
            const val = parseFloat(ethers.formatEther(bal))
            if (val !== bnb) setBnb(val)
          }
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
    return () => { if (timer) window.clearInterval(timer) }
  }, [mounted, connected, publicKey, connection, tokenMint, pollIntervalMs, sol, spl, initialized])

  if (!mounted) {
    return (
      <div className={`rounded-lg border border-white/10 bg-white/5 backdrop-blur px-3 py-2 ${className}`} suppressHydrationWarning>
        <div className="h-4 w-40 bg-white/10 rounded animate-pulse" />
      </div>
    )
  }

  return (
    <div className={`flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 backdrop-blur px-3 py-2 ${className}`}>
      {!isBsc() && (
        <div className="flex items-center gap-1.5 text-white/90">
          <SolanaLogo className="h-4 w-4" />
          <span className="font-semibold">{sol.toFixed(4)}</span>
          {!compact && <span className="text-xs text-white/70 ml-1">SOL</span>}
        </div>
      )}

      <div className="h-4 w-px bg-white/15" />

      {isBsc() && (
        <div className="flex items-center gap-1.5 text-white/90">
          <BnbLogo className="h-4 w-4" />
          <span className="font-semibold">{bnb.toFixed(4)}</span>
          {!compact && <span className="text-xs text-white/70 ml-1">BNB</span>}
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
  // Simplified BNB glyph constructed from diamonds
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


