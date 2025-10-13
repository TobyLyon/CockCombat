import { ethers } from 'ethers';
import { getEvmProvider } from './evm-config';

type EscrowId = 'A' | 'B' | 'C';

interface EvmEscrowWallet {
  id: EscrowId;
  address: string;
  wallet: ethers.Wallet; // connected to provider
  isEnabled: boolean;
  transactionCount: number;
  lastUsed: number;
}

class EvmEscrowService {
  private static instance: EvmEscrowService | null = null;
  private wallets: Map<EscrowId, EvmEscrowWallet> = new Map();
  private currentIndex = 0;
  // Serialize transactions per escrow wallet to prevent nonce races
  private locks: Map<EscrowId, Promise<any>> = new Map();

  private constructor() {
    const provider = getEvmProvider();
    (['A','B','C'] as EscrowId[]).forEach((id) => {
      // Support both new and legacy env var names
      const pub = process.env[`EVM_ESCROW_${id}_ADDRESS`] || process.env[`ESCROW_WALLET_${id}_PUBLIC_KEY` as any];
      const pk = process.env[`EVM_ESCROW_${id}_PRIVATE_KEY`] || process.env[`ESCROW_WALLET_${id}_PRIVATE_KEY` as any];
      if (!pub || !pk) return;
      try {
        const wallet = new ethers.Wallet(pk, provider);
        if (wallet.address.toLowerCase() !== pub.toLowerCase()) {
          // Mismatch; skip
          return;
        }
        this.wallets.set(id, {
          id,
          address: pub,
          wallet,
          isEnabled: true,
          transactionCount: 0,
          lastUsed: 0,
        });
      } catch {}
    });
    try {
      if (this.wallets.size === 0) {
        console.warn('⚠️ No EVM escrow wallets configured. Set EVM_ESCROW_A_ADDRESS/EVM_ESCROW_A_PRIVATE_KEY (or legacy ESCROW_WALLET_A_PUBLIC_KEY/ESCROW_WALLET_A_PRIVATE_KEY).');
      } else {
        const loaded = Array.from(this.wallets.values()).map(w => `${w.id}:${w.address.slice(0,6)}…${w.address.slice(-4)}`).join(', ');
        console.log(`🔐 Loaded EVM escrow wallets: ${loaded}`);
      }
    } catch {}
  }

  public static getInstance(): EvmEscrowService {
    if (!EvmEscrowService.instance) {
      EvmEscrowService.instance = new EvmEscrowService();
    }
    return EvmEscrowService.instance;
  }

  public getWallet(id: EscrowId): EvmEscrowWallet | undefined {
    return this.wallets.get(id);
  }

  public getNextWallet(): EvmEscrowWallet {
    const list = Array.from(this.wallets.values()).filter(w => w.isEnabled);
    if (list.length === 0) throw new Error('No EVM escrow wallets configured');
    this.currentIndex = (this.currentIndex + 1) % list.length;
    const w = list[this.currentIndex];
    w.transactionCount++;
    w.lastUsed = Date.now();
    return w;
    }

  private withWalletLock<T>(id: EscrowId, fn: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(id) || Promise.resolve();
    let resultPromise: Promise<T>;
    const next = previous
      .catch(() => {})
      .then(async () => {
        resultPromise = fn();
        return resultPromise;
      });
    // Ensure we clear the lock when this operation chain settles
    const settled = next.finally(() => {
      try { if (this.locks.get(id) === settled) this.locks.delete(id); } catch {}
    });
    this.locks.set(id, settled);
    // @ts-expect-error resultPromise is assigned in then
    return next as Promise<T>;
  }

  public async transferNative(to: string, wei: bigint, from?: EvmEscrowWallet): Promise<string> {
    const w = from || this.getNextWallet();
    return this.withWalletLock(w.id, async () => {
      const tx = await w.wallet.sendTransaction({ to, value: wei });
      const receipt = await tx.wait(1);
      if (!receipt || receipt.status !== 1) {
        throw new Error('BNB transfer failed');
      }
      return tx.hash;
    });
  }
}

export const evmEscrowService = EvmEscrowService.getInstance();
export default evmEscrowService;


