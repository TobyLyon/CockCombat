"use client";
import { AuthProvider } from "../contexts/AuthContext";
import { AudioProvider } from "../contexts/AudioContext";
import { ProfileProvider } from "../contexts/ProfileContext";
import { SocketProvider } from "../hooks/use-socket";
import { WalletPromptProvider } from "../contexts/WalletPromptContext";
import { isBsc } from "../lib/chain";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { clusterApiUrl } from "@solana/web3.js";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
  CoinbaseWalletAdapter,
  BackpackWalletAdapter,
  SolletWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import "@solana/wallet-adapter-react-ui/styles.css";

export default function Providers({ children }: { children: React.ReactNode }) {
  const network = (process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet') as 'devnet' | 'testnet' | 'mainnet-beta';
  const endpoint = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl(network);
  const wallets = [
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter(),
    new CoinbaseWalletAdapter(),
    new BackpackWalletAdapter(),
    new SolletWalletAdapter({ network }),
  ];

  const content = (
    <AuthProvider>
      <ConnectionProvider endpoint={endpoint}>
        <WalletProvider wallets={wallets} autoConnect>
          <WalletModalProvider>
            <WalletPromptProvider>
              <ProfileProvider>
                <SocketProvider>
                  <AudioProvider>
                    {children}
                  </AudioProvider>
                </SocketProvider>
              </ProfileProvider>
            </WalletPromptProvider>
          </WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </AuthProvider>
  );

  return content as any;
}
