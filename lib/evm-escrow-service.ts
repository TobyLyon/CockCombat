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

  private constructor() {
    const provider = getEvmProvider();
    (['A','B','C'] as EscrowId[]).forEach((id) => {
      const pub = process.env[`EVM_ESCROW_${id}_ADDRESS`];
      const pk = process.env[`EVM_ESCROW_${id}_PRIVATE_KEY`];
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

  public async transferNative(to: string, wei: bigint, from?: EvmEscrowWallet): Promise<string> {
    const w = from || this.getNextWallet();
    const tx = await w.wallet.sendTransaction({ to, value: wei });
    const receipt = await tx.wait(1);
    if (!receipt || receipt.status !== 1) {
      throw new Error('BNB transfer failed');
    }
    return tx.hash;
  }
}

export const evmEscrowService = EvmEscrowService.getInstance();
export default evmEscrowService;


