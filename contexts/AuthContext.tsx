"use client"

import React, { createContext, useContext, ReactNode } from 'react';
import { useWalletAuth as useWalletAuthHook } from '@/hooks/use-wallet-auth';

interface AuthContextType {
  authenticated: boolean;
  loading: boolean;
  sessionId: string | null;
  signIn: () => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useWalletAuthHook();
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
} 