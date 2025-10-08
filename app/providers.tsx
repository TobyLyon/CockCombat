"use client";
import { AuthProvider } from "@/contexts/AuthContext";
import { AudioProvider } from "@/contexts/AudioContext";
import { ProfileProvider } from "@/contexts/ProfileContext";
import { SocketProvider } from "@/hooks/use-socket";
import { WalletPromptProvider } from "@/contexts/WalletPromptContext";
import { isBsc } from "@/lib/chain";

export default function Providers({ children }: { children: React.ReactNode }) {
  const content = (
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
  );

  // EVM-only build: always return content without Solana provider
  return content as any;
}
