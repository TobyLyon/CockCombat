/**
 * Monitoring and Alerting
 * 
 * System monitoring for security events and financial transactions
 */

import { auditLogger } from './audit-logger';
import { evmEscrowService } from './evm-escrow-service';

interface AlertThresholds {
  maxPayoutSol: number;
  minEscrowBalanceSol: number;
  maxFailedAuthAttempts: number;
  alertEmail?: string;
  alertWebhook?: string;
}

const DEFAULT_THRESHOLDS: AlertThresholds = {
  maxPayoutBnb: 10, // Alert on payouts over 10 BNB
  minEscrowBalanceBnb: 1, // Alert when escrow below 1 BNB
  maxFailedAuthAttempts: 10, // Alert after 10 failed auth attempts in 5 minutes
  alertEmail: process.env.ALERT_EMAIL,
  alertWebhook: process.env.ALERT_WEBHOOK,
};

class MonitoringService {
  private static instance: MonitoringService | null = null;
  private thresholds: AlertThresholds;
  private failedAuthAttempts: Map<string, { count: number; firstAttempt: number }> = new Map();

  private constructor() {
    this.thresholds = DEFAULT_THRESHOLDS;
    this.startPeriodicChecks();
  }

  public static getInstance(): MonitoringService {
    if (!MonitoringService.instance) {
      MonitoringService.instance = new MonitoringService();
    }
    return MonitoringService.instance;
  }

  /**
   * Monitor a payout transaction
   */
  public async monitorPayout(
    winnerWallet: string,
    amountSol: number,
    matchId?: string,
    signature?: string
  ): Promise<void> {
    console.log(`📊 Monitoring payout: ${amountSol} BNB to ${winnerWallet}`);

    // Check if payout exceeds threshold
    if (amountSol > this.thresholds.maxPayoutSol) {
      await this.sendAlert({
        type: 'LARGE_PAYOUT',
        severity: 'high',
        message: `Large payout detected: ${amountSol} BNB to ${winnerWallet}`,
        metadata: {
          winnerWallet,
          amount: amountSol,
          matchId,
          signature,
          threshold: this.thresholds.maxPayoutSol,
        },
      });
    }

    // Log to audit
    await auditLogger.logPayout(winnerWallet, amountSol, matchId, signature);
  }

  /**
   * Monitor failed authentication attempts
   */
  public async monitorAuthFailure(walletAddress: string, ipAddress?: string): Promise<void> {
    const key = `${walletAddress}:${ipAddress || 'unknown'}`;
    const now = Date.now();
    const fiveMinutesAgo = now - 5 * 60 * 1000;

    let record = this.failedAuthAttempts.get(key);
    
    if (!record || record.firstAttempt < fiveMinutesAgo) {
      record = { count: 1, firstAttempt: now };
    } else {
      record.count++;
    }

    this.failedAuthAttempts.set(key, record);

    if (record.count >= this.thresholds.maxFailedAuthAttempts) {
      await this.sendAlert({
        type: 'FAILED_AUTH_SPIKE',
        severity: 'high',
        message: `${record.count} failed auth attempts from ${walletAddress}`,
        metadata: {
          walletAddress,
          ipAddress,
          attempts: record.count,
          timeWindow: '5 minutes',
        },
      });

      await auditLogger.logSuspiciousActivity(
        `Multiple failed authentication attempts (${record.count})`,
        walletAddress,
        ipAddress
      );
    }
  }

  /**
   * Check escrow wallet balances
   */
  public async checkEscrowBalances(): Promise<void> {
    try {
      // EVM-only: approximate balance check by querying provider balances
      const ids: Array<'A'|'B'|'C'> = ['A','B','C'];
      for (const id of ids) {
        const w = evmEscrowService.getWallet(id);
        if (!w) continue;
        const balWei = await w.wallet.provider!.getBalance(w.address);
        const balanceSol = Number(balWei) / 1e18;
        if (balanceSol < this.thresholds.minEscrowBalanceSol) {
          await this.sendAlert({
            type: 'LOW_ESCROW_BALANCE',
            severity: 'critical',
            message: `Escrow wallet ${walletId} balance low: ${balanceSol.toFixed(4)} BNB`,
            metadata: {
              walletId: id,
              balance: balanceSol,
              threshold: this.thresholds.minEscrowBalanceSol,
            },
          });
        }
      }
    } catch (error) {
      console.error('Error checking escrow balances:', error);
    }
  }

  /**
   * Send an alert (log to console and optionally webhook/email)
   */
  private async sendAlert(alert: {
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    const emoji = this.getSeverityEmoji(alert.severity);
    console.error(`${emoji} ALERT [${alert.type}]: ${alert.message}`);
    
    if (alert.metadata) {
      console.error('   Details:', alert.metadata);
    }

    // Log to audit system
    await auditLogger.log({
      eventType: 'error',
      severity: alert.severity === 'critical' ? 'critical' : 'error',
      metadata: {
        alertType: alert.type,
        ...alert.metadata,
      },
    });

    // TODO: Implement webhook/email notifications
    if (this.thresholds.alertWebhook) {
      try {
        await fetch(this.thresholds.alertWebhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(alert),
        });
      } catch (error) {
        console.error('Failed to send webhook alert:', error);
      }
    }
  }

  /**
   * Start periodic health checks
   */
  private startPeriodicChecks(): void {
    // Check escrow balances every 5 minutes
    setInterval(() => {
      this.checkEscrowBalances().catch(console.error);
    }, 5 * 60 * 1000);

    // Clean up old failed auth records every minute
    setInterval(() => {
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
      for (const [key, record] of this.failedAuthAttempts.entries()) {
        if (record.firstAttempt < fiveMinutesAgo) {
          this.failedAuthAttempts.delete(key);
        }
      }
    }, 60 * 1000);
  }

  /**
   * Get emoji for severity
   */
  private getSeverityEmoji(severity: string): string {
    switch (severity) {
      case 'critical': return '🚨';
      case 'high': return '⚠️';
      case 'medium': return '⚡';
      default: return 'ℹ️';
    }
  }

  /**
   * Update thresholds
   */
  public setThresholds(thresholds: Partial<AlertThresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
  }
}

export const monitoringService = MonitoringService.getInstance();
export default monitoringService;

