"use client";

import React, { FC, ReactNode, useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { LedgerWalletAdapter, TorusWalletAdapter } from "@solana/wallet-adapter-wallets";
import { clusterApiUrl, Commitment } from "@solana/web3.js";

// Import CSS directly instead of using require
import "@solana/wallet-adapter-react-ui/styles.css";

// Network configuration types
type NetworkConfigType = {
  name: string;
  endpoint: string;
  explorerUrl: string;
};

// Define available networks
const NETWORKS: { [key: string]: NetworkConfigType } = {
  mainnet: {
    name: "Mainnet Beta",
    endpoint: clusterApiUrl("mainnet-beta"),
    explorerUrl: "https://explorer.solana.com",
  },
  devnet: {
    name: "Devnet",
    endpoint: clusterApiUrl("devnet"),
    explorerUrl: "https://explorer.solana.com/?cluster=devnet",
  },
  testnet: {
    name: "Testnet",
    endpoint: clusterApiUrl("testnet"),
    explorerUrl: "https://explorer.solana.com/?cluster=testnet",
  },
  // You can add custom RPC endpoints here
  // custom: {
  //   name: "Custom RPC",
  //   endpoint: "https://your-custom-rpc.com",
  //   explorerUrl: "https://explorer.solana.com",
  // },
};

// Default to devnet for development, change to mainnet-beta for production
const DEFAULT_NETWORK = process.env.NEXT_PUBLIC_SOLANA_NETWORK || "devnet";
const CUSTOM_RPC = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || null;

export interface SolanaWalletProviderProps {
  children: ReactNode;
  defaultNetwork?: string;
  autoConnect?: boolean;
}

export const SolanaWalletProvider: FC<SolanaWalletProviderProps> = ({ 
  children, 
  defaultNetwork = DEFAULT_NETWORK,
  autoConnect = false
}) => {
  // Get network configuration
  const network = NETWORKS[defaultNetwork] || NETWORKS.devnet;
  const endpoint = CUSTOM_RPC || network.endpoint;
  
  // Connection config with better reliability
  const connectionConfig = useMemo(() => ({
    commitment: 'confirmed' as Commitment,
    confirmTransactionInitialTimeout: 60000, // 60 seconds
  }), []);

  // Initialize wallet adapters with deduplication
  const wallets = useMemo(() => {
    console.log('🔧 Initializing wallet adapters for production wallets...');

    // Lazy import to avoid bundling all adapters unnecessarily
    const {
      PhantomWalletAdapter,
      SolflareWalletAdapter,
      BackpackWalletAdapter,
      CoinbaseWalletAdapter,
      GlowWalletAdapter,
      ExodusWalletAdapter,
    } = require('@solana/wallet-adapter-wallets');

    const allWallets = [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      new BackpackWalletAdapter(),
      new CoinbaseWalletAdapter(),
      new GlowWalletAdapter(),
      new ExodusWalletAdapter(),
      new LedgerWalletAdapter(),
      new TorusWalletAdapter(),
    ];

    const allowedWalletNames = new Set([
      'Phantom',
      'Solflare',
      'Backpack',
      'Coinbase',
      'Glow',
      'Exodus',
      'Ledger',
      'Torus',
    ]);

    const filteredWallets = allWallets.filter((wallet: any) => allowedWalletNames.has(wallet.name));

    const uniqueWallets = filteredWallets.reduce((acc: any[], current: any) => {
      if (!acc.find((item) => item.name === current.name)) {
        acc.push(current);
      }
      return acc;
    }, [] as any[]);

    console.log(`🔗 Wallet list:`, uniqueWallets.map(w => w.name));

    return uniqueWallets;
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint} config={connectionConfig}>
      <WalletProvider 
        wallets={wallets} 
        autoConnect={autoConnect}
        localStorageKey="solana-wallet-adapter"
      >
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};
