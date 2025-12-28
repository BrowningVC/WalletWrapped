const HeliusService = require('./helius');
const PNLCalculator = require('./pnl');
const PriceOracle = require('./priceOracle');
const DatabaseQueries = require('../database/queries');

/**
 * Wallet Analyzer - Orchestrates the complete analysis pipeline
 * Optimized for streaming processing and memory efficiency
 */
class WalletAnalyzer {
  /**
   * Analyze wallet with streaming processing for memory efficiency
   * @param {string} walletAddress - Solana wallet address
   * @param {function} progressCallback - Progress updates: (percent, message, details?)
   */
  static async analyzeWallet(walletAddress, progressCallback = () => {}) {
    console.log(`Starting analysis for wallet: ${walletAddress}`);
    const startTime = Date.now();

    try {
      // Step 1: Fetch all transactions (0-40%)
      // Phase 1 (0-13%): Count signatures to get accurate total
      // Phase 2 (13-40%): Fetch enhanced transaction data
      progressCallback(5, 'Fetching transaction history...', { fetched: 0, total: null });

      const rawTransactions = await HeliusService.fetchAllTransactions(
        walletAddress,
        (fetched, total, phase) => {
          if (phase === 'counting') {
            // During signature collection, show counting progress (5-13%)
            progressCallback(
              Math.min(5 + (total / 10000) * 8, 13), // Cap at 13%, scale based on count
              `Counting transactions: ${total.toLocaleString()} found...`,
              { fetched: 0, total: total }
            );
          } else {
            // During enhanced data fetch, show fetch progress (13-40%)
            const progress = 13 + (fetched / Math.max(total, 1)) * 27;
            progressCallback(
              Math.min(progress, 40),
              `Fetching transactions: ${fetched.toLocaleString()} of ${total.toLocaleString()}...`,
              { fetched, total }
            );
          }
        }
      );

      if (rawTransactions.length === 0) {
        throw new Error('No transactions found for this wallet');
      }

      const totalTx = rawTransactions.length;

      // Step 2a: Pre-fetch all token metadata in batch (much faster than individual calls)
      // This populates the cache so parseTransaction doesn't need to make API calls
      progressCallback(40, `Pre-fetching token metadata...`, { fetched: totalTx, total: totalTx, processed: 0 });
      const uniqueMints = HeliusService.extractUniqueMints(rawTransactions);
      console.log(`Found ${uniqueMints.length} unique token mints to fetch metadata for`);

      await HeliusService.batchFetchTokenMetadata(uniqueMints, (percent, message) => {
        const progress = 40 + (percent * 5); // 40-45% for metadata
        progressCallback(progress, message, { fetched: totalTx, total: totalTx, processed: 0 });
      });

      progressCallback(45, `Parsing ${totalTx.toLocaleString()} transactions...`, { fetched: totalTx, total: totalTx, processed: 0 });

      // Step 2b: Parse and normalize transactions (45-50%)
      const normalizedTransactions = await this.parseTransactionsStream(
        rawTransactions,
        walletAddress,
        (processed, total) => {
          const progress = 45 + (processed / total) * 5;
          progressCallback(
            progress,
            `Parsing transactions: ${processed.toLocaleString()} / ${total.toLocaleString()}`,
            { fetched: total, total, processed }
          );
        }
      );

      progressCallback(50, 'Calculating profit & loss...', { fetched: totalTx, total: totalTx, processed: totalTx });

      // Step 3: Calculate P&L (50-70%)
      const { positions, dailyPNL, summary } = await PNLCalculator.calculate(
        normalizedTransactions,
        walletAddress,
        (pnlProgress, pnlMessage) => {
          // Map P&L progress (0-1) to overall progress (50-70%)
          const overallProgress = 50 + (pnlProgress * 20);
          progressCallback(overallProgress, pnlMessage, { fetched: totalTx, total: totalTx, processed: Math.round(pnlProgress * totalTx) });
        }
      );

      progressCallback(70, 'Saving to database...', { fetched: totalTx, total: totalTx, processed: totalTx });

      // Step 4: Save to database in batches (70-85%)
      await this.saveToDatabase(walletAddress, {
        transactions: normalizedTransactions,
        positions,
        dailyPNL,
        summary
      }, (progress) => {
        const saveProgress = 70 + progress * 15;
        progressCallback(saveProgress, 'Saving results...', { fetched: totalTx, total: totalTx, processed: totalTx });
      });

      progressCallback(85, 'Analysis complete!', { fetched: totalTx, total: totalTx, processed: totalTx });

      const duration = Date.now() - startTime;
      console.log(`Wallet analysis completed in ${duration}ms`);

      return {
        walletAddress,
        transactionCount: normalizedTransactions.length,
        positionCount: Object.keys(positions).length,
        positions,  // Include positions with trades for highlight generation
        summary,
        duration
      };

    } catch (error) {
      console.error('Wallet analysis failed:', error);
      throw error;
    }
  }

  /**
   * Parse transactions with parallel batch processing for speed
   * Processes transactions in parallel batches while maintaining order
   */
  static async parseTransactionsStream(rawTransactions, walletAddress, progressCallback = () => {}) {
    const normalized = [];
    const total = rawTransactions.length;
    const BATCH_SIZE = 200; // Process 200 transactions in parallel (parsing is CPU-light)

    for (let i = 0; i < total; i += BATCH_SIZE) {
      const batch = rawTransactions.slice(i, i + BATCH_SIZE);

      // Process batch in parallel
      const parsedBatch = await Promise.all(
        batch.map(tx => HeliusService.parseTransaction(tx, walletAddress))
      );

      // Filter nulls and add wallet address
      for (const parsed of parsedBatch) {
        if (parsed) {
          parsed.walletAddress = walletAddress;
          normalized.push(parsed);
        }
      }

      // Report progress
      const processed = Math.min(i + BATCH_SIZE, total);
      progressCallback(processed, total);
    }

    return normalized;
  }

  /**
   * Save analysis results to database (optimized batch operations)
   */
  static async saveToDatabase(walletAddress, data, progressCallback = () => {}) {
    const { transactions, positions, dailyPNL, summary } = data;

    try {
      // Save transactions in batches (0-40% of save progress)
      progressCallback(0);
      if (transactions && transactions.length > 0) {
        await DatabaseQueries.insertTransactionsBatch(transactions);
      }
      progressCallback(0.4);

      // Save positions (40-70% of save progress)
      if (positions) {
        await DatabaseQueries.upsertPositionsBatch(walletAddress, positions);
      }
      progressCallback(0.7);

      // Save daily P&L (70-90% of save progress)
      if (dailyPNL) {
        // Get SOL prices for USD conversion
        const dates = Object.keys(dailyPNL);
        const solPrices = await this.getSolPricesForDates(dates);
        await DatabaseQueries.upsertDailyPNL(walletAddress, dailyPNL, solPrices);
      }
      progressCallback(0.9);

      // Complete analysis record (90-100% of save progress)
      const lastSignature = transactions.length > 0
        ? transactions[transactions.length - 1].signature
        : null;

      await DatabaseQueries.completeAnalysis(
        walletAddress,
        transactions.length,
        lastSignature
      );
      progressCallback(1.0);

      console.log(`Saved ${transactions.length} transactions and ${Object.keys(positions).length} positions`);

    } catch (error) {
      console.error('Database save error:', error);
      throw error;
    }
  }

  /**
   * Get or fetch SOL prices for specific dates
   */
  static async getSolPricesForDates(dates) {
    const prices = {};
    const currentPrice = await PriceOracle.getSolPriceUSD();

    for (const date of dates) {
      // For now, use current price for all dates
      // TODO: Fetch historical prices from an API
      prices[date] = currentPrice;
    }

    return prices;
  }

  /**
   * Incremental analysis - only process new transactions
   */
  static async analyzeWalletIncremental(walletAddress, progressCallback = () => {}) {
    const existing = await DatabaseQueries.getAnalysis(walletAddress);

    if (!existing || !existing.last_signature) {
      // No existing analysis, do full analysis
      return this.analyzeWallet(walletAddress, progressCallback);
    }

    const age = Date.now() - new Date(existing.completed_at).getTime();
    const isStale = age > 24 * 60 * 60 * 1000; // 24 hours

    if (!isStale) {
      console.log('Using cached analysis');
      progressCallback(100, 'Analysis up to date!');
      return {
        walletAddress,
        cached: true,
        lastUpdate: existing.completed_at
      };
    }

    // Fetch only new transactions
    progressCallback(10, 'Checking for new transactions...');

    const newTransactions = await HeliusService.getTransactionsAfter(
      walletAddress,
      existing.last_signature
    );

    if (newTransactions.length === 0) {
      console.log('No new transactions since last analysis');
      progressCallback(100, 'No new activity!');
      return {
        walletAddress,
        cached: true,
        newTransactions: 0
      };
    }

    progressCallback(30, `Processing ${newTransactions.length} new transactions...`);

    // Parse new transactions
    const normalized = await this.parseTransactionsStream(
      newTransactions,
      walletAddress
    );

    // Load existing positions
    const existingPositions = await DatabaseQueries.getPositions(walletAddress);
    const positions = this.convertPositionsToMap(existingPositions);

    // Update positions with new transactions
    for (const tx of normalized) {
      if (!positions[tx.tokenMint]) {
        positions[tx.tokenMint] = PNLCalculator.createEmptyPosition(
          tx.tokenMint,
          tx.tokenSymbol
        );
      }
      await PNLCalculator.processTransaction(positions[tx.tokenMint], tx);
    }

    // Recalculate unrealized P&L
    await PNLCalculator.calculateUnrealizedPNL(positions);

    progressCallback(70, 'Saving updates...');

    // Save updates
    await DatabaseQueries.upsertPositionsBatch(walletAddress, positions);
    await DatabaseQueries.insertTransactionsBatch(normalized);

    const lastSignature = normalized.length > 0
      ? normalized[normalized.length - 1].signature
      : existing.last_signature;

    await DatabaseQueries.completeAnalysis(
      walletAddress,
      existing.total_transactions + normalized.length,
      lastSignature
    );

    progressCallback(100, 'Update complete!');

    // Calculate summary
    const summary = PNLCalculator.calculateSummary(positions);

    return {
      walletAddress,
      newTransactions: normalized.length,
      positions,  // Include positions with trades for highlight generation
      summary,
      updated: true
    };
  }

  /**
   * Convert database positions array to map by mint
   * @param {Array} positionsArray - Positions from database
   * @param {Object} tradesMap - Optional map of token_mint -> trades array from getTransactionsGroupedByToken
   */
  static convertPositionsToMap(positionsArray, tradesMap = {}) {
    const map = {};
    for (const pos of positionsArray) {
      map[pos.token_mint] = {
        tokenMint: pos.token_mint,
        tokenSymbol: pos.token_symbol,
        tokenName: pos.token_name,
        solSpent: parseFloat(pos.sol_spent),
        solReceived: parseFloat(pos.sol_received),
        tokensBought: parseFloat(pos.tokens_bought),
        tokensSold: parseFloat(pos.tokens_sold),
        currentBalance: parseFloat(pos.current_balance),
        realizedPNL: parseFloat(pos.realized_pnl_sol),
        unrealizedPNL: parseFloat(pos.unrealized_pnl_sol),
        currentValueSol: parseFloat(pos.current_value_sol),
        currentPriceSol: parseFloat(pos.current_price_sol || 0),
        avgBuyPrice: parseFloat(pos.avg_buy_price || 0),
        avgSellPrice: parseFloat(pos.avg_sell_price || 0),
        firstTradeDate: pos.first_trade_date,
        lastTradeDate: pos.last_trade_date,
        isActive: pos.is_active,
        buyLots: pos.buy_lots || [],
        trades: tradesMap[pos.token_mint] || [],
        metadata: {
          hasEstimatedTransfers: pos.has_estimated_transfers,
          transferCount: pos.transfer_count,
          hasMEVActivity: pos.has_mev_activity,
          hasBalanceDiscrepancy: pos.has_balance_discrepancy
        }
      };
    }
    return map;
  }

  /**
   * Get positions with trades populated from database
   * Used when we need full position data including trade history for highlights
   */
  static async getPositionsWithTrades(walletAddress) {
    const [positions, tradesRows] = await Promise.all([
      DatabaseQueries.getPositions(walletAddress),
      DatabaseQueries.getTransactionsGroupedByToken(walletAddress)
    ]);

    // Convert trades rows to a map by token_mint
    const tradesMap = {};
    for (const row of tradesRows) {
      tradesMap[row.token_mint] = row.trades;
    }

    return this.convertPositionsToMap(positions, tradesMap);
  }

  /**
   * Get analysis summary stats
   */
  static async getAnalysisSummary(walletAddress) {
    const positions = await DatabaseQueries.getPositions(walletAddress);
    const analysis = await DatabaseQueries.getAnalysis(walletAddress);

    if (!analysis) {
      return null;
    }

    const summary = PNLCalculator.calculateSummary(
      this.convertPositionsToMap(positions)
    );

    return {
      walletAddress,
      status: analysis.analysis_status,
      transactionCount: analysis.total_transactions,
      lastUpdate: analysis.completed_at,
      ...summary
    };
  }
}

module.exports = WalletAnalyzer;
