/**
 * Generate .env configuration from private keys
 * 
 * Usage: node scripts/generate-env-from-keys.js
 */

const { Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer);
    });
  });
}

async function main() {
  console.log('\n🔐 Escrow Wallet Configuration Generator\n');
  console.log('⚠️  This script will NOT save your keys - it just outputs the .env format\n');

  const wallets = [];

  // Get private keys for all 3 wallets
  for (let i = 0; i < 3; i++) {
    const letter = String.fromCharCode(65 + i); // A, B, C
    console.log(`\n━━━ WALLET ${letter} ━━━`);
    
    const privateKey = await question(`Paste private key for Wallet ${letter} (base58): `);
    
    if (!privateKey || privateKey.trim().length < 32) {
      console.error(`❌ Invalid private key for Wallet ${letter}`);
      process.exit(1);
    }

    try {
      // Decode and create keypair
      const keypair = Keypair.fromSecretKey(bs58.decode(privateKey.trim()));
      const publicKey = keypair.publicKey.toBase58();
      
      console.log(`✅ Public key: ${publicKey}`);
      
      wallets.push({
        letter,
        publicKey,
        privateKey: privateKey.trim()
      });
    } catch (error) {
      console.error(`❌ Failed to parse private key for Wallet ${letter}:`, error.message);
      process.exit(1);
    }
  }

  // Get house wallet address
  console.log('\n━━━ HOUSE WALLET ━━━');
  const houseWallet = await question('Paste house wallet address (receives the cut): ');
  
  if (!houseWallet || houseWallet.trim().length < 32) {
    console.error('❌ Invalid house wallet address');
    process.exit(1);
  }

  // Get payout server secret
  console.log('\n━━━ SECURITY ━━━');
  let payoutSecret = await question('Enter payout server secret (or press Enter to generate one): ');
  
  if (!payoutSecret || payoutSecret.trim().length === 0) {
    // Generate a random 32-character secret
    payoutSecret = require('crypto').randomBytes(32).toString('base64');
    console.log(`✅ Generated secret: ${payoutSecret}`);
  }

  // Generate .env format
  console.log('\n\n');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📋 COPY THIS TO YOUR .env FILE:');
  console.log('═══════════════════════════════════════════════════════════\n');

  const envContent = `# Escrow Wallets (3-wallet rotation system)
ESCROW_WALLET_A_PUBLIC_KEY=${wallets[0].publicKey}
ESCROW_WALLET_A_PRIVATE_KEY=${wallets[0].privateKey}

ESCROW_WALLET_B_PUBLIC_KEY=${wallets[1].publicKey}
ESCROW_WALLET_B_PRIVATE_KEY=${wallets[1].privateKey}

ESCROW_WALLET_C_PUBLIC_KEY=${wallets[2].publicKey}
ESCROW_WALLET_C_PRIVATE_KEY=${wallets[2].privateKey}

# House Wallet (receives the cut)
NEXT_PUBLIC_ADMIN_WALLET=${houseWallet.trim()}

# Security
PAYOUT_SERVER_SECRET=${payoutSecret.trim()}

# Escrow Configuration (optional)
ESCROW_CYCLING_ENABLED=true
ESCROW_LOAD_BALANCING=true
HOUSE_CUT_PERCENTAGE=0.04`;

  console.log(envContent);
  console.log('\n═══════════════════════════════════════════════════════════\n');

  // Verify the configuration
  console.log('🔍 Configuration Summary:');
  console.log(`   Wallet A: ${wallets[0].publicKey}`);
  console.log(`   Wallet B: ${wallets[1].publicKey}`);
  console.log(`   Wallet C: ${wallets[2].publicKey}`);
  console.log(`   House:    ${houseWallet.trim()}`);
  console.log(`   Secret:   ${payoutSecret.substring(0, 8)}...`);
  console.log('\n✅ Configuration ready to use!\n');

  rl.close();
}

main().catch((error) => {
  console.error('Error:', error);
  rl.close();
  process.exit(1);
});

