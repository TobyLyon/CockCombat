import { NextRequest, NextResponse } from 'next/server';
import { authService } from '@/lib/auth-service';
import { z } from 'zod';

const RequestSchema = z.object({
  sessionId: z.string().uuid(),
  walletAddress: z.string().min(32),
});

/**
 * Validate an existing session
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = RequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { sessionId, walletAddress } = parsed.data;

    const isValid = await authService.validateSession(sessionId, walletAddress);

    if (!isValid) {
      return NextResponse.json(
        { valid: false, message: 'Session expired or invalid' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      valid: true,
      walletAddress,
    });
  } catch (error) {
    console.error('Error validating session:', error);
    return NextResponse.json(
      { error: 'Failed to validate session' },
      { status: 500 }
    );
  }
}

/**
 * Invalidate a session (logout)
 */
export async function DELETE(req: NextRequest) {
  try {
    const { sessionId } = await req.json();

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID required' },
        { status: 400 }
      );
    }

    await authService.invalidateSession(sessionId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error invalidating session:', error);
    return NextResponse.json(
      { error: 'Failed to invalidate session' },
      { status: 500 }
    );
  }
}

