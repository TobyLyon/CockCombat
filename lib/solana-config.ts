/**
 * Solana Network Configuration
 * 
 * Centralized configuration for Solana network connections.
 * Supports devnet, testnet, and mainnet-beta with custom RPC endpoints.
 */

import { Connection, Commitment, clusterApiUrl } from '@solana/web3.js';

export type SolanaNetwork = 'devnet' | 'testnet' | 'mainnet-beta';

export interface NetworkConfig {
  name: string;
  endpoint: string;
  commitment: Commitment;
  confirmTransactionTimeout: number;
}

class SolanaConfig {
  private static instance: SolanaConfig | null = null;
  private connection: Connection | null = null;
  private network: SolanaNetwork;
  private config: NetworkConfig;

  private constructor() {
    // Get network from environment or default to devnet
    // Normalize legacy values to supported clusters
    const rawNetwork = (process.env.NEXT_PUBLIC_SOLANA_NETWORK || '').toLowerCase();
    const normalized = rawNetwork === 'mainnet' ? 'mainnet-beta' : rawNetwork;
    const envNetwork = normalized as SolanaNetwork;
    this.network = (envNetwork === 'devnet' || envNetwork === 'testnet' || envNetwork === 'mainnet-beta')
      ? envNetwork
      : 'devnet';

    // Get RPC endpoint (custom or default)
    const customRpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
    const endpoint = customRpcUrl || clusterApiUrl(this.network);

    // Get commitment level
    const commitment = (process.env.TRANSACTION_COMMITMENT as Commitment) || 'confirmed';

    // Get timeout
    const timeout = parseInt(process.env.TRANSACTION_TIMEOUT || '60000', 10);

    this.config = {
      name: this.getNetworkName(this.network),
      endpoint,
      commitment,
      confirmTransactionTimeout: timeout,
    };

    console.log(`🌐 Solana configured for ${this.config.name}`);
    console.log(`🔗 RPC Endpoint: ${this.config.endpoint}`);
    console.log(`⚡ Commitment: ${this.config.commitment}`);
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): SolanaConfig {
    if (!SolanaConfig.instance) {
      SolanaConfig.instance = new SolanaConfig();
    }
    return SolanaConfig.instance;
  }

  /**
   * Get Solana connection
   */
  public getConnection(): Connection {
    if (!this.connection) {
      this.connection = new Connection(this.config.endpoint, {
        commitment: this.config.commitment,
        confirmTransactionInitialTimeout: this.config.confirmTransactionTimeout,
      });
    }
    return this.connection;
  }

  /**
   * Get current network
   */
  public getNetwork(): SolanaNetwork {
    return this.network;
  }

  /**
   * Get network configuration
   */
  public getConfig(): NetworkConfig {
    return this.config;
  }

  /**
   * Check if we're on mainnet
   */
  public isMainnet(): boolean {
    return this.network === 'mainnet-beta';
  }

  /**
   * Check if we're on devnet
   */
  public isDevnet(): boolean {
    return this.network === 'devnet';
  }

  /**
   * Get explorer URL for a transaction
   */
  public getExplorerUrl(signature: string): string {
    const cluster = this.network === 'mainnet-beta' ? '' : `?cluster=${this.network}`;
    return `https://explorer.solana.com/tx/${signature}${cluster}`;
  }

  /**
   * Get explorer URL for an address
   */
  public getExplorerAddressUrl(address: string): string {
    const cluster = this.network === 'mainnet-beta' ? '' : `?cluster=${this.network}`;
    return `https://explorer.solana.com/address/${address}${cluster}`;
  }

  /**
   * Get human-readable network name
   */
  private getNetworkName(network: SolanaNetwork): string {
    switch (network) {
      case 'mainnet-beta':
        return 'Mainnet Beta';
      case 'devnet':
        return 'Devnet';
      case 'testnet':
        return 'Testnet';
      default:
        return 'Unknown';
    }
  }

  /**
   * Create a new connection (for cases where you need a fresh connection)
   */
  public createConnection(): Connection {
    return new Connection(this.config.endpoint, {
      commitment: this.config.commitment,
      confirmTransactionInitialTimeout: this.config.confirmTransactionTimeout,
    });
  }

  /**
   * Test connection health
   */
  public async testConnection(): Promise<boolean> {
    try {
      const connection = this.getConnection();
      const blockHeight = await connection.getBlockHeight();
      console.log(`✅ Connection healthy. Block height: ${blockHeight}`);
      return true;
    } catch (error) {
      console.error('❌ Connection test failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const solanaConfig = SolanaConfig.getInstance();

// Export convenience functions
export function getConnection(): Connection {
  return solanaConfig.getConnection();
}

export function getNetwork(): SolanaNetwork {
  return solanaConfig.getNetwork();
}

export function isMainnet(): boolean {
  return solanaConfig.isMainnet();
}

export function isDevnet(): boolean {
  return solanaConfig.isDevnet();
}

export function getExplorerUrl(signature: string): string {
  return solanaConfig.getExplorerUrl(signature);
}

export function getExplorerAddressUrl(address: string): string {
  return solanaConfig.getExplorerAddressUrl(address);
}

export default solanaConfig;

