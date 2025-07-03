"use client"

import React, {
  createContext,
  useContext,
  useCallback,
  ReactNode,
  useRef,
  useEffect,
} from "react"
import { useWalletModal } from "@solana/wallet-adapter-react-ui"
import { useWallet } from "@solana/wallet-adapter-react"
import { useAuth } from "@/contexts/AuthContext"

type ActionCallback = () => void;

interface WalletPromptContextType {
  promptWallet: (action?: ActionCallback) => void;
  closePrompt: () => void;
  onConnectAction: React.MutableRefObject<ActionCallback | null>;
}

const WalletPromptContext = createContext<WalletPromptContextType | undefined>(
  undefined
)

export function WalletPromptProvider({ children }: { children: ReactNode }) {
  const { setVisible } = useWalletModal()
  const { connected } = useWallet()
  const { signIn, authenticated } = useAuth()
  const onConnectAction = useRef<ActionCallback | null>(null);

  const promptWallet = useCallback(
    async (action?: ActionCallback) => {
      if (action) {
        onConnectAction.current = action;
      }

      if (!connected) {
        setVisible(true);
      } else if (!authenticated) {
        const success = await signIn();
        if (success && onConnectAction.current) {
          onConnectAction.current();
          onConnectAction.current = null;
        }
      } else {
        action?.();
      }
    },
    [connected, authenticated, setVisible, signIn]
  );

  const closePrompt = useCallback(() => {
    onConnectAction.current = null;
  }, []);

  return (
    <WalletPromptContext.Provider value={{ promptWallet, closePrompt, onConnectAction }}>
      {children}
    </WalletPromptContext.Provider>
  )
}

export function useWalletPrompt() {
  const context = useContext(WalletPromptContext)
  if (context === undefined) {
    throw new Error("useWalletPrompt must be used within a WalletPromptProvider")
  }
  return context
} 