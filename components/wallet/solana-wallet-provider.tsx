"use client";

import React, { FC, ReactNode, useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
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

  // Initialize wallet adapters
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
    ],
    []
  );

  return (
    <ConnectionProvider endpoint={network.endpoint} config={connectionConfig}>
      <WalletProvider wallets={wallets} autoConnect={autoConnect}>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};
