/**
 * Escrow Wallet Management Service
 * 
 * Manages a 3-wallet rotating escrow system for load balancing and security.
 * Wallets A, B, and C are cycled through to distribute transaction load and
 * minimize the risk of any single wallet being compromised or rate-limited.
 */

import { Connection, Keypair, PublicKey, Transaction, SystemProgram, sendAndConfirmTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import bs58 from 'bs58';

// Escrow wallet configuration
interface EscrowWallet {
  id: 'A' | 'B' | 'C';
  publicKey: PublicKey;
  keypair: Keypair;
  isEnabled: boolean;
  transactionCount: number;
  lastUsed: number;
  balance: number; // Cached balance in lamports
}

interface EscrowConfig {
  cyclingEnabled: boolean;
  loadBalancingEnabled: boolean;
  minBalanceThreshold: number; // Minimum SOL balance required
}

class EscrowService {
  private static instance: EscrowService | null = null;
  private wallets: Map<string, EscrowWallet> = new Map();
  private currentWalletIndex: number = 0;
  private config: EscrowConfig;
  private connection: Connection | null = null;

  private constructor() {
    this.config = {
      cyclingEnabled: process.env.ESCROW_CYCLING_ENABLED === 'true',
      loadBalancingEnabled: process.env.ESCROW_LOAD_BALANCING === 'true',
      minBalanceThreshold: 0.1 * LAMPORTS_PER_SOL, // 0.1 SOL minimum
    };

    this.initializeWallets();
  }

  public async transferSolBundle(
    transfers: Array<{ toAddress: string; lamports: number }>,
    fromWallet?: EscrowWallet
  ): Promise<string> {
    if (!this.connection) {
      throw new Error('Connection not initialized')
    }

    if (!Array.isArray(transfers) || transfers.length === 0) {
      throw new Error('No transfers provided')
    }

    const wallet = fromWallet || await this.getNextWallet()
    const tx = new Transaction()
    for (const t of transfers) {
      const toPublicKey = new PublicKey(t.toAddress)
      const lamports = Math.max(0, Math.floor(Number(t.lamports) || 0))
      if (!lamports) continue
      tx.add(
        SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: toPublicKey,
          lamports,
        })
      )
    }

    if (tx.instructions.length === 0) {
      throw new Error('No valid transfers to execute')
    }

    try {
      const signature = await sendAndConfirmTransaction(
        this.connection,
        tx,
        [wallet.keypair],
        {
          commitment: 'confirmed',
          maxRetries: 3,
        }
      )
      return signature
    } catch (error) {
      console.error(`❌ SOL bundle transfer failed from wallet ${wallet.id}:`, error)
      throw error
    }
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): EscrowService {
    if (!EscrowService.instance) {
      EscrowService.instance = new EscrowService();
    }
    return EscrowService.instance;
  }

  /**
   * Initialize Solana connection
   */
  public setConnection(connection: Connection): void {
    this.connection = connection;
  }

  /**
   * Initialize escrow wallets from environment variables
   */
  private initializeWallets(): void {
    const walletIds: Array<'A' | 'B' | 'C'> = ['A', 'B', 'C'];

    for (const id of walletIds) {
      const publicKeyStr = process.env[`ESCROW_WALLET_${id}_PUBLIC_KEY`];
      const privateKeyStr = process.env[`ESCROW_WALLET_${id}_PRIVATE_KEY`];

      if (!publicKeyStr || !privateKeyStr) {
        console.warn(`⚠️ Escrow wallet ${id} not configured. Skipping...`);
        continue;
      }

      try {
        const publicKey = new PublicKey(publicKeyStr);
        const keypair = Keypair.fromSecretKey(bs58.decode(privateKeyStr));

        // Verify the keypair matches the public key
        if (!keypair.publicKey.equals(publicKey)) {
          console.error(`❌ Escrow wallet ${id}: Private key doesn't match public key!`);
          continue;
        }

        this.wallets.set(id, {
          id,
          publicKey,
          keypair,
          isEnabled: true,
          transactionCount: 0,
          lastUsed: 0,
          balance: 0,
        });

        console.log(`✅ Initialized escrow wallet ${id}: ${publicKey.toBase58()}`);
      } catch (error) {
        console.error(`❌ Failed to initialize escrow wallet ${id}:`, error);
      }
    }

    if (this.wallets.size === 0) {
      // Do NOT throw during module import/build. We'll validate at call time.
      console.warn('⚠️ No escrow wallets configured. Payouts will be disabled until wallets are set.');
    } else {
      console.log(`🔐 Escrow service initialized with ${this.wallets.size} wallet(s)`);
    }
  }

  /**
   * Get the next available escrow wallet using rotation or load balancing
   */
  public async getNextWallet(): Promise<EscrowWallet> {
    if (this.wallets.size === 0) {
      throw new Error('No escrow wallets available');
    }

    const enabledWallets = Array.from(this.wallets.values()).filter(w => w.isEnabled);

    if (enabledWallets.length === 0) {
      throw new Error('All escrow wallets are disabled');
    }

    let selectedWallet: EscrowWallet;

    if (this.config.loadBalancingEnabled) {
      // Select wallet with lowest transaction count
      selectedWallet = enabledWallets.reduce((prev, current) =>
        prev.transactionCount < current.transactionCount ? prev : current
      );
    } else if (this.config.cyclingEnabled) {
      // Round-robin selection
      this.currentWalletIndex = (this.currentWalletIndex + 1) % enabledWallets.length;
      selectedWallet = enabledWallets[this.currentWalletIndex];
    } else {
      // Always use first wallet
      selectedWallet = enabledWallets[0];
    }

    // Update usage stats
    selectedWallet.transactionCount++;
    selectedWallet.lastUsed = Date.now();

    // Check balance if connection is available
    if (this.connection) {
      try {
        const balance = await this.connection.getBalance(selectedWallet.publicKey);
        selectedWallet.balance = balance;

        if (balance < this.config.minBalanceThreshold) {
          console.warn(`⚠️ Escrow wallet ${selectedWallet.id} balance is low: ${balance / LAMPORTS_PER_SOL} SOL`);
        }
      } catch (error) {
        console.error(`Failed to check balance for wallet ${selectedWallet.id}:`, error);
      }
    }

    console.log(`📦 Selected escrow wallet ${selectedWallet.id} (TX count: ${selectedWallet.transactionCount})`);
    return selectedWallet;
  }

  /**
   * Pick a wallet that has at least the required lamports (best-effort)
   */
  public async getWalletWithBalance(minLamports: number): Promise<EscrowWallet> {
    if (!this.connection) throw new Error('Connection not initialized');
    const enabled = Array.from(this.wallets.values()).filter(w => w.isEnabled);
    if (enabled.length === 0) throw new Error('No escrow wallets available');
    // Refresh balances
    await Promise.all(enabled.map(async w => { try { w.balance = await this.connection!.getBalance(w.publicKey); } catch {} }));
    const enough = enabled.filter(w => (w.balance || 0) >= minLamports);
    if (enough.length > 0) {
      // choose the least used among those with enough balance
      return enough.reduce((a,b) => a.transactionCount <= b.transactionCount ? a : b);
    }
    // fallback to highest balance wallet
    return enabled.reduce((a,b) => (a.balance || 0) >= (b.balance || 0) ? a : b);
  }

  /**
   * Get a specific wallet by ID
   */
  public getWallet(id: 'A' | 'B' | 'C'): EscrowWallet | undefined {
    return this.wallets.get(id);
  }

  /**
   * Get all wallet balances
   */
  public async getAllBalances(): Promise<Map<string, number>> {
    if (!this.connection) {
      throw new Error('Connection not initialized');
    }

    const balances = new Map<string, number>();

    for (const [id, wallet] of this.wallets) {
      try {
        const balance = await this.connection.getBalance(wallet.publicKey);
        wallet.balance = balance;
        balances.set(id, balance);
      } catch (error) {
        console.error(`Failed to get balance for wallet ${id}:`, error);
        balances.set(id, 0);
      }
    }

    return balances;
  }

  /**
   * Get total balance across all escrow wallets
   */
  public async getTotalBalance(): Promise<number> {
    const balances = await this.getAllBalances();
    return Array.from(balances.values()).reduce((sum, balance) => sum + balance, 0);
  }

  /**
   * Transfer SOL from escrow to winner
   */
  public async transferSOL(
    toAddress: string,
    amountLamports: number,
    fromWallet?: EscrowWallet
  ): Promise<string> {
    if (!this.connection) {
      throw new Error('Connection not initialized');
    }

    const wallet = fromWallet || await this.getNextWallet();
    const toPublicKey = new PublicKey(toAddress);

    console.log(`💸 Transferring ${amountLamports / LAMPORTS_PER_SOL} SOL from wallet ${wallet.id} to ${toAddress}`);

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: toPublicKey,
        lamports: amountLamports,
      })
    );

    try {
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [wallet.keypair],
        {
          commitment: 'confirmed',
          maxRetries: 3,
        }
      );

      console.log(`✅ SOL transfer successful: ${signature}`);
      return signature;
    } catch (error) {
      console.error(`❌ SOL transfer failed from wallet ${wallet.id}:`, error);
      throw error;
    }
  }

  /**
   * Transfer SPL tokens from escrow to winner
   */
  public async transferTokens(
    mintAddress: string,
    toAddress: string,
    amount: number,
    decimals: number = 6,
    fromWallet?: EscrowWallet
  ): Promise<string> {
    if (!this.connection) {
      throw new Error('Connection not initialized');
    }

    const wallet = fromWallet || await this.getNextWallet();
    const mintPublicKey = new PublicKey(mintAddress);
    const toPublicKey = new PublicKey(toAddress);

    console.log(`💰 Transferring ${amount} tokens from wallet ${wallet.id} to ${toAddress}`);

    // Get token accounts
    const fromTokenAccount = await getAssociatedTokenAddress(
      mintPublicKey,
      wallet.publicKey,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const toTokenAccount = await getAssociatedTokenAddress(
      mintPublicKey,
      toPublicKey,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const transaction = new Transaction();

    // Check if destination token account exists
    try {
      await getAccount(this.connection, toTokenAccount, 'confirmed', TOKEN_PROGRAM_ID);
    } catch (error) {
      // Account doesn't exist, create it
      console.log(`Creating token account for ${toAddress}...`);
      transaction.add(
        createAssociatedTokenAccountInstruction(
          wallet.publicKey,
          toTokenAccount,
          toPublicKey,
          mintPublicKey,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );
    }

    // Add transfer instruction
    const rawAmount = amount * Math.pow(10, decimals);
    transaction.add(
      createTransferInstruction(
        fromTokenAccount,
        toTokenAccount,
        wallet.publicKey,
        rawAmount,
        [],
        TOKEN_PROGRAM_ID
      )
    );

    try {
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [wallet.keypair],
        {
          commitment: 'confirmed',
          maxRetries: 3,
        }
      );

      console.log(`✅ Token transfer successful: ${signature}`);
      return signature;
    } catch (error) {
      console.error(`❌ Token transfer failed from wallet ${wallet.id}:`, error);
      throw error;
    }
  }

  /**
   * Process payout (winner + house cut)
   */
  public async processPayout(
    winnerAddress: string,
    totalPrizePoolLamports: number,
    houseCutPercentage: number = 0.04
  ): Promise<{ winnerSignature: string; houseSignature: string }> {
    if (!this.connection) {
      throw new Error('Connection not initialized');
    }

    if (this.wallets.size === 0) {
      throw new Error('Escrow wallets not configured');
    }

    const houseWallet = process.env.NEXT_PUBLIC_ADMIN_WALLET;
    if (!houseWallet) {
      throw new Error('House wallet not configured');
    }

    // Calculate amounts
    const houseCutLamports = Math.floor(totalPrizePoolLamports * houseCutPercentage);
    const winnerCutLamports = totalPrizePoolLamports - houseCutLamports;

    console.log(`💰 Processing payout: Winner: ${winnerCutLamports / LAMPORTS_PER_SOL} SOL, House: ${houseCutLamports / LAMPORTS_PER_SOL} SOL`);

    // Get escrow wallet with sufficient balance
    const wallet = await this.getWalletWithBalance(totalPrizePoolLamports);

    // Transfer to winner
    const winnerSignature = await this.transferSOL(winnerAddress, winnerCutLamports, wallet);

    // Transfer to house
    const houseSignature = await this.transferSOL(houseWallet, houseCutLamports, wallet);

    return {
      winnerSignature,
      houseSignature,
    };
  }

  /**
   * Disable a wallet (e.g., if compromised or low balance)
   */
  public disableWallet(id: 'A' | 'B' | 'C'): void {
    const wallet = this.wallets.get(id);
    if (wallet) {
      wallet.isEnabled = false;
      console.log(`🚫 Escrow wallet ${id} disabled`);
    }
  }

  /**
   * Enable a wallet
   */
  public enableWallet(id: 'A' | 'B' | 'C'): void {
    const wallet = this.wallets.get(id);
    if (wallet) {
      wallet.isEnabled = true;
      console.log(`✅ Escrow wallet ${id} enabled`);
    }
  }

  /**
   * Get wallet statistics
   */
  public getStats(): Array<{
    id: string;
    publicKey: string;
    isEnabled: boolean;
    transactionCount: number;
    balance: number;
    lastUsed: number;
  }> {
    return Array.from(this.wallets.values()).map(wallet => ({
      id: wallet.id,
      publicKey: wallet.publicKey.toBase58(),
      isEnabled: wallet.isEnabled,
      transactionCount: wallet.transactionCount,
      balance: wallet.balance,
      lastUsed: wallet.lastUsed,
    }));
  }
}

// Export singleton instance
export const escrowService = EscrowService.getInstance();
export default escrowService;

