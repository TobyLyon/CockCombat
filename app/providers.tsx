"use client";
import { SolanaWalletProvider } from "@/components/wallet/solana-wallet-provider";
import { AudioProvider } from "@/contexts/AudioContext";
import { ProfileProvider } from "@/contexts/ProfileContext";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SolanaWalletProvider>
      <AudioProvider>
        <ProfileProvider>
          {children}
        </ProfileProvider>
      </AudioProvider>
    </SolanaWalletProvider>
  );
}
