const { PublicKey } = require('@solana/web3.js');
const redis = require('../config/redis');
require('dotenv').config();

// Helius API base URL
const HELIUS_API_URL = `https://api.helius.xyz/v0`;
const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;

/**
 * Make a Helius API POST request (for enhanced transactions)
 */
async function heliusPostRequest(endpoint, body = {}) {
  const url = `${HELIUS_API_URL}${endpoint}?api-key=${process.env.HELIUS_API_KEY}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`Helius API error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

/**
 * Make a Helius RPC request
 */
async function heliusRPC(method, params) {
  const response = await fetch(HELIUS_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params
    })
  });

  if (!response.ok) {
    throw new Error(`Helius RPC error: ${response.status}`);
  }

  const data = await response.json();
  if (data.error) {
    throw new Error(`RPC error: ${data.error.message}`);
  }
  return data.result;
}

// Constants - Optimized for speed
const SIGNATURE_BATCH_SIZE = 500; // RPC getSignaturesForAddress limit (can be up to 1000)
const ENHANCED_TX_BATCH_SIZE = 100; // Helius Enhanced Transactions API limit
const PARALLEL_REQUESTS = 5; // Parallel signature fetches
const MAX_RETRIES = 3;
const RETRY_DELAY = 500; // 500ms base delay

// Solana native mint (SOL)
const SOL_MINT = 'So11111111111111111111111111111111111111112';

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
   * Fetch all transactions for a wallet with parallel pagination
   * @param {string} walletAddress - Solana wallet address
   * @param {function} progressCallback - Called with (fetched, estimated) counts
   * @param {string} beforeSignature - Optional: fetch only transactions before this signature
   */
  static async fetchAllTransactions(walletAddress, progressCallback = () => {}, beforeSignature = null) {
    if (!this.isValidSolanaAddress(walletAddress)) {
      throw new Error('Invalid Solana wallet address');
    }

    const allTransactions = [];
    const seenSignatures = new Set(); // For deduplication
    let cursors = [beforeSignature]; // Start with first page or specific signature
    let totalFetched = 0;

    console.log(`Starting transaction fetch for wallet: ${walletAddress}`);

    while (cursors.length > 0) {
      // Fetch up to 5 pages in parallel
      const promises = cursors.slice(0, PARALLEL_REQUESTS).map(cursor =>
        this.fetchTransactionPage(walletAddress, cursor)
      );

      const results = await Promise.all(promises);

      // Process each batch
      for (const result of results) {
        if (!result || !result.transactions) continue;

        // Deduplicate and add transactions
        for (const tx of result.transactions) {
          if (!seenSignatures.has(tx.signature)) {
            seenSignatures.add(tx.signature);
            allTransactions.push(tx);
            totalFetched++;
          }
        }
      }

      // Update progress
      progressCallback(totalFetched, totalFetched + 1000);

      // Update cursors for next iteration
      cursors = results
        .filter(r => r && r.hasMore && r.cursor)
        .map(r => r.cursor);
    }

    console.log(`Fetched ${totalFetched} transactions for wallet: ${walletAddress}`);
    return allTransactions;
  }

  /**
   * Fetch a single page of transactions with retry logic
   */
  static async fetchTransactionPage(walletAddress, beforeSignature = null, attempt = 1) {
    try {
      // Get signatures using RPC (can fetch up to 500 at once)
      const params = [walletAddress, { limit: SIGNATURE_BATCH_SIZE }];
      if (beforeSignature) {
        params[1].before = beforeSignature;
      }

      const response = await heliusRPC('getSignaturesForAddress', params);
      const signatures = response.map(tx => tx.signature);

      if (signatures.length === 0) {
        return { transactions: [], hasMore: false };
      }

      // Chunk signatures into batches of 100 for Enhanced Transactions API
      // Process sequentially with small delays to avoid 429 rate limits
      const allParsedTransactions = [];
      for (let i = 0; i < signatures.length; i += ENHANCED_TX_BATCH_SIZE) {
        const chunk = signatures.slice(i, i + ENHANCED_TX_BATCH_SIZE);
        const parsedChunk = await heliusPostRequest('/transactions', { transactions: chunk });
        if (Array.isArray(parsedChunk)) {
          allParsedTransactions.push(...parsedChunk.filter(tx => tx !== null));
        }
        // Small delay between chunks to avoid rate limits (50ms)
        if (i + ENHANCED_TX_BATCH_SIZE < signatures.length) {
          await this.sleep(50);
        }
      }

      return {
        transactions: allParsedTransactions,
        hasMore: response.length === SIGNATURE_BATCH_SIZE,
        cursor: response[response.length - 1]?.signature
      };

    } catch (error) {
      // Retry with exponential backoff
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY * Math.pow(2, attempt - 1);
        console.warn(`Retry attempt ${attempt} after ${delay}ms:`, error.message);
        await this.sleep(delay);
        return this.fetchTransactionPage(walletAddress, beforeSignature, attempt + 1);
      }

      console.error('Failed to fetch transaction page:', error);
      throw error;
    }
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
   * CRITICAL: Filters out SOL-only transfers
   */
  static classifyTransaction(heliusTx, walletAddress) {
    const nativeTransfers = heliusTx.nativeTransfers || [];
    const tokenTransfers = heliusTx.tokenTransfers || [];

    // PRIORITY 1: Filter out SOL-only transfers (DO NOT count for P&L)
    if (tokenTransfers.length === 0) {
      return { type: 'SOL_TRANSFER', skip: true };
    }

    // Find non-SOL token transfers (the actual meme coins)
    const nonSolTokenTransfers = tokenTransfers.filter(t =>
      t.tokenStandard === 'Fungible' && t.mint !== SOL_MINT
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
   */
  static parseSwapDetails(heliusTx, normalized, walletAddress) {
    const nativeTransfers = heliusTx.nativeTransfers || [];
    const tokenTransfers = heliusTx.tokenTransfers || [];

    // Calculate native SOL in/out
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
    let wsolIn = 0;  // WSOL leaving wallet
    let wsolOut = 0; // WSOL entering wallet

    const wsolTransfers = tokenTransfers.filter(t => t.mint === SOL_MINT);
    for (const transfer of wsolTransfers) {
      if (transfer.fromUserAccount === walletAddress) {
        wsolIn += transfer.tokenAmount;
      }
      if (transfer.toUserAccount === walletAddress) {
        wsolOut += transfer.tokenAmount;
      }
    }

    // CRITICAL: Use WSOL if present (it's the canonical DEX transfer),
    // otherwise fall back to native SOL. Never add both!
    // This prevents double-counting when SOL is wrapped/unwrapped as part of the swap.
    let solIn, solOut;

    if (wsolIn > 0 || wsolOut > 0) {
      // WSOL transfers exist - use those (they represent the actual DEX swap)
      solIn = wsolIn;
      solOut = wsolOut;
    } else {
      // No WSOL, use native SOL transfers
      solIn = nativeSolIn;
      solOut = nativeSolOut;
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
  }

  /**
   * Parse transfer transaction details
   */
  static parseTransferDetails(heliusTx, normalized, walletAddress) {
    const tokenTransfers = heliusTx.tokenTransfers || [];
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
  }

  /**
   * Get token metadata from Helius (with Redis cache)
   */
  static async getTokenMetadata(mint) {
    // Check cache first
    const cached = await redis.get(`token:${mint}:metadata`);
    if (cached) {
      return cached;
    }

    try {
      // Use Helius DAS API for asset metadata
      const response = await fetch(HELIUS_RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

      // Cache for 7 days
      await redis.setex(`token:${mint}:metadata`, 604800, info);
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
   * Fetch transactions after a specific signature (for incremental updates)
   */
  static async getTransactionsAfter(walletAddress, afterSignature) {
    if (!this.isValidSolanaAddress(walletAddress)) {
      throw new Error('Invalid Solana wallet address');
    }

    const transactions = [];
    let cursor = null;

    while (true) {
      const params = [walletAddress, { limit: BATCH_SIZE }];
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
