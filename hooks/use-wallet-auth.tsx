"use client"

import { useState, useEffect, useCallback, useRef } from 'react'
import { useWallet } from './use-wallet'
import { toast } from 'sonner'
import bs58 from 'bs58'
import { useLocalStorage } from './use-local-storage'

// User authentication state
interface AuthState {
  authenticated: boolean
  authSignature?: string
  authMessage?: string
  loading: boolean
}

const AUTH_MESSAGE = `Welcome to Cock Combat!

This signature is used to verify you own this wallet address.
This signature will not trigger any blockchain transaction or cost any fee.`

export function useWalletAuth() {
  const { connected, publicKey, signMessage, wallet } = useWallet()
  const [state, setState] = useState<AuthState>({
    authenticated: false,
    loading: false
  })
  
  // Flag to prevent multiple auth attempts
  const authAttemptedRef = useRef(false)
  
  // Flag to completely disable signing requirement (debug/fallback mode)
  const [disableSigning, setDisableSigning] = useLocalStorage<boolean>('disable_signing', false)
  
  // Store auth in localStorage to persist between sessions
  const [storedAuth, setStoredAuth] = useLocalStorage<{
    signature?: string
    address?: string
    timestamp?: number
  }>('wallet_auth', {})
  
  // Check if the current wallet supports message signing
  const supportsSignMessage = useCallback(() => {
    return !!signMessage && typeof signMessage === 'function'
  }, [signMessage])
  
  // Check if stored auth is valid (not expired and matches current wallet)
  const isStoredAuthValid = useCallback(() => {
    // If signing is disabled, just check if the address matches
    if (disableSigning && publicKey && storedAuth.address) {
      return storedAuth.address === publicKey.toString()
    }
    
    if (!publicKey || !storedAuth.address) {
      return false
    }
    
    // Check if auth is for current wallet
    if (storedAuth.address !== publicKey.toString()) {
      return false
    }
    
    // Check if auth is expired (24 hours)
    const expirationTime = 24 * 60 * 60 * 1000 // 24 hours in ms
    if (storedAuth.timestamp) {
      const now = Date.now()
      if (now - storedAuth.timestamp > expirationTime) {
        return false
      }
    } else {
      return false
    }
    
    // If the wallet doesn't support signing, we don't need a signature
    if (!supportsSignMessage()) {
      return true
    }
    
    // For wallets that support signing, verify signature exists
    return !!storedAuth.signature
  }, [publicKey, storedAuth, supportsSignMessage, disableSigning])
  
  // Initialize auth state from localStorage once on mount
  useEffect(() => {
    // Don't do anything if no wallet is connected
    if (!connected || !publicKey) return;
    
    // Check validity only once on mount
    if (isStoredAuthValid()) {
      console.log("Setting authenticated to true from stored auth");
      setState({
        authenticated: true,
        authSignature: storedAuth.signature,
        authMessage: AUTH_MESSAGE,
        loading: false
      });
    }
  }, []);
  
  // Reset auth state when wallet disconnects or changes
  useEffect(() => {
    const currentAddress = publicKey?.toString();
    const storedAddress = storedAuth.address;
    
    if (!connected) {
      // Reset when disconnected
      setState({
        authenticated: false,
        loading: false
      });
      authAttemptedRef.current = false;
    } else if (connected && currentAddress && storedAddress && currentAddress !== storedAddress) {
      // Reset when wallet address changes
      console.log("Wallet address changed, resetting auth state");
      setState({
        authenticated: false,
        loading: false
      });
      authAttemptedRef.current = false;
    }
  }, [connected, publicKey, storedAuth.address]);
  
  // Handle authentication on wallet connection
  useEffect(() => {
    // Don't do anything if no wallet is connected
    if (!connected || !publicKey) return;
    
    // Skip if already authenticated
    if (state.authenticated) return;
    
    // Skip if already trying to authenticate
    if (state.loading) return;
    
    // Skip if we've already tried to authenticate once
    if (authAttemptedRef.current) return;
    
    // If signing is disabled, auto-authenticate
    if (disableSigning) {
      console.log("Signing disabled, auto-authenticating");
      skipSigning();
      return;
    }
    
    // Check if we have valid stored auth
    if (isStoredAuthValid()) {
      console.log("Valid stored auth found, setting authenticated state");
      setState({
        authenticated: true,
        authSignature: storedAuth.signature,
        authMessage: AUTH_MESSAGE,
        loading: false
      });
    } 
    // Don't auto-trigger authentication anymore, as it leads to endless sign requests
    // Let the user explicitly trigger it
  }, [connected, publicKey, isStoredAuthValid, disableSigning, state.authenticated, state.loading]);
  
  // Sign message to authenticate
  const handleAuthentication = async () => {
    if (!connected || !publicKey) {
      setState({ authenticated: false, loading: false });
      return;
    }
    
    // Prevent multiple authentication attempts
    if (authAttemptedRef.current) {
      console.log("Authentication already attempted, skipping");
      return;
    }
    
    authAttemptedRef.current = true;
    setState(prev => ({ ...prev, loading: true }));
    
    try {
      let signatureStr = undefined;
      
      // Only attempt to sign message if the wallet supports it and signing isn't disabled
      if (supportsSignMessage() && !disableSigning) {
        // Create the message to sign with timestamp to prevent replay attacks
        const messageWithTimestamp = `${AUTH_MESSAGE}\n\nTimestamp: ${Date.now()}`;
        const message = new TextEncoder().encode(messageWithTimestamp);
        
        // Request user to sign the message
        if (signMessage) {
          console.log("Requesting signature from wallet");
          const signature = await signMessage(message);
          
          // Convert signature to string format
          signatureStr = bs58.encode(signature);
          console.log("Signature received");
        }
      } else {
        // For wallets that don't support signing, just skip the signature
        console.log("Skipping signature verification (not supported or disabled)");
      }
      
      // Store the auth info
      const authData = {
        signature: signatureStr,
        address: publicKey.toString(),
        timestamp: Date.now()
      };
      
      setStoredAuth(authData);
      
      // Update auth state
      setState({
        authenticated: true,
        authSignature: signatureStr,
        authMessage: AUTH_MESSAGE,
        loading: false
      });
      
      console.log('Successfully authenticated wallet');
      toast.success('Wallet authenticated successfully!');
    } catch (error) {
      console.error('Authentication error:', error);
      authAttemptedRef.current = false; // Allow retry on error
      toast.error('Failed to authenticate wallet. Please try again.');
      setState({ authenticated: false, loading: false });
    }
  };
  
  // Manual authentication method (for retrying)
  const authenticate = async () => {
    if (!connected) {
      toast.error('Please connect your wallet first');
      return false;
    }
    
    return handleAuthentication();
  };
  
  // Skip signing (for wallets without signing capability)
  const skipSigning = useCallback(() => {
    if (!connected || !publicKey) {
      return;
    }
    
    // Set auth without signature
    const authData = {
      address: publicKey.toString(),
      timestamp: Date.now()
    };
    
    // Mark signing as disabled for future sessions
    setDisableSigning(true);
    authAttemptedRef.current = true;
    
    setStoredAuth(authData);
    
    setState({
      authenticated: true,
      authMessage: AUTH_MESSAGE,
      loading: false
    });
    
    console.log('Skipped signature verification');
    toast.success('Wallet connected successfully!');
  }, [connected, publicKey, setStoredAuth, setDisableSigning]);
  
  // Sign out method
  const signOut = useCallback(() => {
    setStoredAuth({});
    setState({
      authenticated: false,
      loading: false
    });
    authAttemptedRef.current = false;
    // Don't reset disableSigning to preserve user preference
    toast.info('Signed out successfully');
  }, [setStoredAuth]);
  
  return {
    ...state,
    authenticate,
    signOut,
    skipSigning,
    disableSigning,
    setDisableSigning,
    supportsSignMessage: supportsSignMessage()
  };
} 