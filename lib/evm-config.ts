/**
 * EVM (BSC) configuration
 */

import { ethers } from 'ethers';

export interface EvmNetworkConfig {
  rpcUrl: string;
  chainId: number; // 56 mainnet, 97 testnet
}

class EvmConfig {
  private static instance: EvmConfig | null = null;
  private provider: ethers.JsonRpcProvider | null = null;
  private config: EvmNetworkConfig;

  private constructor() {
    const rpcUrl = process.env.NEXT_PUBLIC_EVM_RPC_URL || 'https://bsc-dataseed.binance.org';
    const chainId = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || '56', 10);
    this.config = { rpcUrl, chainId };
  }

  public static getInstance(): EvmConfig {
    if (!EvmConfig.instance) {
      EvmConfig.instance = new EvmConfig();
    }
    return EvmConfig.instance;
  }

  public getProvider(): ethers.JsonRpcProvider {
    if (!this.provider) {
      this.provider = new ethers.JsonRpcProvider(this.config.rpcUrl, this.config.chainId);
    }
    return this.provider;
  }

  public getConfig(): EvmNetworkConfig {
    return this.config;
  }

  public getExplorerTxUrl(hash: string): string {
    const isMainnet = this.config.chainId === 56;
    const base = isMainnet ? 'https://bscscan.com' : 'https://testnet.bscscan.com';
    return `${base}/tx/${hash}`;
  }
}

export const evmConfig = EvmConfig.getInstance();
export function getEvmProvider() { return evmConfig.getProvider(); }
export function getEvmExplorerUrl(hash: string) { return evmConfig.getExplorerTxUrl(hash); }


