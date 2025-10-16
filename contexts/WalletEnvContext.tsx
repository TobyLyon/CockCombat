"use client"

import React, { createContext, useContext } from "react"

interface WalletEnvShape {
  hasWalletProvider: boolean
}

const WalletEnvContext = createContext<WalletEnvShape>({ hasWalletProvider: false })

export function WalletEnvProvider({ children }: { children: React.ReactNode }) {
  return (
    <WalletEnvContext.Provider value={{ hasWalletProvider: true }}>
      {children}
    </WalletEnvContext.Provider>
  )
}

export function useWalletEnv() {
  return useContext(WalletEnvContext)
}


