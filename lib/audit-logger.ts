/**
 * Audit Logger
 * 
 * Centralized logging for security-relevant events
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type EventType = 
  | 'auth_nonce_generated'
  | 'auth_success'
  | 'auth_failure'
  | 'lobby_join'
  | 'lobby_leave'
  | 'wager_created'
  | 'wager_confirmed'
  | 'match_started'
  | 'match_completed'
  | 'payout_executed'
  | 'payout_failed'
  | 'profile_created'
  | 'profile_updated'
  | 'rate_limit_exceeded'
  | 'suspicious_activity'
  | 'error';

type Severity = 'info' | 'warning' | 'error' | 'critical';

interface AuditLogEntry {
  eventType: EventType;
  actorWallet?: string;
  targetWallet?: string;
  endpoint?: string;
  ipAddress?: string;
  userAgent?: string;
  requestBody?: any;
  responseStatus?: number;
  metadata?: Record<string, any>;
  severity?: Severity;
}

class AuditLogger {
  private static instance: AuditLogger | null = null;
  private supabase;
  private buffer: AuditLogEntry[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private readonly BUFFER_SIZE = 50;
  private readonly FLUSH_INTERVAL = 5000; // 5 seconds

  private constructor() {
    try {
      if (supabaseUrl && supabaseServiceKey) {
        this.supabase = createClient(supabaseUrl, supabaseServiceKey);
        this.startPeriodicFlush();
      }
    } catch (error) {
      console.warn('⚠️ Audit logger failed to initialize, logging will be console-only:', error);
    }
  }

  public static getInstance(): AuditLogger {
    if (!AuditLogger.instance) {
      AuditLogger.instance = new AuditLogger();
    }
    return AuditLogger.instance;
  }

  /**
   * Log an event
   */
  public async log(entry: AuditLogEntry): Promise<void> {
    const logEntry = {
      timestamp: new Date().toISOString(),
      event_type: entry.eventType,
      actor_wallet: entry.actorWallet || null,
      target_wallet: entry.targetWallet || null,
      endpoint: entry.endpoint || null,
      ip_address: entry.ipAddress || null,
      user_agent: entry.userAgent || null,
      request_body: entry.requestBody || null,
      response_status: entry.responseStatus || null,
      metadata: entry.metadata || {},
      severity: entry.severity || 'info',
    };

    // Buffer the log entry
    this.buffer.push(logEntry as any);

    // Log to console for immediate visibility
    this.logToConsole(logEntry);

    // Flush if buffer is full
    if (this.buffer.length >= this.BUFFER_SIZE) {
      await this.flush();
    }
  }

  /**
   * Log authentication success
   */
  public async logAuthSuccess(walletAddress: string, ipAddress?: string): Promise<void> {
    await this.log({
      eventType: 'auth_success',
      actorWallet: walletAddress,
      ipAddress,
      severity: 'info',
      metadata: { timestamp: Date.now() },
    });
  }

  /**
   * Log authentication failure
   */
  public async logAuthFailure(walletAddress: string, reason: string, ipAddress?: string): Promise<void> {
    await this.log({
      eventType: 'auth_failure',
      actorWallet: walletAddress,
      ipAddress,
      severity: 'warning',
      metadata: { reason, timestamp: Date.now() },
    });
  }

  /**
   * Log payout execution
   */
  public async logPayout(
    winnerWallet: string,
    amount: number,
    matchId?: string,
    signature?: string
  ): Promise<void> {
    await this.log({
      eventType: 'payout_executed',
      targetWallet: winnerWallet,
      severity: 'critical',
      metadata: {
        amount,
        matchId,
        signature,
        timestamp: Date.now(),
      },
    });
  }

  /**
   * Log suspicious activity
   */
  public async logSuspiciousActivity(
    description: string,
    walletAddress?: string,
    ipAddress?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.log({
      eventType: 'suspicious_activity',
      actorWallet: walletAddress,
      ipAddress,
      severity: 'critical',
      metadata: {
        description,
        ...metadata,
        timestamp: Date.now(),
      },
    });
  }

  /**
   * Log rate limit exceeded
   */
  public async logRateLimitExceeded(
    identifier: string,
    endpoint: string,
    ipAddress?: string
  ): Promise<void> {
    await this.log({
      eventType: 'rate_limit_exceeded',
      actorWallet: identifier,
      endpoint,
      ipAddress,
      severity: 'warning',
      metadata: { timestamp: Date.now() },
    });
  }

  /**
   * Flush buffered logs to database
   */
  private async flush(): Promise<void> {
    if (this.buffer.length === 0 || !this.supabase) return;

    const logsToFlush = [...this.buffer];
    this.buffer = [];

    try {
      const { error } = await this.supabase
        .from('audit_logs')
        .insert(logsToFlush);

      if (error) {
        // Silently fail if table doesn't exist (graceful degradation)
        if (error.code === '42P01') {
          console.warn('⚠️ audit_logs table not found, skipping flush (run migration)');
          return;
        }
        console.error('Failed to flush audit logs:', error);
        // Put them back in the buffer to retry
        this.buffer.unshift(...logsToFlush);
      }
    } catch (error) {
      console.error('Error flushing audit logs:', error);
      // Don't put back in buffer if it's a table missing error
      if (!(error instanceof Error && error.message.includes('relation'))) {
        this.buffer.unshift(...logsToFlush);
      }
    }
  }

  /**
   * Start periodic flush
   */
  private startPeriodicFlush(): void {
    this.flushInterval = setInterval(() => {
      this.flush().catch(console.error);
    }, this.FLUSH_INTERVAL);
  }

  /**
   * Stop periodic flush (for cleanup)
   */
  public stopPeriodicFlush(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
  }

  /**
   * Log to console for immediate visibility
   */
  private logToConsole(entry: any): void {
    const emoji = this.getSeverityEmoji(entry.severity);
    const message = `${emoji} [${entry.event_type}] ${entry.actor_wallet || 'system'}`;
    
    switch (entry.severity) {
      case 'critical':
      case 'error':
        console.error(message, entry.metadata);
        break;
      case 'warning':
        console.warn(message, entry.metadata);
        break;
      default:
        console.log(message);
    }
  }

  /**
   * Get emoji for severity level
   */
  private getSeverityEmoji(severity: string): string {
    switch (severity) {
      case 'critical': return '🚨';
      case 'error': return '❌';
      case 'warning': return '⚠️';
      default: return 'ℹ️';
    }
  }
}

export const auditLogger = AuditLogger.getInstance();
export default auditLogger;

