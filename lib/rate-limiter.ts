/**
 * Rate Limiter
 * 
 * Middleware for rate limiting API requests
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { auditLogger } from './audit-logger';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  identifier?: (req: NextRequest) => string;
  skipSuccessfulRequests?: boolean;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

class RateLimiter {
  private static instance: RateLimiter | null = null;
  private supabase;
  private inMemoryStore: Map<string, { count: number; resetAt: number }> = new Map();

  private constructor() {
    this.supabase = createClient(supabaseUrl, supabaseServiceKey);
    this.startCleanupInterval();
  }

  public static getInstance(): RateLimiter {
    if (!RateLimiter.instance) {
      RateLimiter.instance = new RateLimiter();
    }
    return RateLimiter.instance;
  }

  /**
   * Check rate limit for a request
   */
  public async checkLimit(
    identifier: string,
    endpoint: string,
    config: RateLimitConfig
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - config.windowMs;
    const resetAt = new Date(now + config.windowMs);

    // Try in-memory first for speed
    const key = `${identifier}:${endpoint}`;
    const inMemoryLimit = this.inMemoryStore.get(key);

    if (inMemoryLimit && inMemoryLimit.resetAt > now) {
      if (inMemoryLimit.count >= config.maxRequests) {
        return {
          allowed: false,
          remaining: 0,
          resetAt,
        };
      }
      inMemoryLimit.count++;
      return {
        allowed: true,
        remaining: config.maxRequests - inMemoryLimit.count,
        resetAt,
      };
    }

    // Check database
    try {
      const { data: existing, error } = await this.supabase
        .from('rate_limit_log')
        .select('*')
        .eq('identifier', identifier)
        .eq('endpoint', endpoint)
        .gte('window_start', new Date(windowStart).toISOString())
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Rate limit check error:', error);
        // Fail open (allow request) if database is down
        return { allowed: true, remaining: config.maxRequests - 1, resetAt };
      }

      if (existing) {
        const currentCount = existing.request_count || 0;

        if (currentCount >= config.maxRequests) {
          // Rate limit exceeded
          await auditLogger.logRateLimitExceeded(identifier, endpoint);
          return {
            allowed: false,
            remaining: 0,
            resetAt: new Date(existing.window_start),
          };
        }

        // Increment count
        await this.supabase
          .from('rate_limit_log')
          .update({
            request_count: currentCount + 1,
            last_request: new Date().toISOString(),
          })
          .eq('id', existing.id);

        // Update in-memory cache
        this.inMemoryStore.set(key, {
          count: currentCount + 1,
          resetAt: new Date(existing.window_start).getTime() + config.windowMs,
        });

        return {
          allowed: true,
          remaining: config.maxRequests - currentCount - 1,
          resetAt: new Date(existing.window_start),
        };
      } else {
        // Create new entry
        await this.supabase
          .from('rate_limit_log')
          .insert({
            identifier,
            endpoint,
            request_count: 1,
            window_start: new Date().toISOString(),
            last_request: new Date().toISOString(),
          });

        // Update in-memory cache
        this.inMemoryStore.set(key, {
          count: 1,
          resetAt: now + config.windowMs,
        });

        return {
          allowed: true,
          remaining: config.maxRequests - 1,
          resetAt,
        };
      }
    } catch (error) {
      console.error('Rate limiter error:', error);
      // Fail open if there's an error
      return { allowed: true, remaining: config.maxRequests - 1, resetAt };
    }
  }

  /**
   * Get identifier from request (IP or wallet)
   */
  public getIdentifier(req: NextRequest, walletAddress?: string): string {
    if (walletAddress) {
      return `wallet:${walletAddress}`;
    }

    // Try to get IP from various headers
    const forwarded = req.headers.get('x-forwarded-for');
    const realIp = req.headers.get('x-real-ip');
    const ip = forwarded?.split(',')[0] || realIp || 'unknown';
    
    return `ip:${ip}`;
  }

  /**
   * Clean up expired in-memory entries
   */
  private startCleanupInterval(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [key, value] of this.inMemoryStore.entries()) {
        if (value.resetAt < now) {
          this.inMemoryStore.delete(key);
        }
      }
    }, 60000); // Clean up every minute
  }
}

/**
 * Rate limit middleware wrapper
 */
export async function withRateLimit(
  req: NextRequest,
  config: RateLimitConfig,
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  const rateLimiter = RateLimiter.getInstance();
  const endpoint = req.nextUrl.pathname;
  
  // Get identifier WITHOUT consuming request body (use IP-based for now)
  let identifier: string;
  
  if (config.identifier) {
    identifier = config.identifier(req);
  } else {
    // Use IP address for rate limiting to avoid consuming request body
    identifier = rateLimiter.getIdentifier(req);
  }

  const result = await rateLimiter.checkLimit(identifier, endpoint, config);

  if (!result.allowed) {
    return NextResponse.json(
      {
        error: 'Too many requests',
        message: 'Rate limit exceeded. Please try again later.',
        resetAt: result.resetAt.toISOString(),
      },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': config.maxRequests.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': result.resetAt.getTime().toString(),
          'Retry-After': Math.ceil((result.resetAt.getTime() - Date.now()) / 1000).toString(),
        },
      }
    );
  }

  // Add rate limit headers to response
  const response = await handler();
  
  response.headers.set('X-RateLimit-Limit', config.maxRequests.toString());
  response.headers.set('X-RateLimit-Remaining', result.remaining.toString());
  response.headers.set('X-RateLimit-Reset', result.resetAt.getTime().toString());

  return response;
}

export const rateLimiter = RateLimiter.getInstance();
export default rateLimiter;

/**
 * Common rate limit configurations
 */
export const RATE_LIMITS = {
  // Very strict for authentication
  AUTH: { maxRequests: 5, windowMs: 15 * 60 * 1000 }, // 5 per 15 min
  
  // Moderate for profile operations
  PROFILE: { maxRequests: 20, windowMs: 60 * 1000 }, // 20 per minute
  
  // Strict for financial operations
  WAGER: { maxRequests: 10, windowMs: 60 * 1000 }, // 10 per minute
  PAYOUT: { maxRequests: 5, windowMs: 60 * 1000 }, // 5 per minute
  
  // Moderate for lobby operations
  LOBBY: { maxRequests: 30, windowMs: 60 * 1000 }, // 30 per minute
  
  // Lenient for read operations
  READ: { maxRequests: 100, windowMs: 60 * 1000 }, // 100 per minute
};

