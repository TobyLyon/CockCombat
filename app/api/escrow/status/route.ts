import { NextResponse } from 'next/server'
import { getEvmProvider } from '@/lib/evm-config'
import { evmEscrowService } from '@/lib/evm-escrow-service'
import { ethers } from 'ethers'

export async function GET(request: Request) {
  try {
    const providedAuth = request.headers.get('x-server-auth') || request.headers.get('authorization')
    const serverSecret = process.env.PAYOUT_SERVER_SECRET
    const token = providedAuth?.replace(/^Bearer\s+/i, '').trim()
    if (!serverSecret || !token || token !== serverSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const provider = getEvmProvider()
    const network = await provider.getNetwork()
    const chainId = Number(network.chainId)

    const ids = ['A','B','C'] as const
    const entries = [] as Array<{ id: string; address: string | null; loaded: boolean; balanceBNB?: number }>
    for (const id of ids) {
      try {
        const w = (evmEscrowService as any).getWallet?.(id) || undefined
        const address = w?.address || null
        const loaded = Boolean(w && w.address)
        let balanceBNB: number | undefined = undefined
        if (loaded && address) {
          const bal = await provider.getBalance(address)
          balanceBNB = Number(ethers.formatUnits(bal, 18))
        }
        entries.push({ id, address, loaded, ...(typeof balanceBNB === 'number' ? { balanceBNB } : {}) })
      } catch {
        entries.push({ id, address: null, loaded: false })
      }
    }

    return NextResponse.json({ ok: true, chainId, wallets: entries })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}


