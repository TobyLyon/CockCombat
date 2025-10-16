// Server-only payout service (CommonJS) to be callable from server.js
const { createClient } = require('@supabase/supabase-js')
const { evmEscrowService } = require('./evm-escrow-service.ts')
const { isBsc } = require('./chain.ts')
const { getEvmExplorerUrl } = require('./evm-config.js')
const { ethers } = require('ethers')

async function processPayoutServerOnly(args) {
  const {
    winnerAddress,
    prizePool, // in SOL
    matchId = null,
    houseWalletAddress = process.env.NEXT_PUBLIC_ADMIN_WALLET,
    houseCutPercentage = parseFloat(process.env.HOUSE_CUT_PERCENTAGE || '0.04'),
    matchResult = null,
  } = args || {}

  if (!winnerAddress || !(prizePool > 0)) {
    throw new Error('Invalid payout args')
  }
  if (!isBsc()) throw new Error('Unsupported chain')
  if (!houseWalletAddress) throw new Error('House wallet not configured')

  // Integer math: compute in wei to avoid float rounding issues
  const poolWei = ethers.parseUnits(String(prizePool), 18)
  const houseBps = Math.min(10000, Math.max(0, Math.round(houseCutPercentage * 10000)))
  const houseCutWei = (poolWei * BigInt(houseBps)) / 10000n
  const winnerCutWei = poolWei - houseCutWei

  // Choose escrow wallet from matchResult if present, else rotate
  const walletId = matchResult && matchResult.escrow_wallet_id ? matchResult.escrow_wallet_id : undefined
  const from = walletId ? evmEscrowService.getWallet(walletId) : evmEscrowService.getNextWallet()
  if (!from) throw new Error('Escrow source wallet unavailable')

  const winnerSignature = await evmEscrowService.transferNative(winnerAddress, winnerCutWei, from)
  const houseSignature = await evmEscrowService.transferNative(houseWalletAddress, houseCutWei, from)

  // Record in DB (best-effort)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (supabaseUrl && supabaseServiceKey) {
    try {
      const supabase = createClient(supabaseUrl, supabaseServiceKey)
      // Winner transaction
      await supabase.from('transactions').insert({
        wallet_address: winnerAddress,
        transaction_type: 'win',
        amount: Number(ethers.formatUnits(winnerCutWei, 18)),
        related_entity_id: matchId,
        description: 'Match winnings',
      })
      // House transaction
      await supabase.from('transactions').insert({
        wallet_address: houseWalletAddress,
        transaction_type: 'house_cut',
        amount: Number(ethers.formatUnits(houseCutWei, 18)),
        related_entity_id: matchId,
        description: `House cut (${(houseCutPercentage * 100).toFixed(1)}%)`,
      })
      // Update match_results if present
      if (matchId && matchResult) {
        await supabase.from('match_results').update({
          payout_processed: true,
          payout_tx_signature: winnerSignature,
          status: 'completed',
        }).eq('id', matchId)
      }
      // Also update legacy matches row if present
      if (matchId) {
        await supabase.from('matches').update({
          winner_wallet: winnerAddress,
          metadata: {
            payout_tx: winnerSignature,
            house_cut_tx: houseSignature,
            payout_amount: Number(ethers.formatUnits(winnerCutWei, 18)),
            house_cut_amount: Number(ethers.formatUnits(houseCutWei, 18)),
          },
        }).eq('id', matchId)
      }
    } catch (e) {
      console.error('⚠️ Failed to record payout to DB:', e)
    }
  }

  // Notify winner via socket (best-effort)
  try {
    const io = global.socketIo
    const active = global.activeConnections
    const payload = {
      winner: winnerAddress,
      amount: poolBnb * (1 - houseCutPercentage),
      currency: 'SOL',
      matchId,
      txHash: winnerSignature,
      explorer: getEvmExplorerUrl(winnerSignature),
      ts: Date.now(),
    }
    if (io && active && typeof active.entries === 'function') {
      for (const [, conn] of active.entries()) {
        try {
          const w = String(conn.walletAddress || '').toLowerCase()
          if (w && w === String(winnerAddress).toLowerCase()) {
            conn.socket?.emit?.('payout_success', payload)
          }
        } catch {}
      }
    }
  } catch {}

  console.log('✅ payout_executed', {
    matchId,
    winner: winnerAddress,
    amount: Number(ethers.formatUnits(winnerCutWei, 18)),
    houseAmount: Number(ethers.formatUnits(houseCutWei, 18)),
    escrow: from?.id,
    winnerSignature,
    houseSignature,
  })

  return { winnerSignature, houseSignature }
}

module.exports = { processPayoutServerOnly }


