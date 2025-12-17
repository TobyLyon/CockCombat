/**
 * Authentication Service
 * 
 * Provides wallet-based authentication using message signing.
 * Sign-In With Ethereum (SIWE)-style for BSC (EVM).
 */

import { isBsc } from './chain';
import { ethers } from 'ethers';
import nacl from 'tweetnacl';
import { createClient } from '@supabase/supabase-js';
import bs58 from 'bs58';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface AuthSession {
  id: string;
  walletAddress: string;
  nonce: string;
  expiresAt: Date;
  isValid: boolean;
}

interface VerifySignatureParams {
  walletAddress: string;
  signature: string;
  message: string;
}

class AuthService {
  private static instance: AuthService | null = null;
  private supabase;

  private constructor() {
    if (supabaseUrl && supabaseServiceKey) {
      this.supabase = createClient(supabaseUrl, supabaseServiceKey);
    } else {
      console.warn('⚠️ Auth service: Supabase credentials missing');
    }
  }

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  /**
   * Generate a nonce for wallet authentication
   */
  public async generateNonce(walletAddress: string, ipAddress?: string, userAgent?: string): Promise<string> {
    const nonce = this.createRandomNonce();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Store nonce in database
    const { error } = await this.supabase
      .from('auth_sessions')
      .insert({
        wallet_address: walletAddress,
        nonce,
        expires_at: expiresAt.toISOString(),
        ip_address: ipAddress,
        user_agent: userAgent,
        is_valid: true,
      });

    if (error) {
      console.error('Failed to store nonce:', error);
      throw new Error('Failed to generate authentication nonce');
    }

    return nonce;
  }

  /**
   * Verify a signed message from a wallet
   */
  public async verifySignature(params: VerifySignatureParams): Promise<boolean> {
    const { walletAddress, signature, message } = params;

    try {
      if (isBsc()) {
        const recovered = ethers.verifyMessage(message, signature);
        return recovered.toLowerCase() === walletAddress.toLowerCase();
      }
      // Solana: signature is base58, walletAddress is base58, verify Ed25519
      const sigBytes = (await import('bs58')).default.decode(signature);
      const pubkeyBytes = (await import('bs58')).default.decode(walletAddress);
      const messageBytes = new TextEncoder().encode(message);
      return nacl.sign.detached.verify(messageBytes, sigBytes, pubkeyBytes);
    } catch (error) {
      console.error('Signature verification error:', error);
      return false;
    }
  }

  /**
   * Verify authentication and return session
   */
  public async authenticateWallet(
    walletAddress: string,
    signature: string,
    nonce: string,
    ipAddress?: string
  ): Promise<AuthSession | null> {
    try {
      // Find the session with this nonce
      const { data: session, error } = await this.supabase
        .from('auth_sessions')
        .select('*')
        .eq('wallet_address', walletAddress)
        .eq('nonce', nonce)
        .eq('is_valid', true)
        .single();

      if (error || !session) {
        console.error('Session not found:', error);
        return null;
      }

      // Check if session is expired
      if (new Date(session.expires_at) < new Date()) {
        console.error('Session expired');
        await this.invalidateSession(session.id);
        return null;
      }

      // Build the message that should have been signed
      const message = this.buildAuthMessage(walletAddress, nonce);

      // Verify the signature
      const isValid = await this.verifySignature({
        walletAddress,
        signature,
        message,
      });

      if (!isValid) {
        console.error('Invalid signature');
        return null;
      }

      // Update session with signature and extend expiration
      const newExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      const { error: updateError } = await this.supabase
        .from('auth_sessions')
        .update({
          signature,
          expires_at: newExpiresAt.toISOString(),
          last_active: new Date().toISOString(),
        })
        .eq('id', session.id);

      if (updateError) {
        console.error('Failed to update session:', updateError);
        return null;
      }

      return {
        id: session.id,
        walletAddress: session.wallet_address,
        nonce: session.nonce,
        expiresAt: newExpiresAt,
        isValid: true,
      };
    } catch (error) {
      console.error('Authentication error:', error);
      return null;
    }
  }

  /**
   * Validate an existing session
   */
  public async validateSession(sessionId: string, walletAddress: string): Promise<boolean> {
    try {
      const { data: session, error } = await this.supabase
        .from('auth_sessions')
        .select('*')
        .eq('id', sessionId)
        .eq('wallet_address', walletAddress)
        .eq('is_valid', true)
        .single();

      if (error || !session) {
        return false;
      }

      // Check if session is expired
      if (new Date(session.expires_at) < new Date()) {
        await this.invalidateSession(sessionId);
        return false;
      }

      // Update last active time
      await this.supabase
        .from('auth_sessions')
        .update({ last_active: new Date().toISOString() })
        .eq('id', sessionId);

      return true;
    } catch (error) {
      console.error('Session validation error:', error);
      return false;
    }
  }

  /**
   * Invalidate a session (logout)
   */
  public async invalidateSession(sessionId: string): Promise<void> {
    await this.supabase
      .from('auth_sessions')
      .update({ is_valid: false })
      .eq('id', sessionId);
  }

  /**
   * Build the authentication message to be signed
   */
  public buildAuthMessage(walletAddress: string, nonce: string): string {
    return `Welcome to Cock Combat!\n\nSign this message to authenticate your wallet.\n\nWallet: ${walletAddress}\nNonce: ${nonce}\n\nThis request will not trigger any blockchain transaction or cost any gas fees.`;
  }

  /**
   * Create a random nonce
   */
  private createRandomNonce(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return bs58.encode(array);
  }

  /**
   * Check if a signature has been used before (replay protection)
   */
  public async isSignatureUsed(signature: string): Promise<boolean> {
    if (!this.supabase) {
      throw new Error('Replay protection unavailable (Supabase not configured)');
    }

    try {
      const { data, error } = await this.supabase
        .from('used_signatures')
        .select('signature')
        .eq('signature', signature)
        .single();

      return !error && !!data;
    } catch (error) {
      throw new Error(`Replay protection check failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Mark a signature as used
   */
  public async markSignatureUsed(
    signature: string,
    walletAddress: string,
    endpoint: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    if (!this.supabase) {
      throw new Error('Replay protection unavailable (Supabase not configured)');
    }

    try {
      const { error } = await this.supabase
        .from('used_signatures')
        .insert({
          signature,
          wallet_address: walletAddress,
          endpoint,
          metadata: metadata || {},
        });
      if (error) {
        throw error;
      }
    } catch (error) {
      throw new Error(`Failed to persist replay protection record: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

export const authService = AuthService.getInstance();
export default authService;

