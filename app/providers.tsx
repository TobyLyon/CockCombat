"use client";
import { SolanaWalletProvider } from "@/components/wallet/solana-wallet-provider";
import { AuthProvider } from "@/contexts/AuthContext";
import { AudioProvider } from "@/contexts/AudioContext";
import { ProfileProvider } from "@/contexts/ProfileContext";
import { SocketProvider } from "@/hooks/use-socket";
import { WalletPromptProvider } from "@/contexts/WalletPromptContext";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SolanaWalletProvider>
      <AuthProvider>
        <WalletPromptProvider>
          <ProfileProvider>
            <SocketProvider>
              <AudioProvider>
                {children}
              </AudioProvider>
            </SocketProvider>
          </ProfileProvider>
        </WalletPromptProvider>
      </AuthProvider>
    </SolanaWalletProvider>
  );
}
