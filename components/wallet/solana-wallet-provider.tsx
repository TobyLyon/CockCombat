"use client";

import React, { FC, ReactNode, useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import {
  PhantomWalletAdapter,
  LedgerWalletAdapter,
  TorusWalletAdapter,
} from "@solana/wallet-adapter-wallets";
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
  
  // Connection config with better reliability
  const connectionConfig = useMemo(() => ({
    commitment: 'confirmed' as Commitment,
    confirmTransactionInitialTimeout: 60000, // 60 seconds
  }), []);

  // Initialize wallet adapters with deduplication
  const wallets = useMemo(() => {
    console.log('🔧 Re-initializing wallet adapters with more aggressive filtering...');
    
    const allWallets = [
      new PhantomWalletAdapter(),
      new LedgerWalletAdapter(),
      new TorusWalletAdapter(),
    ];

    console.log('📦 Created base wallet adapter instances:', allWallets.map(w => w.name));

    const allowedWalletNames = new Set(['Phantom', 'Ledger', 'Torus']);
    
    const filteredWallets = allWallets.filter(wallet => {
      const isAllowed = allowedWalletNames.has(wallet.name);
      console.log(`${isAllowed ? '✅' : '🚫'} Filtering: ${wallet.name} is ${isAllowed ? 'ALLOWED' : 'DENIED'}`);
      return isAllowed;
    });

    const uniqueWallets = filteredWallets.reduce((acc, current) => {
        if (!acc.find((item) => item.name === current.name)) {
            acc.push(current);
        }
        return acc;
    }, [] as any[]);

    console.log(`🔗 Final unique wallet list contains ${uniqueWallets.length} wallet(s):`, uniqueWallets.map(w => w.name));

    return uniqueWallets;
  }, []);

  return (
    <ConnectionProvider endpoint={network.endpoint} config={connectionConfig}>
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
