"use client"

import { useEffect, useMemo, useState } from "react"
import { useWallet } from "@solana/wallet-adapter-react"
import { useConnection } from "@solana/wallet-adapter-react"
import { PublicKey } from "@solana/web3.js"
import { toast } from "sonner"
import { Coins } from "lucide-react"
import Image from "next/image"
import { getTokenMintAddress, getTokenBalance } from "@/lib/token-service"

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
  const [initialized, setInitialized] = useState(false)

  const tokenMint = useMemo(() => getTokenMintAddress(), [])

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!mounted || !connected || !publicKey) return
    let timer: number | undefined

    const fetchBalances = async () => {
      try {
        const pk = publicKey as PublicKey
        const lamports = await connection.getBalance(pk)
        const solNew = lamports / 1_000_000_000
        if (solNew !== sol) {
          setSol(solNew)
          if (initialized) toast.info(`SOL: ${solNew.toFixed(4)}`)
        }
        if (tokenMint) {
          const splNew = await getTokenBalance(connection, pk.toBase58())
          if (splNew !== spl) {
            setSpl(splNew)
            if (initialized) toast.info(`$COCK: ${splNew.toFixed(2)}`)
          }
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
      <div className="flex items-center gap-1.5 text-white/90">
        <Coins className="h-4 w-4 text-yellow-300" />
        <span className="font-semibold">{sol.toFixed(4)}</span>
        {!compact && <span className="text-xs text-white/70 ml-1">SOL</span>}
      </div>

      <div className="h-4 w-px bg-white/15" />

      <div className="flex items-center gap-1.5 text-white/90">
        <div className="relative h-4 w-4">
          <Image src="/images/cock-token.png" alt="$COCK" fill className="object-contain" />
        </div>
        <span className="font-semibold">{spl.toFixed(compact ? 1 : 2)}</span>
        {!compact && <span className="text-xs text-white/70 ml-1">$COCK</span>}
      </div>
    </div>
  )
}


