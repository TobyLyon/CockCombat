/**
 * Environment Variable Validator
 * 
 * Validates that all required environment variables are set on startup
 */

interface EnvValidationResult {
  valid: boolean;
  missing: string[];
  warnings: string[];
}

const REQUIRED_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_SOLANA_NETWORK',
  'NEXT_PUBLIC_ADMIN_WALLET',
  'PAYOUT_SERVER_SECRET',
];

const ESCROW_VARS = [
  'ESCROW_WALLET_A_PUBLIC_KEY',
  'ESCROW_WALLET_A_PRIVATE_KEY',
  'ESCROW_WALLET_B_PUBLIC_KEY',
  'ESCROW_WALLET_B_PRIVATE_KEY',
  'ESCROW_WALLET_C_PUBLIC_KEY',
  'ESCROW_WALLET_C_PRIVATE_KEY',
];

const OPTIONAL_VARS = [
  'NEXT_PUBLIC_SOLANA_RPC_URL',
  'HOUSE_CUT_PERCENTAGE',
  'ESCROW_CYCLING_ENABLED',
  'ESCROW_LOAD_BALANCING',
  'TRANSACTION_COMMITMENT',
  'TRANSACTION_TIMEOUT',
];

export function validateEnvironment(): EnvValidationResult {
  const missing: string[] = [];
  const warnings: string[] = [];

  // Check required vars
  for (const varName of REQUIRED_VARS) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }

  // Check escrow vars (at least one complete set required for payouts)
  const hasWalletA = process.env.ESCROW_WALLET_A_PUBLIC_KEY && process.env.ESCROW_WALLET_A_PRIVATE_KEY;
  const hasWalletB = process.env.ESCROW_WALLET_B_PUBLIC_KEY && process.env.ESCROW_WALLET_B_PRIVATE_KEY;
  const hasWalletC = process.env.ESCROW_WALLET_C_PUBLIC_KEY && process.env.ESCROW_WALLET_C_PRIVATE_KEY;

  if (!hasWalletA && !hasWalletB && !hasWalletC) {
    warnings.push('⚠️  No escrow wallets configured - payouts will be disabled');
  } else if (!hasWalletA || !hasWalletB || !hasWalletC) {
    warnings.push('⚠️  Not all 3 escrow wallets configured - rotation will be limited');
  }

  // Validate network
  const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK;
  if (network && !['devnet', 'testnet', 'mainnet-beta'].includes(network)) {
    warnings.push(`⚠️  Invalid SOLANA_NETWORK: ${network}. Should be devnet, testnet, or mainnet-beta`);
  }

  // Validate house cut percentage
  const houseCut = process.env.HOUSE_CUT_PERCENTAGE;
  if (houseCut) {
    const value = parseFloat(houseCut);
    if (isNaN(value) || value < 0 || value > 1) {
      warnings.push(`⚠️  Invalid HOUSE_CUT_PERCENTAGE: ${houseCut}. Should be between 0 and 1 (e.g., 0.04 for 4%)`);
    }
  }

  // Security checks
  if (process.env.NODE_ENV === 'production') {
    if (process.env.PAYOUT_SERVER_SECRET && process.env.PAYOUT_SERVER_SECRET.length < 32) {
      warnings.push('⚠️  PAYOUT_SERVER_SECRET should be at least 32 characters in production');
    }
    
    if (!process.env.NEXT_PUBLIC_APP_URL) {
      warnings.push('⚠️  NEXT_PUBLIC_APP_URL not set - CORS may not work correctly');
    }
  }

  return {
    valid: missing.length === 0,
    missing,
    warnings,
  };
}

export function printEnvironmentStatus(): void {
  console.log('\n🔍 Validating Environment Variables...\n');
  
  const result = validateEnvironment();

  if (result.missing.length > 0) {
    console.error('❌ MISSING REQUIRED VARIABLES:\n');
    result.missing.forEach(varName => {
      console.error(`   ❌ ${varName}`);
    });
    console.error('\n');
  }

  if (result.warnings.length > 0) {
    console.warn('⚠️  WARNINGS:\n');
    result.warnings.forEach(warning => {
      console.warn(`   ${warning}`);
    });
    console.warn('\n');
  }

  if (result.valid && result.warnings.length === 0) {
    console.log('✅ All environment variables validated successfully\n');
  } else if (result.valid) {
    console.log('✅ Required variables present (with warnings)\n');
  } else {
    console.error('❌ Environment validation failed\n');
    if (process.env.NODE_ENV === 'production') {
      console.error('🚨 FATAL: Cannot start in production without required environment variables\n');
      process.exit(1);
    }
  }

  // Print configuration summary
  console.log('📋 Current Configuration:');
  console.log(`   Network: ${process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet'}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   House Cut: ${(parseFloat(process.env.HOUSE_CUT_PERCENTAGE || '0.04') * 100).toFixed(1)}%`);
  const escrowConfiguredCount = Number(!!process.env.ESCROW_WALLET_A_PUBLIC_KEY && !!process.env.ESCROW_WALLET_A_PRIVATE_KEY)
    + Number(!!process.env.ESCROW_WALLET_B_PUBLIC_KEY && !!process.env.ESCROW_WALLET_B_PRIVATE_KEY)
    + Number(!!process.env.ESCROW_WALLET_C_PUBLIC_KEY && !!process.env.ESCROW_WALLET_C_PRIVATE_KEY);
  console.log(`   Escrow Wallets: ${escrowConfiguredCount}/3`);
  console.log('\n');
}

/**
 * Check for sensitive data exposure
 */
export function checkForSecurityIssues(): string[] {
  const issues: string[] = [];

  // Check if private keys are too short or look like placeholders
  for (const varName of ESCROW_VARS.filter(v => v.includes('PRIVATE'))) {
    const value = process.env[varName];
    if (value && value.length < 32) {
      issues.push(`${varName} appears to be a placeholder or invalid`);
    }
  }

  // Check for development secrets in production
  if (process.env.NODE_ENV === 'production') {
    if (process.env.PAYOUT_SERVER_SECRET === 'dev-secret' || 
        process.env.PAYOUT_SERVER_SECRET === 'test' ||
        process.env.PAYOUT_SERVER_SECRET === 'secret') {
      issues.push('PAYOUT_SERVER_SECRET appears to be a development placeholder');
    }
  }

  return issues;
}

// Helper to check if an escrow wallet pair is configured
function hasWalletA() {
  return !!(process.env.ESCROW_WALLET_A_PUBLIC_KEY && process.env.ESCROW_WALLET_A_PRIVATE_KEY);
}

function hasWalletB() {
  return !!(process.env.ESCROW_WALLET_B_PUBLIC_KEY && process.env.ESCROW_WALLET_B_PRIVATE_KEY);
}

function hasWalletC() {
  return !!(process.env.ESCROW_WALLET_C_PUBLIC_KEY && process.env.ESCROW_WALLET_C_PRIVATE_KEY);
}

