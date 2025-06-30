"use client"

import { useState, useEffect, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { toast } from 'sonner';
import * as tokenService from '@/lib/token-service';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { PublicKey } from '@solana/web3.js';

// Default token configuration from environment variables
const DEFAULT_TOKEN_MINT = process.env.NEXT_PUBLIC_COCK_TOKEN_MINT || '';
const GAME_ESCROW_WALLET = process.env.NEXT_PUBLIC_GAME_ESCROW_WALLET || '';

// Admin wallet for token creation/airdrop (should be in environment variables)
const ADMIN_WALLET = process.env.NEXT_PUBLIC_ADMIN_WALLET || '';

export interface TokenHookResult {
  // Token state
  tokenMint: string | null;
  balance: number;
  isLoading: boolean;
  escrowWallet: string;
  
  // Token actions
  refreshBalance: () => Promise<void>;
  placeBet: (amount: number) => Promise<boolean>;
  airdropTokens: (amount: number) => Promise<boolean>;
  createToken: (supply: number) => Promise<string | null>;
  claimWinnings: (amount: number, matchId?: string) => Promise<boolean>;
  setEscrowWallet: (address: string) => void;
}

export function useToken(): TokenHookResult {
  const { connection } = useConnection();
  const { publicKey, connected, signTransaction } = useWallet();
  
  // State for token data
  const [tokenMint, setTokenMint] = useLocalStorage('cockTokenMint', DEFAULT_TOKEN_MINT);
  const [balance, setBalance] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [escrowWallet, setEscrowWallet] = useLocalStorage('cockEscrowWallet', GAME_ESCROW_WALLET);
  
  // Initialize token service with stored mint address and escrow wallet
  useEffect(() => {
    if (tokenMint) {
      tokenService.initializeTokenService(tokenMint, escrowWallet);
    }
  }, [tokenMint, escrowWallet]);
  
  // Refresh balance whenever connection or wallet changes
  useEffect(() => {
    if (connected && publicKey) {
      refreshBalance();
    } else {
      setBalance(0);
    }
  }, [connected, publicKey]);
  
  // Function to update escrow wallet
  const updateEscrowWallet = useCallback((address: string) => {
    setEscrowWallet(address);
    tokenService.setEscrowWalletAddress(address);
    toast.success(`Escrow wallet updated to ${address.slice(0, 6)}...${address.slice(-4)}`);
  }, [setEscrowWallet]);
  
  // Function to refresh token balance
  const refreshBalance = useCallback(async () => {
    if (!connected || !publicKey || !tokenMint) {
      setBalance(0);
      return;
    }
    
    setIsLoading(true);
    try {
      const balance = await tokenService.getTokenBalance(
        connection,
        publicKey.toString()
      );
      setBalance(balance);
    } catch (error) {
      console.error('Error fetching token balance:', error);
      toast.error('Failed to fetch token balance');
    } finally {
      setIsLoading(false);
    }
  }, [connection, connected, publicKey, tokenMint]);
  
  // Admin function to airdrop tokens (for testing)
  const airdropTokens = useCallback(
    async (amount: number): Promise<boolean> => {
      if (!connected || !publicKey || !tokenMint) {
        toast.error('Please connect your wallet first');
        return false;
      }
      
      setIsLoading(true);
      try {
        // Create payer object with public key and sign transaction capability
        const payer = {
          publicKey: publicKey,
          signTransaction: signTransaction!
        };
        
        // Mint new tokens to the wallet
        // In a real implementation, this would be restricted to admin wallets
        // For demo purposes, we'll allow any wallet to airdrop
        await tokenService.transferTokens(
          connection,
          payer,
          ADMIN_WALLET || publicKey.toString(),
          publicKey.toString(),
          amount
        );
        
        toast.success(`Airdropped ${amount} $COCK tokens!`);
        
        // Refresh balance after successful airdrop
        await refreshBalance();
        
        return true;
      } catch (error) {
        console.error('Error airdropping tokens:', error);
        toast.error('Failed to airdrop tokens');
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [connection, connected, publicKey, tokenMint, refreshBalance, signTransaction]
  );
  
  // Function to place a bet with tokens
  const placeBet = useCallback(
    async (amount: number): Promise<boolean> => {
      if (!connected || !publicKey || !tokenMint || !escrowWallet) {
        toast.error('Please connect your wallet first');
        return false;
      }
      
      setIsLoading(true);
      try {
        // Create payer object with public key and sign transaction capability
        const payer = {
          publicKey: publicKey,
          signTransaction: signTransaction!
        };
        
        // Try to place the bet using the token service
        await tokenService.transferTokens(
          connection,
          payer,
          publicKey.toString(),
          escrowWallet,
          amount
        );
        
        toast.success(`Bet of ${amount} $COCK tokens placed successfully!`);
        
        // Refresh balance after successful bet
        await refreshBalance();
        return true;
      } catch (error) {
        console.error('Error placing bet:', error);
        toast.error('Failed to place bet');
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [connection, connected, publicKey, tokenMint, escrowWallet, refreshBalance, signTransaction]
  );
  
  // Function to claim winnings from escrow
  const claimWinnings = useCallback(
    async (amount: number, matchId: string = 'default-match'): Promise<boolean> => {
      if (!connected || !publicKey || !tokenMint || !escrowWallet) {
        toast.error('Please connect your wallet first');
        return false;
      }
      
      // Ensure the amount is valid
      if (amount <= 0) {
        toast.error('Invalid winning amount');
        return false;
      }
      
      setIsLoading(true);
      try {
        // First, validate the claim with the server
        const validationResponse = await fetch('/api/token/claim-winnings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            walletAddress: publicKey.toString(),
            amount,
            matchId,
            // In a full implementation, we would include a signature here
            // to prove wallet ownership
          }),
        });
        
        const validationData = await validationResponse.json();
        
        if (!validationResponse.ok || !validationData.success) {
          const errorMessage = validationData.error || 'Failed to validate winnings claim';
          toast.error(errorMessage);
          return false;
        }
        
        // If server validation succeeded, process the token transfer
        // In a production environment with proper security:
        // 1. The server would handle the actual token transfer from escrow
        // 2. We might just display a success message here
        
        // For demo purposes, we'll just simulate a successful claim
        toast.success(`Won ${amount} $COCK tokens!`);
        
        // Simulate the claim by airdropping tokens 
        // In a real implementation, this would transfer from the escrow wallet
        // using a server-signed transaction
        await airdropTokens(amount);
        
        return true;
      } catch (error) {
        console.error('Error claiming winnings:', error);
        toast.error('Failed to claim winnings');
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [connection, connected, publicKey, tokenMint, escrowWallet, airdropTokens]
  );
  
  // Admin function to create token (for testing)
  const createToken = useCallback(
    async (supply: number): Promise<string | null> => {
      if (!connected || !publicKey) {
        toast.error('Please connect your wallet first');
        return null;
      }
      
      // Check if the connected wallet is authorized (in a real app, check admin status)
      // For demo purposes, we'll allow any wallet to create tokens
      
      setIsLoading(true);
      try {
        // Create payer object with public key and sign transaction capability
        const payer = {
          publicKey: publicKey,
          signTransaction: signTransaction!
        };
        
        // Create a new token
        const mintAddress = await tokenService.createToken(
          connection,
          payer,
          supply
        );
        
        // Set the token mint address
        setTokenMint(mintAddress);
        toast.success(`Token created with mint address: ${mintAddress}`);
        
        return mintAddress;
      } catch (error) {
        console.error('Error creating token:', error);
        toast.error('Failed to create token');
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [connection, connected, publicKey, setTokenMint, signTransaction]
  );
  
  return {
    tokenMint,
    balance,
    isLoading,
    escrowWallet,
    refreshBalance,
    placeBet,
    airdropTokens,
    createToken,
    claimWinnings,
    setEscrowWallet: updateEscrowWallet
  };
} 