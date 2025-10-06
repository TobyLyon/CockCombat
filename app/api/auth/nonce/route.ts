import { NextRequest, NextResponse } from 'next/server';
import { authService } from '@/lib/auth-service';
import { auditLogger } from '@/lib/audit-logger';
import { withRateLimit, RATE_LIMITS } from '@/lib/rate-limiter';
import { z } from 'zod';

const RequestSchema = z.object({
  walletAddress: z.string().min(32),
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

      const { walletAddress } = parsed.data;
      const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined;
      const userAgent = req.headers.get('user-agent') || undefined;

      // Generate nonce
      const nonce = await authService.generateNonce(walletAddress, ipAddress, userAgent);

      // Build message to be signed
      const message = authService.buildAuthMessage(walletAddress, nonce);

      // Log nonce generation
      await auditLogger.log({
        eventType: 'auth_nonce_generated',
        actorWallet: walletAddress,
        ipAddress,
        userAgent,
        endpoint: '/api/auth/nonce',
        severity: 'info',
      });

      return NextResponse.json({
        nonce,
        message,
        expiresIn: 900, // 15 minutes in seconds
      });
    } catch (error) {
      console.error('Error generating nonce:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      return NextResponse.json(
        { error: 'Failed to generate authentication nonce', details: errorMessage },
        { status: 500 }
      );
    }
  });
}

