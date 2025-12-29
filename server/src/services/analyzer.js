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
      // Step 1: Fetch all transactions (0-45%)
      // UX OPTIMIZATION: Progress ramps up quickly to 28% during initial scan for perceived speed
      // Phase 1 (0-28%): Count signatures - fast ramp up with frequent updates
      // Phase 2 (28-45%): Fetch enhanced transaction data

      // Quick initial progress updates for immediate visual feedback
      progressCallback(2, 'Connecting to Solana...', { fetched: 0, total: null });
      await new Promise(r => setTimeout(r, 80));
      progressCallback(5, 'Scanning wallet history...', { fetched: 0, total: null });
      await new Promise(r => setTimeout(r, 80));
      progressCallback(8, 'Initializing transaction scan...', { fetched: 0, total: null });

      let lastCountUpdate = 0;
      let lastProgressUpdate = Date.now();
      const rawTransactions = await HeliusService.fetchAllTransactions(
        walletAddress,
        (fetched, total, phase) => {
          if (phase === 'counting') {
            // During signature collection, ramp up quickly to 28% for better perceived speed
            // Use aggressive logarithmic scaling - most progress happens in first few batches
            let countProgress;
            if (total <= 100) {
              // First 100 txs = 8-16% (very fast initial jump)
              countProgress = 8 + (total / 100) * 8;
            } else if (total <= 500) {
              // 100-500 txs = 16-22%
              countProgress = 16 + ((total - 100) / 400) * 6;
            } else if (total <= 1000) {
              // 500-1000 txs = 22-25%
              countProgress = 22 + ((total - 500) / 500) * 3;
            } else {
              // 1000+ txs = 25-28% (slow down as we approach cap)
              countProgress = 25 + Math.min((total - 1000) / 9000, 1) * 3;
            }

            // More frequent updates during counting phase (every 100 signatures or 150ms)
            const now = Date.now();
            if (total - lastCountUpdate >= 100 || total < 100 || now - lastProgressUpdate > 150) {
              lastCountUpdate = total;
              lastProgressUpdate = now;
              progressCallback(
                Math.min(countProgress, 28),
                `Found ${total.toLocaleString()} transactions...`,
                { fetched: 0, total: total }
              );
            }
          } else {
            // During enhanced data fetch, show fetch progress (28-45%)
            const progress = 28 + (fetched / Math.max(total, 1)) * 17;
            progressCallback(
              Math.min(progress, 45),
              `Fetching transaction details: ${fetched.toLocaleString()} / ${total.toLocaleString()}`,
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
      progressCallback(45, `Pre-fetching token metadata...`, { fetched: totalTx, total: totalTx, processed: 0 });
      const uniqueMints = HeliusService.extractUniqueMints(rawTransactions);
      console.log(`Found ${uniqueMints.length} unique token mints to fetch metadata for`);

      await HeliusService.batchFetchTokenMetadata(uniqueMints, (percent, message) => {
        const progress = 45 + (percent * 5); // 45-50% for metadata
        progressCallback(progress, message, { fetched: totalTx, total: totalTx, processed: 0 });
      });

      progressCallback(50, `Parsing ${totalTx.toLocaleString()} transactions...`, { fetched: totalTx, total: totalTx, processed: 0 });

      // Step 2b: Parse and normalize transactions (50-55%)
      const normalizedTransactions = await this.parseTransactionsStream(
        rawTransactions,
        walletAddress,
        (processed, total) => {
          const progress = 50 + (processed / total) * 5;
          progressCallback(
            progress,
            `Parsing transactions: ${processed.toLocaleString()} / ${total.toLocaleString()}`,
            { fetched: total, total, processed }
          );
        }
      );

      progressCallback(55, 'Calculating profit & loss...', { fetched: totalTx, total: totalTx, processed: totalTx });

      // Step 3: Calculate P&L (55-75%)
      const { positions, dailyPNL, summary } = await PNLCalculator.calculate(
        normalizedTransactions,
        walletAddress,
        (pnlProgress, pnlMessage) => {
          // Map P&L progress (0-1) to overall progress (55-75%)
          const overallProgress = 55 + (pnlProgress * 20);
          progressCallback(overallProgress, pnlMessage, { fetched: totalTx, total: totalTx, processed: Math.round(pnlProgress * totalTx) });
        }
      );

      progressCallback(75, 'Saving to database...', { fetched: totalTx, total: totalTx, processed: totalTx });

      // Step 4: Save to database in batches (75-90%)
      await this.saveToDatabase(walletAddress, {
        transactions: normalizedTransactions,
        positions,
        dailyPNL,
        summary
      }, (progress) => {
        const saveProgress = 75 + progress * 15;
        progressCallback(saveProgress, 'Saving results...', { fetched: totalTx, total: totalTx, processed: totalTx });
      });

      progressCallback(90, 'Analysis complete!', { fetched: totalTx, total: totalTx, processed: totalTx });

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
   * OPTIMIZATION: Run independent DB operations in parallel for 60-70% faster saves
   */
  static async saveToDatabase(walletAddress, data, progressCallback = () => {}) {
    const { transactions, positions, dailyPNL, summary } = data;

    try {
      progressCallback(0);

      // OPTIMIZATION: Run independent database saves in parallel
      // These three operations don't depend on each other
      const savePromises = [];

      // Save transactions
      if (transactions && transactions.length > 0) {
        savePromises.push(
          DatabaseQueries.insertTransactionsBatch(transactions)
            .then(() => console.log(`Saved ${transactions.length} transactions`))
        );
      }

      // Save positions
      if (positions) {
        savePromises.push(
          DatabaseQueries.upsertPositionsBatch(walletAddress, positions)
            .then(() => console.log(`Saved ${Object.keys(positions).length} positions`))
        );
      }

      // Save daily P&L (with SOL prices)
      if (dailyPNL) {
        const dates = Object.keys(dailyPNL);
        savePromises.push(
          this.getSolPricesForDates(dates)
            .then(solPrices => DatabaseQueries.upsertDailyPNL(walletAddress, dailyPNL, solPrices))
            .then(() => console.log(`Saved ${dates.length} daily P&L records`))
        );
      }

      // Wait for all parallel saves to complete
      await Promise.all(savePromises);
      progressCallback(0.9);

      // Complete analysis record (depends on transactions being saved)
      const lastSignature = transactions.length > 0
        ? transactions[transactions.length - 1].signature
        : null;

      await DatabaseQueries.completeAnalysis(
        walletAddress,
        transactions.length,
        lastSignature
      );
      progressCallback(1.0);

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
