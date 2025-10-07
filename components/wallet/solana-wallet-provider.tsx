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

export const SolanaWalletProvider: FC<SolanaWalletProviderProps> = ({ 
  children, 
  defaultNetwork = DEFAULT_NETWORK,
  autoConnect = false
}) => {
  // Avoid running on server during prerender (e.g., /_not-found)
  if (typeof window === 'undefined') {
    return <>{children}</> as any;
  }
  // Get network configuration
  const network = NETWORKS[defaultNetwork] || NETWORKS.devnet;
  const endpoint = CUSTOM_RPC || network.endpoint;
  
  // Connection config with better reliability
  const connectionConfig = useMemo(() => ({
    commitment: 'confirmed' as Commitment,
    confirmTransactionInitialTimeout: 60000, // 60 seconds
  }), []);

  // Initialize wallet adapters safely on client after mount
  const [wallets, setWallets] = React.useState<any[]>([]);
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        console.log('🔧 Initializing wallet adapters for production wallets...');
        const mod = await import('@solana/wallet-adapter-wallets');
        const candidates: any[] = [
          mod.PhantomWalletAdapter,
          mod.SolflareWalletAdapter,
          mod.BackpackWalletAdapter,
          mod.CoinbaseWalletAdapter,
          mod.GlowWalletAdapter,
          mod.ExodusWalletAdapter,
          mod.LedgerWalletAdapter,
          mod.TorusWalletAdapter,
        ].filter(Boolean);

        const instances: any[] = [];
        for (const Adapter of candidates) {
          try {
            if (typeof Adapter === 'function') {
              const inst = new (Adapter as any)();
              if (inst && typeof inst === 'object') {
                instances.push(inst);
              }
            }
          } catch (e) {
            // Skip adapters that fail to construct in this environment
          }
        }

        // Dedupe by name
        const unique = instances.reduce((acc: any[], cur: any) => {
          if (!acc.find((w) => w?.name === cur?.name)) acc.push(cur);
          return acc;
        }, [] as any[]);

        if (!cancelled) setWallets(unique);
      } catch (e) {
        console.error('Wallet adapter initialization failed', e);
        if (!cancelled) setWallets([]);
      }
    })();

    return () => { cancelled = true };
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
