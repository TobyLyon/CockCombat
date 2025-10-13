// Plain CommonJS escrow service for Node runtime (server.js)
const { ethers } = require('ethers')

function getProvider() {
  const rpcUrl = process.env.NEXT_PUBLIC_EVM_RPC_URL || 'https://bsc-dataseed.binance.org'
  const chainId = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || '56', 10)
  return new ethers.JsonRpcProvider(rpcUrl, chainId)
}

class EvmEscrowServiceJs {
  constructor() {
    this.wallets = new Map()
    this.currentIndex = 0
    const provider = getProvider()
    ;(['A','B','C']).forEach((id) => {
      const pub = process.env[`EVM_ESCROW_${id}_ADDRESS`] || process.env[`ESCROW_WALLET_${id}_PUBLIC_KEY`]
      const pk = process.env[`EVM_ESCROW_${id}_PRIVATE_KEY`] || process.env[`ESCROW_WALLET_${id}_PRIVATE_KEY`]
      if (!pub || !pk) return
      try {
        const wallet = new ethers.Wallet(pk, provider)
        if (wallet.address.toLowerCase() !== String(pub).toLowerCase()) {
          return
        }
        this.wallets.set(id, {
          id,
          address: pub,
          wallet,
          isEnabled: true,
          transactionCount: 0,
          lastUsed: 0,
        })
      } catch {}
    })
    try {
      if (this.wallets.size === 0) {
        console.warn('⚠️ No EVM escrow wallets configured. Set EVM_ESCROW_A_ADDRESS/EVM_ESCROW_A_PRIVATE_KEY (or legacy ESCROW_WALLET_A_PUBLIC_KEY/ESCROW_WALLET_A_PRIVATE_KEY).')
      } else {
        const loaded = Array.from(this.wallets.values()).map(w => `${w.id}:${w.address.slice(0,6)}…${w.address.slice(-4)}`).join(', ')
        console.log(`🔐 Loaded EVM escrow wallets: ${loaded}`)
      }
    } catch {}
  }

  getWallet(id) {
    return this.wallets.get(id)
  }

  getNextWallet() {
    const list = Array.from(this.wallets.values()).filter(w => w.isEnabled)
    if (list.length === 0) throw new Error('No EVM escrow wallets configured')
    this.currentIndex = (this.currentIndex + 1) % list.length
    const w = list[this.currentIndex]
    w.transactionCount++
    w.lastUsed = Date.now()
    return w
  }

  async transferNative(to, wei, from) {
    const w = from || this.getNextWallet()
    const tx = await w.wallet.sendTransaction({ to, value: wei })
    const receipt = await tx.wait(1)
    if (!receipt || receipt.status !== 1) {
      throw new Error('BNB transfer failed')
    }
    return tx.hash
  }
}

const instance = new EvmEscrowServiceJs()
module.exports = { evmEscrowService: instance }


