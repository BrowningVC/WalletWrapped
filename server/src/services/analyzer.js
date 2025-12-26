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
   * @param {function} progressCallback - Progress updates: (percent, message)
   */
  static async analyzeWallet(walletAddress, progressCallback = () => {}) {
    console.log(`Starting analysis for wallet: ${walletAddress}`);
    const startTime = Date.now();

    try {
      // Step 1: Fetch all transactions (0-40%)
      progressCallback(5, 'Fetching transaction history...');

      const rawTransactions = await HeliusService.fetchAllTransactions(
        walletAddress,
        (fetched, estimated) => {
          const progress = 5 + (fetched / Math.max(estimated, 1)) * 35;
          progressCallback(Math.min(progress, 40), `Fetched ${fetched} transactions...`);
        }
      );

      if (rawTransactions.length === 0) {
        throw new Error('No transactions found for this wallet');
      }

      progressCallback(40, `Parsing ${rawTransactions.length} transactions...`);

      // Step 2: Parse and normalize transactions (40-50%)
      const normalizedTransactions = this.parseTransactionsStream(
        rawTransactions,
        walletAddress,
        (processed, total) => {
          const progress = 40 + (processed / total) * 10;
          progressCallback(progress, `Parsing transactions: ${processed}/${total}`);
        }
      );

      progressCallback(50, 'Calculating profit & loss...');

      // Step 3: Calculate P&L (50-70%)
      const { positions, dailyPNL, summary } = await PNLCalculator.calculate(
        normalizedTransactions,
        walletAddress
      );

      progressCallback(70, 'Saving to database...');

      // Step 4: Save to database in batches (70-85%)
      await this.saveToDatabase(walletAddress, {
        transactions: normalizedTransactions,
        positions,
        dailyPNL,
        summary
      }, (progress) => {
        const saveProgress = 70 + progress * 15;
        progressCallback(saveProgress, 'Saving results...');
      });

      progressCallback(85, 'Analysis complete!');

      const duration = Date.now() - startTime;
      console.log(`Wallet analysis completed in ${duration}ms`);

      return {
        walletAddress,
        transactionCount: normalizedTransactions.length,
        positionCount: Object.keys(positions).length,
        summary,
        duration
      };

    } catch (error) {
      console.error('Wallet analysis failed:', error);
      throw error;
    }
  }

  /**
   * Parse transactions in streaming fashion (memory efficient)
   */
  static parseTransactionsStream(rawTransactions, walletAddress, progressCallback = () => {}) {
    const normalized = [];
    const total = rawTransactions.length;

    for (let i = 0; i < total; i++) {
      const parsed = HeliusService.parseTransaction(rawTransactions[i], walletAddress);

      if (parsed) {
        // Add wallet address to each transaction
        parsed.walletAddress = walletAddress;
        normalized.push(parsed);
      }

      // Report progress every 100 transactions
      if (i % 100 === 0) {
        progressCallback(i + 1, total);
      }
    }

    // Final progress update
    progressCallback(total, total);

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
    const normalized = this.parseTransactionsStream(
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

    return {
      walletAddress,
      newTransactions: normalized.length,
      updated: true
    };
  }

  /**
   * Convert database positions array to map by mint
   */
  static convertPositionsToMap(positionsArray) {
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
        trades: [],
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
