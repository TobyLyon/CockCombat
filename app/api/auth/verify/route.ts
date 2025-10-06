import { NextRequest, NextResponse } from 'next/server';
import { authService } from '@/lib/auth-service';
import { auditLogger } from '@/lib/audit-logger';
import { withRateLimit, RATE_LIMITS } from '@/lib/rate-limiter';
import { z } from 'zod';

const RequestSchema = z.object({
  walletAddress: z.string().min(32),
  signature: z.string().min(32),
  nonce: z.string().min(32),
});

export async function POST(req: NextRequest) {
  return withRateLimit(req, RATE_LIMITS.AUTH, async () => {
    try {
      const body = await req.json();
      const parsed = RequestSchema.safeParse(body);

      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid request', details: parsed.error.flatten() },
          { status: 400 }
        );
      }

      const { walletAddress, signature, nonce } = parsed.data;
      const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined;

      // Check for signature replay
      const isUsed = await authService.isSignatureUsed(signature);
      if (isUsed) {
        await auditLogger.logSuspiciousActivity(
          'Signature replay attempt',
          walletAddress,
          ipAddress,
          { signature, nonce }
        );
        
        return NextResponse.json(
          { error: 'Signature has already been used' },
          { status: 400 }
        );
      }

      // Authenticate
      const session = await authService.authenticateWallet(
        walletAddress,
        signature,
        nonce,
        ipAddress
      );

      if (!session) {
        await auditLogger.logAuthFailure(walletAddress, 'Invalid signature or expired nonce', ipAddress);
        
        return NextResponse.json(
          { error: 'Authentication failed', message: 'Invalid signature or expired nonce' },
          { status: 401 }
        );
      }

      // Mark signature as used
      await authService.markSignatureUsed(
        signature,
        walletAddress,
        '/api/auth/verify',
        { nonce }
      );

      // Log successful auth
      await auditLogger.logAuthSuccess(walletAddress, ipAddress);

      // Return session token (we'll use the session ID as a bearer token)
      return NextResponse.json({
        success: true,
        sessionId: session.id,
        walletAddress: session.walletAddress,
        expiresAt: session.expiresAt.toISOString(),
      });
    } catch (error) {
      console.error('Error verifying signature:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      return NextResponse.json(
        { error: 'Authentication failed', details: errorMessage },
        { status: 500 }
      );
    }
  });
}

