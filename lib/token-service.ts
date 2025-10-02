import { 
  Connection, 
  PublicKey, 
  Transaction, 
  SystemProgram, 
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
  Keypair,
  TransactionInstruction,
  Commitment
} from '@solana/web3.js';
import {
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  createTransferInstruction,
  createMintToInstruction,
  createInitializeMint2Instruction,
  getMint,
  getAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  MINT_SIZE,
  getMinimumBalanceForRentExemptMint
} from '@solana/spl-token';
import { toast } from 'sonner';

// The mint address for our custom $COCK token
// Get from environment variable or null
let COCK_TOKEN_MINT_ADDRESS: string | null = process.env.NEXT_PUBLIC_COCK_TOKEN_MINT || null;

// Token decimals from environment or default to 6
const TOKEN_DECIMALS = parseInt(process.env.NEXT_PUBLIC_TOKEN_DECIMALS || '6', 10);

// Max number of retries for transactions
const MAX_RETRIES = 3;

// Transaction timeout in milliseconds
const TRANSACTION_TIMEOUT = 60000; // 60 seconds

// Game escrow wallet public key
let GAME_ESCROW_WALLET: string | null = null;

/**
 * Initialize token service with the mint address and escrow wallet
 * @param mintAddress The mint address of the $COCK token
 * @param escrowWallet The game escrow wallet address
 */
export function initializeTokenService(mintAddress: string, escrowWallet?: string): void {
  COCK_TOKEN_MINT_ADDRESS = mintAddress;
  if (escrowWallet) {
    GAME_ESCROW_WALLET = escrowWallet;
  }
}

/**
 * Get the token mint address
 * @returns The $COCK token mint address, if available
 */
export function getTokenMintAddress(): string | null {
  return COCK_TOKEN_MINT_ADDRESS;
}

/**
 * Get the game escrow wallet address
 * @returns The game escrow wallet address, if available
 */
export function getEscrowWalletAddress(): string | null {
  return GAME_ESCROW_WALLET;
}

/**
 * Set the game escrow wallet address
 * @param escrowWallet The game escrow wallet address
 */
export function setEscrowWalletAddress(escrowWallet: string): void {
  GAME_ESCROW_WALLET = escrowWallet;
}

/**
 * Convert token amount from display units to raw units
 * @param amount Amount in display units (e.g., 1.5 $COCK)
 * @returns Amount in raw units with decimals
 */
export function toRawAmount(amount: number): number {
  return amount * Math.pow(10, TOKEN_DECIMALS);
}

/**
 * Convert token amount from raw units to display units
 * @param rawAmount Amount in raw units
 * @returns Amount in display units (e.g., 1.5 $COCK)
 */
export function toDisplayAmount(rawAmount: number): number {
  return rawAmount / Math.pow(10, TOKEN_DECIMALS);
}

/**
 * Create a new SPL token (MODERN API)
 * @param connection Solana connection
 * @param payer The wallet that will sign and pay for the transaction
 * @param totalSupply The total supply of tokens to create
 * @returns The mint address of the created token
 */
export async function createToken(
  connection: Connection, 
  payer: { publicKey: PublicKey; signTransaction: (tx: Transaction) => Promise<Transaction> },
  totalSupply: number
): Promise<string> {
  try {
    // Create a new mint keypair
    const mintKeypair = Keypair.generate();
    
    // Get minimum balance for rent exemption
    const mintRent = await getMinimumBalanceForRentExemptMint(connection);

    console.log(`🪙 Creating $COCK token with ${totalSupply} supply...`);
    console.log(`   Mint address: ${mintKeypair.publicKey.toBase58()}`);

    // Create instructions
    const instructions: TransactionInstruction[] = [];

    // Add instruction to create mint account
    instructions.push(
      SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: mintKeypair.publicKey,
        space: MINT_SIZE,
        lamports: mintRent,
        programId: TOKEN_PROGRAM_ID
      })
    );

    // Add instruction to initialize the mint (using modern API)
    instructions.push(
      createInitializeMint2Instruction(
        mintKeypair.publicKey,
        TOKEN_DECIMALS,
        payer.publicKey,
        payer.publicKey, // freeze authority
        TOKEN_PROGRAM_ID
      )
    );

    // Get associated token account for the payer
    const associatedTokenAccount = await getAssociatedTokenAddress(
      mintKeypair.publicKey,
      payer.publicKey,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    // Add instruction to create associated token account
    instructions.push(
      createAssociatedTokenAccountInstruction(
        payer.publicKey,
        associatedTokenAccount,
        payer.publicKey,
        mintKeypair.publicKey,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      )
    );

    // Add instruction to mint tokens to the payer
    instructions.push(
      createMintToInstruction(
        mintKeypair.publicKey,
        associatedTokenAccount,
        payer.publicKey,
        toRawAmount(totalSupply),
        [],
        TOKEN_PROGRAM_ID
      )
    );

    // Create and send transaction
    const transaction = new Transaction().add(...instructions);
    transaction.feePayer = payer.publicKey;
    const { blockhash } = await connection.getLatestBlockhash('finalized');
    transaction.recentBlockhash = blockhash;

    // Sign the transaction
    const signedTransaction = await payer.signTransaction(transaction);
    signedTransaction.partialSign(mintKeypair);

    // Send the transaction
    const signature = await connection.sendRawTransaction(signedTransaction.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });
    
    console.log(`📡 Token creation transaction sent: ${signature}`);
    
    // Wait for confirmation with timeout and retries
    await confirmTransaction(connection, signature, 'confirmed', MAX_RETRIES, TRANSACTION_TIMEOUT);
    
    // Store the mint address
    COCK_TOKEN_MINT_ADDRESS = mintKeypair.publicKey.toString();
    
    console.log(`✅ Token created successfully: ${COCK_TOKEN_MINT_ADDRESS}`);
    toast.success(`Successfully created $COCK token with ${totalSupply} supply`);
    
    return COCK_TOKEN_MINT_ADDRESS;
  } catch (error) {
    console.error('❌ Error creating token:', error);
    toast.error(`Failed to create token: ${getErrorMessage(error)}`);
    throw error;
  }
}

/**
 * Get the token balance for a wallet
 * @param connection Solana connection
 * @param walletAddress The wallet address to check
 * @returns The token balance in display amount (adjusted for decimals)
 */
export async function getTokenBalance(connection: Connection, walletAddress: string): Promise<number> {
  try {
    if (!COCK_TOKEN_MINT_ADDRESS) {
      throw new Error('Token mint address not initialized');
    }

    const mintPublicKey = new PublicKey(COCK_TOKEN_MINT_ADDRESS);
    const walletPublicKey = new PublicKey(walletAddress);

    // Get the associated token account address
    const associatedTokenAddress = await getAssociatedTokenAddress(
      mintPublicKey,
      walletPublicKey,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    try {
      // Get account info
      const accountInfo = await getAccount(connection, associatedTokenAddress);
      return toDisplayAmount(Number(accountInfo.amount));
    } catch (error: any) {
      // If the account doesn't exist, the balance is 0
      if (error.name === 'TokenAccountNotFoundError') {
        return 0;
      }
      throw error;
    }
  } catch (error) {
    console.error('Error getting token balance:', error);
    // Don't show toast on balance check error to avoid spamming
    return 0;
  }
}

// Removed deprecated createInitializeMintInstruction helper
// Now using createInitializeMint2Instruction from @solana/spl-token

/**
 * Helper function to confirm a transaction with retries
 */
async function confirmTransaction(
  connection: Connection,
  signature: string,
  commitment: Commitment = 'confirmed',
  maxRetries: number = MAX_RETRIES,
  timeout: number = TRANSACTION_TIMEOUT
): Promise<void> {
  let retries = 0;
  const startTime = Date.now();
  
  while (retries < maxRetries) {
    try {
      // Check if we've exceeded timeout
      if (Date.now() - startTime > timeout) {
        throw new Error(`Transaction confirmation timeout after ${timeout}ms`);
      }
      
      // Wait for confirmation using the signature directly
      const confirmation = await connection.confirmTransaction(signature, commitment);
      
      if (confirmation.value.err) {
        throw new Error(`Transaction confirmed with error: ${confirmation.value.err}`);
      }
      
      // Successfully confirmed
      return;
    } catch (error) {
      retries++;
      console.warn(`Retry ${retries}/${maxRetries} confirming transaction: ${signature}`);
      
      // If we've reached max retries, throw the error
      if (retries >= maxRetries) {
        throw error;
      }
      
      // Wait before retrying (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retries)));
    }
  }
}

/**
 * Helper function to get error message
 */
function getErrorMessage(error: any): string {
  if (typeof error === 'string') return error;
  if (error.message) return error.message;
  return 'Unknown error';
}

/**
 * Transfer tokens from one wallet to another (MODERN API)
 * @param connection Solana connection
 * @param payer The wallet keypair that will sign the transaction
 * @param fromWallet The source wallet address
 * @param toWallet The destination wallet address
 * @param amount The amount of tokens to transfer (in $COCK, not native units)
 * @returns The transaction signature
 */
export async function transferTokens(
  connection: Connection,
  payer: Keypair,
  fromWallet: string,
  toWallet: string,
  amount: number
): Promise<string> {
  try {
    if (!COCK_TOKEN_MINT_ADDRESS) {
      throw new Error('Token mint address not initialized');
    }

    const mintPublicKey = new PublicKey(COCK_TOKEN_MINT_ADDRESS);
    const fromWalletPublicKey = new PublicKey(fromWallet);
    const toWalletPublicKey = new PublicKey(toWallet);

    console.log(`💸 Transferring ${amount} $COCK from ${fromWallet} to ${toWallet}`);

    // Get associated token accounts
    const fromTokenAccount = await getAssociatedTokenAddress(
      mintPublicKey,
      fromWalletPublicKey,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const toTokenAccount = await getAssociatedTokenAddress(
      mintPublicKey,
      toWalletPublicKey,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const transaction = new Transaction();

    // Check if destination token account exists
    try {
      await getAccount(connection, toTokenAccount, 'confirmed', TOKEN_PROGRAM_ID);
    } catch (error) {
      // Account doesn't exist, create it
      console.log(`Creating token account for ${toWallet}...`);
      transaction.add(
        createAssociatedTokenAccountInstruction(
          payer.publicKey,
          toTokenAccount,
          toWalletPublicKey,
          mintPublicKey,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );
    }

    // Add transfer instruction
    const rawAmount = toRawAmount(amount);
    transaction.add(
      createTransferInstruction(
        fromTokenAccount,
        toTokenAccount,
        fromWalletPublicKey,
        rawAmount,
        [],
        TOKEN_PROGRAM_ID
      )
    );

    // Send transaction
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [payer],
      {
        commitment: 'confirmed',
        maxRetries: 3,
      }
    );

    console.log(`✅ Token transfer successful: ${signature}`);
    return signature;
  } catch (error) {
    console.error('❌ Error transferring tokens:', error);
    toast.error('Failed to transfer tokens');
    throw error;
  }
}

/**
 * Airdrop tokens to a wallet (mint new tokens) (MODERN API)
 * @param connection Solana connection
 * @param mintAuthority The mint authority keypair
 * @param targetWallet The wallet to receive the tokens
 * @param amount The amount of tokens to airdrop
 * @returns The transaction signature
 */
export async function airdropTokens(
  connection: Connection,
  mintAuthority: Keypair,
  targetWallet: string,
  amount: number
): Promise<string> {
  try {
    if (!COCK_TOKEN_MINT_ADDRESS) {
      throw new Error('Token mint address not initialized');
    }

    const mintPublicKey = new PublicKey(COCK_TOKEN_MINT_ADDRESS);
    const targetWalletPublicKey = new PublicKey(targetWallet);

    console.log(`🪂 Airdropping ${amount} $COCK to ${targetWallet}`);

    // Get target token account
    const targetTokenAccount = await getAssociatedTokenAddress(
      mintPublicKey,
      targetWalletPublicKey,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const transaction = new Transaction();

    // Check if target token account exists
    try {
      await getAccount(connection, targetTokenAccount, 'confirmed', TOKEN_PROGRAM_ID);
    } catch (error) {
      // Account doesn't exist, create it
      console.log(`Creating token account for ${targetWallet}...`);
      transaction.add(
        createAssociatedTokenAccountInstruction(
          mintAuthority.publicKey,
          targetTokenAccount,
          targetWalletPublicKey,
          mintPublicKey,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );
    }

    // Add mint instruction
    const rawAmount = toRawAmount(amount);
    transaction.add(
      createMintToInstruction(
        mintPublicKey,
        targetTokenAccount,
        mintAuthority.publicKey,
        rawAmount,
        [],
        TOKEN_PROGRAM_ID
      )
    );

    // Send transaction
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [mintAuthority],
      {
        commitment: 'confirmed',
        maxRetries: 3,
      }
    );

    console.log(`✅ Airdrop successful: ${signature}`);
    toast.success(`Airdropped ${amount} $COCK to ${targetWallet}`);
    return signature;
  } catch (error) {
    console.error('❌ Error airdropping tokens:', error);
    toast.error('Failed to airdrop tokens');
    throw error;
  }
}

/**
 * Process a bet with tokens
 * @param connection Solana connection
 * @param payer The wallet that will pay for the transaction
 * @param playerWallet The player's wallet address
 * @param gameEscrowWallet The game escrow wallet address
 * @param betAmount The amount of tokens to bet
 * @returns True if the bet was successful
 */
export async function placeBet(
  connection: Connection,
  payer: any,
  playerWallet: string,
  gameEscrowWallet: string,
  betAmount: number
): Promise<boolean> {
  try {
    // Check if player has enough tokens
    const balance = await getTokenBalance(connection, playerWallet);
    
    if (balance < betAmount) {
      toast.error(`Not enough $COCK tokens. You have ${balance.toFixed(2)} but need ${betAmount.toFixed(2)}`);
      return false;
    }
    
    // Transfer tokens to game escrow wallet
    await transferTokens(
      connection,
      payer,
      playerWallet,
      gameEscrowWallet,
      betAmount
    );
    
    toast.success(`Bet of ${betAmount} $COCK placed successfully!`);
    return true;
  } catch (error) {
    console.error('Error placing bet:', error);
    toast.error('Failed to place bet');
    return false;
  }
}

/**
 * Process winnings payout
 * @param connection Solana connection
 * @param payer The wallet that will pay for the transaction
 * @param playerWallet The player's wallet address
 * @param gameEscrowWallet The game escrow wallet address
 * @param winAmount The amount of tokens to pay out
 * @returns True if the payout was successful
 */
export async function processWinnings(
  connection: Connection,
  payer: any,
  playerWallet: string,
  gameEscrowWallet: string,
  winAmount: number
): Promise<boolean> {
  try {
    // Check if escrow has enough tokens
    const escrowBalance = await getTokenBalance(connection, gameEscrowWallet);
    
    if (escrowBalance < winAmount) {
      console.error('Not enough tokens in escrow');
      toast.error('Game does not have enough tokens for payout');
      return false;
    }
    
    // Transfer tokens from escrow to player
    await transferTokens(
      connection,
      payer,
      gameEscrowWallet,
      playerWallet,
      winAmount
    );
    
    toast.success(`You won ${winAmount} $COCK!`);
    return true;
  } catch (error) {
    console.error('Error processing winnings:', error);
    toast.error('Failed to process winnings');
    return false;
  }
} 