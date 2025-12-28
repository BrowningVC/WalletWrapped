const { PublicKey } = require('@solana/web3.js');
const redis = require('../config/redis');
require('dotenv').config();

// Helius API base URL with API key
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const HELIUS_API_URL = `https://api.helius.xyz/v0`;
const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

/**
 * Semaphore for controlling concurrent Helius API requests
 * Prevents rate limiting when 50+ users run analyses simultaneously
 */
class Semaphore {
  constructor(max) {
    this.max = max;
    this.current = 0;
    this.queue = [];
  }

  async acquire() {
    if (this.current < this.max) {
      this.current++;
      return;
    }
    // Wait in queue
    await new Promise(resolve => this.queue.push(resolve));
  }

  release() {
    this.current--;
    if (this.queue.length > 0) {
      this.current++;
      const next = this.queue.shift();
      next();
    }
  }

  async run(fn) {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

// Helius rate limits by plan:
// - Free: 10 RPS (1M credits)
// - Developer ($49/mo): 50 RPS (10M credits)
// - Business ($499/mo): 200 RPS (100M credits)
// - Professional ($999/mo): 500 RPS (200M credits)
//
// Set via environment variable or default to free tier
const HELIUS_RPS_LIMIT = parseInt(process.env.HELIUS_RPS_LIMIT) || 10;
const heliusSemaphore = new Semaphore(HELIUS_RPS_LIMIT);

/**
 * Make a Helius API POST request (for enhanced transactions)
 * Wrapped with semaphore to prevent rate limiting across concurrent users
 */
async function heliusPostRequest(endpoint, body = {}) {
  return heliusSemaphore.run(async () => {
    const url = `${HELIUS_API_URL}${endpoint}?api-key=${HELIUS_API_KEY}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      // Handle rate limit specifically
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After') || 1;
        await new Promise(r => setTimeout(r, retryAfter * 1000));
        throw new Error('Rate limited - will retry');
      }
      throw new Error(`Helius API error: ${response.status} ${response.statusText}`);
    }
    return response.json();
  });
}

/**
 * Make a Helius RPC request
 * Wrapped with semaphore to prevent rate limiting across concurrent users
 */
async function heliusRPC(method, params) {
  return heliusSemaphore.run(async () => {
    const response = await fetch(HELIUS_RPC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method,
        params
      })
    });

    if (!response.ok) {
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After') || 1;
        await new Promise(r => setTimeout(r, retryAfter * 1000));
        throw new Error('Rate limited - will retry');
      }
      throw new Error(`Helius RPC error: ${response.status}`);
    }

    const data = await response.json();
    if (data.error) {
      throw new Error(`RPC error: ${data.error.message}`);
    }
    return data.result;
  });
}

// Constants - Adjusted based on Helius plan
const SIGNATURE_BATCH_SIZE = 1000; // RPC allows up to 1000 - use max for fewer round trips
const ENHANCED_TX_BATCH_SIZE = 100; // Helius Enhanced Transactions API limit

// Scale parallelism based on RPS limit
// Free (10 RPS): 2 parallel batches
// Paid (50+ RPS): 40 parallel batches (fetches 4000 txs per round)
// This is aggressive but the semaphore will throttle if needed
const PARALLEL_ENHANCED_BATCHES = HELIUS_RPS_LIMIT >= 50 ? 40 : 2;
const PARALLEL_REQUESTS = HELIUS_RPS_LIMIT >= 50 ? 15 : 3;

const MAX_RETRIES = 3;
const RETRY_DELAY = 500; // 500ms base delay

// Solana native mint (SOL)
const SOL_MINT = 'So11111111111111111111111111111111111111112';

// Common stablecoins on Solana (used as trading pairs, not P&L assets)
const STABLECOINS = new Set([
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
  '7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj', // stSOL (consider as stable for P&L)
  'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',  // mSOL (consider as stable for P&L)
  'So11111111111111111111111111111111111111112',  // WSOL (wrapped SOL)
]);

// In-memory metadata cache for faster lookups during analysis
// Reduces redundant API calls for frequently-seen tokens
const metadataCache = new Map();

/**
 * Helius Service - Handles all Solana blockchain data fetching via Helius API
 */
class HeliusService {
  /**
   * Validate a Solana wallet address
   */
  static isValidSolanaAddress(address) {
    try {
      new PublicKey(address);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Fetch all signatures for a wallet (fast, no transaction details)
   * Returns array of signature strings
   * Enforces MAX_TRANSACTION_LIMIT to prevent bot wallet analysis
   */
  static async fetchAllSignatures(walletAddress, progressCallback = () => {}) {
    const MAX_TRANSACTION_LIMIT = parseInt(process.env.MAX_TRANSACTION_LIMIT) || 30000;
    const allSignatures = [];
    let beforeSignature = null;

    while (true) {
      const params = [walletAddress, { limit: SIGNATURE_BATCH_SIZE }];
      if (beforeSignature) {
        params[1].before = beforeSignature;
      }

      const response = await heliusRPC('getSignaturesForAddress', params);

      if (!response || response.length === 0) {
        break;
      }

      const signatures = response.map(tx => tx.signature);
      allSignatures.push(...signatures);
      beforeSignature = response[response.length - 1]?.signature;

      // Report progress during signature collection
      progressCallback(0, allSignatures.length, 'counting');

      // Check if we've exceeded the transaction limit (anti-bot protection)
      if (allSignatures.length > MAX_TRANSACTION_LIMIT) {
        throw new Error(
          `This wallet has ${allSignatures.length}+ transactions, exceeding our limit of ${MAX_TRANSACTION_LIMIT}. ` +
          `This appears to be a bot wallet. WalletWrapped is designed for human traders only. ` +
          `If you believe this is an error, please contact support.`
        );
      }

      // If we got fewer than the batch size, we've reached the end
      if (response.length < SIGNATURE_BATCH_SIZE) {
        break;
      }
    }

    return allSignatures;
  }

  /**
   * Fetch all transactions for a wallet with accurate progress tracking
   * Two-phase approach: 1) Collect all signatures, 2) Fetch enhanced data
   * This ensures accurate "remaining" count in progress updates
   * @param {string} walletAddress - Solana wallet address
   * @param {function} progressCallback - Called with (fetched, total) counts
   * @param {string} beforeSignature - Optional: fetch only transactions before this signature
   */
  static async fetchAllTransactions(walletAddress, progressCallback = () => {}, beforeSignature = null) {
    if (!this.isValidSolanaAddress(walletAddress)) {
      throw new Error('Invalid Solana wallet address');
    }

    console.log(`Starting transaction fetch for wallet: ${walletAddress}`);

    // Phase 1: Collect all signatures first (fast, gives us accurate total count)
    console.log(`Phase 1: Collecting signatures...`);
    const allSignatures = await this.fetchAllSignatures(walletAddress, progressCallback);
    const totalCount = allSignatures.length;
    console.log(`Found ${totalCount} total signatures`);

    if (totalCount === 0) {
      return [];
    }

    // Phase 2: Fetch enhanced transaction data in parallel batches
    console.log(`Phase 2: Fetching enhanced transaction data...`);
    const allTransactions = [];
    let fetched = 0;

    // Chunk signatures into batches of 100 for Enhanced Transactions API
    const chunks = [];
    for (let i = 0; i < allSignatures.length; i += ENHANCED_TX_BATCH_SIZE) {
      chunks.push(allSignatures.slice(i, i + ENHANCED_TX_BATCH_SIZE));
    }

    // Process chunks in parallel groups (semaphore handles rate limiting)
    for (let i = 0; i < chunks.length; i += PARALLEL_ENHANCED_BATCHES) {
      const batchGroup = chunks.slice(i, i + PARALLEL_ENHANCED_BATCHES);
      const results = await Promise.all(
        batchGroup.map(chunk => heliusPostRequest('/transactions', { transactions: chunk }))
      );

      for (const parsedChunk of results) {
        if (Array.isArray(parsedChunk)) {
          const validTxs = parsedChunk.filter(tx => tx !== null);
          allTransactions.push(...validTxs);
          fetched += validTxs.length;
        }
      }

      // Update progress with accurate counts
      progressCallback(fetched, totalCount);
    }

    console.log(`Fetched ${allTransactions.length} transactions for wallet: ${walletAddress}`);
    return allTransactions;
  }

  /**
   * Parse and normalize a Helius enhanced transaction
   * @param {object} heliusTx - Helius enhanced transaction object
   * @param {string} walletAddress - The wallet address being analyzed
   */
  static async parseTransaction(heliusTx, walletAddress) {
    try {
      // Classify transaction type
      const classification = this.classifyTransaction(heliusTx, walletAddress);

      // Skip SOL-only transfers and unknown types
      if (classification.skip) {
        return null;
      }

      // Get token symbol - fetch from metadata if not provided
      let tokenSymbol = classification.tokenSymbol;
      if (!tokenSymbol || tokenSymbol === 'UNKNOWN' || tokenSymbol === '') {
        const metadata = await this.getTokenMetadata(classification.tokenMint);
        tokenSymbol = metadata.symbol || 'UNKNOWN';
      }

      // Extract basic info
      const normalized = {
        signature: heliusTx.signature,
        blockTime: new Date(heliusTx.timestamp * 1000),
        type: classification.type,
        tokenMint: classification.tokenMint,
        tokenSymbol,
        solAmount: 0,
        tokenAmount: 0,
        priceSol: 0,
        feeSol: heliusTx.fee / 1e9, // Convert lamports to SOL
        isEstimated: false,
        rawData: heliusTx
      };

      // Parse transaction details based on type
      if (classification.type === 'BUY' || classification.type === 'SELL') {
        this.parseSwapDetails(heliusTx, normalized, walletAddress);
      } else if (classification.type === 'TRANSFER_OUT' || classification.type === 'TRANSFER_IN') {
        this.parseTransferDetails(heliusTx, normalized, walletAddress);
      }

      // Calculate effective price
      if (normalized.tokenAmount > 0 && normalized.solAmount > 0) {
        normalized.priceSol = normalized.solAmount / normalized.tokenAmount;
      }

      return normalized;

    } catch (error) {
      console.error('Error parsing transaction:', error, heliusTx.signature);
      return null;
    }
  }

  /**
   * Classify transaction type based on Helius data
   * CRITICAL: Filters out SOL-only transfers and stablecoin-only swaps
   */
  static classifyTransaction(heliusTx, walletAddress) {
    const nativeTransfers = heliusTx.nativeTransfers || [];
    const tokenTransfers = heliusTx.tokenTransfers || [];

    // PRIORITY 1: Filter out SOL-only transfers (DO NOT count for P&L)
    if (tokenTransfers.length === 0) {
      return { type: 'SOL_TRANSFER', skip: true };
    }

    // PRIORITY 2: Filter out stablecoin-only transactions
    // These are just trading pairs (USDC swaps), not real P&L events
    const nonStablecoinTransfers = tokenTransfers.filter(t =>
      !STABLECOINS.has(t.mint)
    );

    if (nonStablecoinTransfers.length === 0) {
      return { type: 'STABLECOIN_ONLY', skip: true };
    }

    // Find non-SOL, non-stablecoin token transfers (the actual trading assets)
    const nonSolTokenTransfers = nonStablecoinTransfers.filter(t =>
      t.tokenStandard === 'Fungible' && t.mint !== SOL_MINT && !STABLECOINS.has(t.mint)
    );

    // CRITICAL: Find the token transfer that involves THIS wallet specifically
    // In multi-recipient transactions (airdrops), we need to find OUR transfer
    const walletTokenTransfer = nonSolTokenTransfers.find(t =>
      t.toUserAccount === walletAddress || t.fromUserAccount === walletAddress
    );

    // If no token transfer involves this wallet, skip
    if (!walletTokenTransfer) {
      return { type: 'UNKNOWN', skip: true };
    }

    // Determine direction based on the wallet's specific transfer
    const isReceiving = walletTokenTransfer.toUserAccount === walletAddress;
    const isSending = walletTokenTransfer.fromUserAccount === walletAddress;

    // Find SOL/WSOL transfers specifically from/to the wallet
    const walletNativeOut = nativeTransfers.filter(t => t.fromUserAccount === walletAddress);
    const walletNativeIn = nativeTransfers.filter(t => t.toUserAccount === walletAddress);
    const wsolTransfers = tokenTransfers.filter(t => t.mint === SOL_MINT);
    const walletWsolOut = wsolTransfers.filter(t => t.fromUserAccount === walletAddress);
    const walletWsolIn = wsolTransfers.filter(t => t.toUserAccount === walletAddress);

    // Has SOL movement FROM wallet (spent SOL) or TO wallet (received SOL)
    const walletSpentSol = walletNativeOut.length > 0 || walletWsolOut.length > 0;
    const walletReceivedSol = walletNativeIn.length > 0 || walletWsolIn.length > 0;

    // PRIORITY 2: Detect token swaps (BUY/SELL)
    // A swap is when:
    // - Helius marks it as SWAP, OR
    // - Has swap instructions, OR
    // - Token flows one way and SOL flows the opposite way for this wallet
    const isSwap = heliusTx.type === 'SWAP' ||
                   this.hasSwapInstructions(heliusTx) ||
                   (isReceiving && walletSpentSol) ||   // Receiving token, spending SOL = BUY
                   (isSending && walletReceivedSol);    // Sending token, receiving SOL = SELL

    if (isSwap) {
      return {
        type: isReceiving ? 'BUY' : 'SELL',
        tokenMint: walletTokenTransfer.mint,
        tokenSymbol: walletTokenTransfer.tokenSymbol,
        skip: false
      };
    }

    // PRIORITY 3: Token transfers (only if token is involved, no SOL movement for wallet)
    return {
      type: isSending ? 'TRANSFER_OUT' : 'TRANSFER_IN',
      tokenMint: walletTokenTransfer.mint,
      tokenSymbol: walletTokenTransfer.tokenSymbol,
      skip: false
    };
  }

  /**
   * Check if transaction contains swap instructions
   */
  static hasSwapInstructions(heliusTx) {
    const instructions = heliusTx.instructions || [];
    return instructions.some(ix =>
      ix.programId?.includes('swap') ||
      ix.programId?.includes('Jupiter') ||
      ix.programId?.includes('Raydium')
    );
  }

  /**
   * Parse swap transaction details (BUY/SELL)
   * CRITICAL: Avoid double-counting SOL when both native and WSOL transfers exist
   * DEX flow: Native SOL → wrap to WSOL → DEX (or reverse for sells)
   * We should count ONE OR THE OTHER, not both!
   *
   * For PumpFun and some other DEXes, SOL amounts are in accountData.nativeBalanceChange
   * instead of nativeTransfers.
   */
  static parseSwapDetails(heliusTx, normalized, walletAddress) {
    const nativeTransfers = heliusTx.nativeTransfers || [];
    const tokenTransfers = heliusTx.tokenTransfers || [];
    const accountData = heliusTx.accountData || [];

    // CRITICAL: For PumpFun and other DEXes, check accountData.nativeBalanceChange FIRST
    // This is the canonical source for SOL amount in many DEX swaps
    // If present, use it exclusively and ignore other transfer data to avoid double-counting
    const walletAccountData = accountData.find(acc => acc.account === walletAddress);
    let solIn, solOut;

    if (walletAccountData && walletAccountData.nativeBalanceChange) {
      // Use nativeBalanceChange as the source of truth
      const balanceChange = walletAccountData.nativeBalanceChange / 1e9;
      if (balanceChange > 0) {
        // Positive = SOL entering wallet (SELL)
        solIn = 0;
        solOut = balanceChange;
      } else if (balanceChange < 0) {
        // Negative = SOL leaving wallet (BUY)
        solIn = Math.abs(balanceChange);
        solOut = 0;
      } else {
        solIn = 0;
        solOut = 0;
      }
    } else {
      // Fallback: Calculate from native transfers and WSOL transfers
      let nativeSolIn = 0;  // Native SOL leaving wallet
      let nativeSolOut = 0; // Native SOL entering wallet

      for (const transfer of nativeTransfers) {
        if (transfer.fromUserAccount === walletAddress) {
          nativeSolIn += transfer.amount / 1e9;
        }
        if (transfer.toUserAccount === walletAddress) {
          nativeSolOut += transfer.amount / 1e9;
        }
      }

      // Calculate WSOL in/out
      // CRITICAL: WSOL tokenAmount is in raw format (lamports), must divide by 1e9 to get SOL
      let wsolIn = 0;  // WSOL leaving wallet
      let wsolOut = 0; // WSOL entering wallet

      const wsolTransfers = tokenTransfers.filter(t => t.mint === SOL_MINT);
      for (const transfer of wsolTransfers) {
        if (transfer.fromUserAccount === walletAddress) {
          wsolIn += transfer.tokenAmount / 1e9; // Convert lamports to SOL
        }
        if (transfer.toUserAccount === walletAddress) {
          wsolOut += transfer.tokenAmount / 1e9; // Convert lamports to SOL
        }
      }

      // Use WSOL if present (it's the canonical DEX transfer),
      // otherwise fall back to native SOL. Never add both!
      // This prevents double-counting when SOL is wrapped/unwrapped as part of the swap.
      if (wsolIn > 0 || wsolOut > 0) {
        // WSOL transfers exist - use those (they represent the actual DEX swap)
        solIn = wsolIn;
        solOut = wsolOut;
      } else {
        // No WSOL, use native SOL transfers
        solIn = nativeSolIn;
        solOut = nativeSolOut;
      }
    }

    // Find the token transfer that involves THIS wallet (not just any transfer of the token)
    const tokenTransfer = tokenTransfers.find(t =>
      t.mint === normalized.tokenMint &&
      t.tokenStandard === 'Fungible' &&
      t.mint !== SOL_MINT &&
      (t.toUserAccount === walletAddress || t.fromUserAccount === walletAddress)
    );

    if (tokenTransfer) {
      normalized.tokenAmount = tokenTransfer.tokenAmount;
    }

    // Set SOL amount based on buy/sell
    if (normalized.type === 'BUY') {
      normalized.solAmount = solIn;
    } else {
      normalized.solAmount = solOut;
    }

    // SANITY CHECK: Detect suspiciously large SOL amounts which may indicate parsing error
    // A single swap > 10,000 SOL is extremely rare and likely a bug
    const MAX_REASONABLE_SWAP_SOL = 10000;
    if (normalized.solAmount > MAX_REASONABLE_SWAP_SOL) {
      console.error(`[HELIUS SANITY] Suspiciously large solAmount: ${normalized.solAmount.toFixed(4)} SOL`);
      console.error(`[HELIUS SANITY] Transaction details:`, {
        signature: heliusTx.signature,
        type: normalized.type,
        tokenMint: normalized.tokenMint,
        tokenAmount: normalized.tokenAmount,
        nativeBalanceChange: walletAccountData?.nativeBalanceChange,
        solIn,
        solOut,
        accountDataPresent: !!walletAccountData
      });
    }
  }

  /**
   * Parse transfer transaction details
   */
  static parseTransferDetails(heliusTx, normalized, walletAddress) {
    const tokenTransfers = heliusTx.tokenTransfers || [];
    const accountData = heliusTx.accountData || [];

    // Find the transfer that involves THIS wallet
    const tokenTransfer = tokenTransfers.find(t =>
      t.mint === normalized.tokenMint &&
      (t.toUserAccount === walletAddress || t.fromUserAccount === walletAddress)
    );

    if (tokenTransfer) {
      // Helius Enhanced API returns tokenAmount already in human-readable format
      normalized.tokenAmount = tokenTransfer.tokenAmount;
      normalized.isEstimated = normalized.type === 'TRANSFER_OUT'; // Mark transfers out as estimated
    }

    // CRITICAL: Extract SOL amounts from accountData.nativeBalanceChange
    // Many DEXes (including those used for AVICI) classify swaps as TRANSFER instead of SWAP
    // and store SOL amounts in accountData instead of nativeTransfers
    const walletAccountData = accountData.find(acc => acc.account === walletAddress);
    if (walletAccountData && walletAccountData.nativeBalanceChange) {
      const balanceChange = Math.abs(walletAccountData.nativeBalanceChange) / 1e9;
      // For transfers, the balance change represents the SOL amount
      normalized.solAmount = balanceChange;
    }
  }

  /**
   * Get token metadata from Helius (with in-memory + Redis cache)
   */
  static async getTokenMetadata(mint) {
    // Check in-memory cache first (fastest)
    if (metadataCache.has(mint)) {
      return metadataCache.get(mint);
    }

    // Check Redis cache second
    const cached = await redis.get(`token:${mint}:metadata`);
    if (cached) {
      try {
        // Parse JSON from Redis
        const parsed = JSON.parse(cached);
        // Populate in-memory cache for next time
        metadataCache.set(mint, parsed);
        return parsed;
      } catch {
        // Invalid cache entry, will re-fetch below
      }
    }

    try {
      // Use Helius DAS API for asset metadata
      const response = await fetch(HELIUS_RPC_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.HELIUS_API_KEY}`
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getAsset',
          params: { id: mint }
        })
      });

      const data = await response.json();
      const metadata = data.result;

      const info = {
        mint,
        symbol: metadata?.content?.metadata?.symbol || 'UNKNOWN',
        name: metadata?.content?.metadata?.name || 'Unknown Token',
        decimals: metadata?.token_info?.decimals || 9,
        supply: metadata?.token_info?.supply || 0
      };

      // Cache in both Redis (7 days) and in-memory
      await redis.setex(`token:${mint}:metadata`, 604800, JSON.stringify(info));
      metadataCache.set(mint, info);
      return info;

    } catch (error) {
      console.error(`Failed to fetch metadata for ${mint}:`, error.message);
      return {
        mint,
        symbol: 'UNKNOWN',
        name: 'Unknown Token',
        decimals: 9,
        supply: 0
      };
    }
  }

  /**
   * Batch fetch token metadata for multiple mints (much faster than individual calls)
   * Uses Helius getAssetBatch API to fetch up to 1000 assets at once
   * @param {Array<string>} mints - Array of token mint addresses
   * @param {Function} progressCallback - Optional callback(percent, message)
   */
  static async batchFetchTokenMetadata(mints, progressCallback = () => {}) {
    if (!mints || mints.length === 0) return;

    // Filter out mints we already have cached
    const uncachedMints = [];
    for (const mint of mints) {
      if (!metadataCache.has(mint)) {
        const cached = await redis.get(`token:${mint}:metadata`);
        if (cached) {
          try {
            metadataCache.set(mint, JSON.parse(cached));
          } catch {
            uncachedMints.push(mint);
          }
        } else {
          uncachedMints.push(mint);
        }
      }
    }

    if (uncachedMints.length === 0) {
      progressCallback(1.0, 'All token metadata cached');
      return;
    }

    console.log(`Batch fetching metadata for ${uncachedMints.length} tokens...`);
    progressCallback(0, `Fetching metadata for ${uncachedMints.length} tokens...`);

    // Helius getAssetBatch supports up to 1000 assets per request
    const BATCH_SIZE = 1000;
    let processed = 0;

    for (let i = 0; i < uncachedMints.length; i += BATCH_SIZE) {
      const batch = uncachedMints.slice(i, i + BATCH_SIZE);

      try {
        const response = await fetch(HELIUS_RPC_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getAssetBatch',
            params: { ids: batch }
          })
        });

        const data = await response.json();
        const assets = data.result || [];

        for (const asset of assets) {
          if (asset && asset.id) {
            const info = {
              mint: asset.id,
              symbol: asset.content?.metadata?.symbol || 'UNKNOWN',
              name: asset.content?.metadata?.name || 'Unknown Token',
              decimals: asset.token_info?.decimals || 9,
              supply: asset.token_info?.supply || 0
            };

            // Cache in both Redis and memory
            await redis.setex(`token:${asset.id}:metadata`, 604800, JSON.stringify(info));
            metadataCache.set(asset.id, info);
          }
        }

        // For any mints not returned by the API, set UNKNOWN
        const returnedMints = new Set(assets.map(a => a?.id).filter(Boolean));
        for (const mint of batch) {
          if (!returnedMints.has(mint) && !metadataCache.has(mint)) {
            const unknownInfo = { mint, symbol: 'UNKNOWN', name: 'Unknown Token', decimals: 9, supply: 0 };
            await redis.setex(`token:${mint}:metadata`, 86400, JSON.stringify(unknownInfo)); // 1 day cache for unknown
            metadataCache.set(mint, unknownInfo);
          }
        }
      } catch (error) {
        console.error(`Batch metadata fetch error:`, error.message);
        // Set UNKNOWN for failed batch
        for (const mint of batch) {
          if (!metadataCache.has(mint)) {
            metadataCache.set(mint, { mint, symbol: 'UNKNOWN', name: 'Unknown Token', decimals: 9, supply: 0 });
          }
        }
      }

      processed += batch.length;
      progressCallback(processed / uncachedMints.length, `Fetched metadata: ${processed}/${uncachedMints.length}`);
    }

    console.log(`Batch metadata fetch complete: ${processed} tokens`);
  }

  /**
   * Extract unique token mints from raw transactions (before parsing)
   * @param {Array} rawTransactions - Raw Helius transactions
   * @returns {Array<string>} - Unique token mint addresses
   */
  static extractUniqueMints(rawTransactions) {
    const mints = new Set();
    for (const tx of rawTransactions) {
      const tokenTransfers = tx.tokenTransfers || [];
      for (const transfer of tokenTransfers) {
        if (transfer.mint && transfer.mint !== SOL_MINT && !STABLECOINS.has(transfer.mint)) {
          mints.add(transfer.mint);
        }
      }
    }
    return Array.from(mints);
  }

  /**
   * Fetch transactions after a specific signature (for incremental updates)
   */
  static async getTransactionsAfter(walletAddress, afterSignature) {
    if (!this.isValidSolanaAddress(walletAddress)) {
      throw new Error('Invalid Solana wallet address');
    }

    const transactions = [];
    let cursor = null;

    while (true) {
      const params = [walletAddress, { limit: SIGNATURE_BATCH_SIZE }];
      if (cursor) {
        params[1].before = cursor;
      }

      const response = await heliusRPC('getSignaturesForAddress', params);

      // Stop when we reach the afterSignature
      const stopIndex = response.findIndex(tx => tx.signature === afterSignature);

      if (stopIndex !== -1) {
        // Only take transactions before the stopIndex
        const newTransactions = response.slice(0, stopIndex);
        transactions.push(...newTransactions);
        break;
      }

      transactions.push(...response);

      if (response.length < BATCH_SIZE) {
        break; // No more transactions
      }

      cursor = response[response.length - 1].signature;
    }

    console.log(`Fetched ${transactions.length} new transactions since ${afterSignature}`);
    return transactions;
  }

  /**
   * Helper: Sleep for specified milliseconds
   */
  static sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = HeliusService;
