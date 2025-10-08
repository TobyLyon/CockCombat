"use client";

import React, { FC, ReactNode, useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
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

export const SolanaWalletProvider: FC<SolanaWalletProviderProps> = ({ children }) => {
  // EVM-only: passthrough wrapper
  return <>{children}</> as any;
};
