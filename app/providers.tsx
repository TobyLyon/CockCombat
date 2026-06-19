"use client";
import { AuthProvider } from "../contexts/AuthContext";
import { AudioProvider } from "../contexts/AudioContext";
import { ProfileProvider } from "../contexts/ProfileContext";
import { SocketProvider } from "../hooks/use-socket";
import { WalletPromptProvider } from "../contexts/WalletPromptContext";
import { isBsc } from "../lib/chain";
import { Toaster } from "sonner";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletEnvProvider } from "../contexts/WalletEnvContext";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { clusterApiUrl } from "@solana/web3.js";
import { getBrowserSolanaRpcEndpoint } from "../lib/solana-rpc";
import {
  TorusWalletAdapter,
  LedgerWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import "@solana/wallet-adapter-react-ui/styles.css";

export default function Providers({ children }: { children: React.ReactNode }) {
  const network = (process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet') as 'devnet' | 'testnet' | 'mainnet-beta';
  const endpointBase = (() => {
    const configured = process.env.NEXT_PUBLIC_SOLANA_RPC_URL
    if (configured && String(configured).trim()) return String(configured).trim()
    return getBrowserSolanaRpcEndpoint()
  })();
  // Optionally append Helius rebate-address on mainnet
  const endpoint = (() => {
    try {
      const rebate = process.env.NEXT_PUBLIC_HELIUS_REBATE_ADDRESS || '';
      const isHelius = /helius/i.test(String(endpointBase || ''));
      if (network === 'mainnet-beta' && rebate && isHelius) {
        const sep = endpointBase.includes('?') ? '&' : '?';
        return `${endpointBase}${sep}rebate-address=${encodeURIComponent(rebate)}`;
      }
    } catch {}
    return endpointBase;
  })();
  // Phantom, Solflare, Coinbase, Trust, etc. now register themselves via the
  // Wallet Standard and are auto-detected. Registering their legacy adapters too
  // creates a duplicate Phantom entry whose stale window.solana path holds onto an
  // old account and ignores in-wallet account switches ("sticks to old wallet").
  // Only register adapters that are NOT auto-detected (hardware / OAuth).
  const wallets = [
    new TorusWalletAdapter(),
    new LedgerWalletAdapter(),
  ];

  const content = (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletEnvProvider>
          <WalletModalProvider>
            <AuthProvider>
              <WalletPromptProvider>
                <ProfileProvider>
                  <SocketProvider>
                    <AudioProvider>
                      {children}
                      <Toaster
                        position="top-left"
                        offset={{
                          top: "calc(var(--cc-nav-h, 56px) + 8px)",
                          left: 12,
                        }}
                        closeButton
                        toastOptions={{
                          classNames: {
                            toast:
                              "bg-white/10 text-white border border-white/15 backdrop-blur-md shadow-xl",
                            title: "text-white",
                            description: "text-white/80",
                            actionButton: "bg-white/15 text-white hover:bg-white/20",
                            closeButton:
                              "bg-white text-black hover:bg-white/90 border border-white/40",
                          },
                        }}
                      />
                    </AudioProvider>
                  </SocketProvider>
                </ProfileProvider>
              </WalletPromptProvider>
            </AuthProvider>
          </WalletModalProvider>
        </WalletEnvProvider>
      </WalletProvider>
    </ConnectionProvider>
  );

  return content as any;
}
