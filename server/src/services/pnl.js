const PriceOracle = require('./priceOracle');

// WSOL mint address
const WSOL_MINT = 'So11111111111111111111111111111111111111112';

/**
 * PNL Calculator - Net SOL Flow (primary) + FIFO cost basis (per-token)
 * Net SOL Flow tracks actual SOL entering/leaving wallet - matches GMGN methodology
 * FIFO provides per-token P&L breakdown
 */
class PNLCalculator {
  /**
   * Calculate P&L for all token positions
   * @param {Array} transactions - Array of normalized transactions
   * @param {string} walletAddress - Wallet address being analyzed
   * @param {Function} progressCallback - Optional callback for progress updates (percent, message)
   * @returns {Object} { positions, dailyPNL, summary, netSolFlow }
   */
  static async calculate(transactions, walletAddress, progressCallback = () => {}) {
    const positions = {};
    const dailyPNL = {};
    const seenSignatures = new Set();

    // Net SOL Flow tracking - primary P&L method (matches GMGN)
    const solFlow = {
      nativeSolIn: 0,      // SOL received (sells, incoming transfers)
      nativeSolOut: 0,     // SOL spent (buys, outgoing transfers, fees)
      totalFees: 0         // All transaction fees
    };

    // Sort transactions by time (oldest first) for FIFO
    const sortedTxs = transactions
      .filter(tx => tx && tx.signature)
      .sort((a, b) => new Date(a.blockTime) - new Date(b.blockTime));

    const totalTxs = sortedTxs.length;
    console.log(`Calculating P&L for ${totalTxs} transactions`);

    // Progress tracking for P&L calculation
    let lastProgressUpdate = 0;
    const PROGRESS_UPDATE_INTERVAL = 100; // Update every 100 transactions

    for (let txIndex = 0; txIndex < sortedTxs.length; txIndex++) {
      const tx = sortedTxs[txIndex];
      // Skip duplicates
      if (seenSignatures.has(tx.signature)) {
        continue;
      }
      seenSignatures.add(tx.signature);

      // Emit progress update every N transactions
      if (txIndex - lastProgressUpdate >= PROGRESS_UPDATE_INTERVAL || txIndex === totalTxs - 1) {
        lastProgressUpdate = txIndex;
        const pnlProgress = (txIndex + 1) / totalTxs;
        progressCallback(pnlProgress, `Processing transactions: ${(txIndex + 1).toLocaleString()} / ${totalTxs.toLocaleString()}`);
      }

      // Track fees for all transactions
      if (tx.feeSol > 0) {
        solFlow.totalFees += tx.feeSol;
        solFlow.nativeSolOut += tx.feeSol;
      }

      // Skip SOL-only transfers for position tracking (but still count fees above)
      if (tx.type === 'SOL_TRANSFER' || !tx.tokenMint) {
        continue;
      }

      // Track Net SOL Flow (primary P&L method)
      // This measures actual SOL leaving/entering wallet
      this.trackSolFlow(solFlow, tx);

      // Initialize position if needed
      if (!positions[tx.tokenMint]) {
        positions[tx.tokenMint] = this.createEmptyPosition(tx.tokenMint, tx.tokenSymbol);
      }

      const position = positions[tx.tokenMint];

      // Update position based on transaction type (FIFO method for per-token P&L)
      await this.processTransaction(position, tx);

      // Update daily P&L (only for sells/transfers)
      if (tx.type === 'SELL' || tx.type === 'TRANSFER_OUT') {
        this.updateDailyPNL(dailyPNL, tx);
      }
    }

    // Emit progress update before unrealized P&L calculation
    progressCallback(0.9, 'Calculating unrealized P&L...');

    // Calculate unrealized P&L for all active positions
    await this.calculateUnrealizedPNL(positions);

    progressCallback(1.0, 'P&L calculation complete');

    // Calculate current holdings value and remaining cost basis
    const activePositions = Object.values(positions).filter(p => p.isActive);
    const currentHoldingsValue = activePositions.reduce((sum, p) => sum + (p.currentValueSol || 0), 0);
    const remainingCostBasis = activePositions.reduce((sum, p) => {
      // Sum up cost basis from remaining buy lots
      const lotCost = p.buyLots.reduce((s, lot) => s + lot.costBasisSol, 0);
      return sum + lotCost;
    }, 0);

    // Net SOL Flow P&L calculation (primary method - matches GMGN)
    // Realized P&L: SOL received from sells - SOL spent on buys (not including current holdings cost)
    // The cost of current holdings is tracked separately
    const netSolFlowPNL = {
      solIn: solFlow.nativeSolIn,
      solOut: solFlow.nativeSolOut,
      totalFees: solFlow.totalFees,
      currentHoldingsValue,
      remainingCostBasis,
      // Realized = SOL from sells - (SOL for buys that are now sold)
      // This is: total SOL in - (total SOL out - remaining cost basis)
      // = solIn - solOut + remainingCostBasis
      realizedPNL: solFlow.nativeSolIn - (solFlow.nativeSolOut - remainingCostBasis),
      // Unrealized = current holdings value - remaining cost basis
      unrealizedPNL: currentHoldingsValue - remainingCostBasis,
      // Total P&L = Realized + Unrealized = solIn - solOut + currentHoldingsValue
      totalPNL: solFlow.nativeSolIn - solFlow.nativeSolOut + currentHoldingsValue
    };

    console.log(`Net SOL Flow: in=${netSolFlowPNL.solIn.toFixed(4)}, out=${netSolFlowPNL.solOut.toFixed(4)}, costBasis=${remainingCostBasis.toFixed(4)}, holdings=${currentHoldingsValue.toFixed(4)}`);
    console.log(`Realized: ${netSolFlowPNL.realizedPNL.toFixed(4)}, Unrealized: ${netSolFlowPNL.unrealizedPNL.toFixed(4)}, Total: ${netSolFlowPNL.totalPNL.toFixed(4)}`);

    // Calculate summary statistics (uses Net SOL Flow as primary, FIFO as fallback)
    const summary = this.calculateSummary(positions, netSolFlowPNL);

    return { positions, dailyPNL, summary, netSolFlow: netSolFlowPNL };
  }

  /**
   * Create empty position object
   */
  static createEmptyPosition(tokenMint, tokenSymbol = 'UNKNOWN') {
    return {
      tokenMint,
      tokenSymbol,
      tokenName: '',
      solSpent: 0,
      solReceived: 0,
      tokensBought: 0,
      tokensSold: 0,
      currentBalance: 0,
      realizedPNL: 0,
      unrealizedPNL: 0,
      currentValueSol: 0,
      currentPriceSol: 0,
      avgBuyPrice: 0,
      avgSellPrice: 0,
      firstTradeDate: null,
      lastTradeDate: null,
      isActive: false,
      buyLots: [], // FIFO queue: [{ tokenAmount, costBasisSol, costPerToken, date }]
      trades: [],
      metadata: {
        hasEstimatedTransfers: false,
        transferCount: 0,
        hasMEVActivity: false
      }
    };
  }

  /**
   * Track SOL flow for Net SOL Flow P&L calculation
   * This tracks actual SOL entering/leaving the wallet (matches GMGN methodology)
   */
  static trackSolFlow(solFlow, tx) {
    // For BUY: SOL leaves wallet (spent)
    // For SELL: SOL enters wallet (received)
    // Note: We track the solAmount which represents actual SOL movement

    switch (tx.type) {
      case 'BUY':
        // SOL spent on buying tokens
        solFlow.nativeSolOut += tx.solAmount;
        break;

      case 'SELL':
        // SOL received from selling tokens
        solFlow.nativeSolIn += tx.solAmount;
        break;

      case 'TRANSFER_IN':
        // Token transferred in - no SOL movement
        // (The token has value but no SOL was exchanged)
        break;

      case 'TRANSFER_OUT':
        // Token transferred out - no SOL movement
        break;
    }
  }

  /**
   * Process a single transaction and update position
   */
  static async processTransaction(position, tx) {
    // Update first/last trade dates
    const txDate = new Date(tx.blockTime);
    if (!position.firstTradeDate || txDate < position.firstTradeDate) {
      position.firstTradeDate = txDate;
    }
    if (!position.lastTradeDate || txDate > position.lastTradeDate) {
      position.lastTradeDate = txDate;
    }

    // Store trade for later analysis
    position.trades.push(tx);

    // Process based on type
    switch (tx.type) {
      case 'BUY':
        this.processBuy(position, tx);
        break;

      case 'SELL':
        await this.processSell(position, tx);
        break;

      case 'TRANSFER_IN':
        this.processTransferIn(position, tx);
        break;

      case 'TRANSFER_OUT':
        await this.processTransferOut(position, tx);
        break;
    }

    // Update average prices
    if (position.tokensBought > 0) {
      position.avgBuyPrice = position.solSpent / position.tokensBought;
    }
    if (position.tokensSold > 0) {
      position.avgSellPrice = position.solReceived / position.tokensSold;
    }

    // Update current balance
    position.currentBalance = position.tokensBought - position.tokensSold;
    position.isActive = position.currentBalance > 0.000001; // Account for floating point
  }

  /**
   * Process BUY transaction
   */
  static processBuy(position, tx) {
    // Include fee in cost basis
    const totalCost = tx.solAmount + tx.feeSol;
    const costPerToken = totalCost / tx.tokenAmount;

    // Add to FIFO queue
    position.buyLots.push({
      tokenAmount: tx.tokenAmount,
      costBasisSol: totalCost,
      costPerToken: costPerToken,
      date: tx.blockTime
    });

    // Update totals
    position.solSpent += totalCost;
    position.tokensBought += tx.tokenAmount;
  }

  /**
   * Process SELL transaction with FIFO cost basis
   */
  static async processSell(position, tx) {
    let remainingToSell = tx.tokenAmount;
    let totalCostBasis = 0;

    // FIFO: consume oldest buy lots first
    while (remainingToSell > 0 && position.buyLots.length > 0) {
      const lot = position.buyLots[0];

      if (lot.tokenAmount <= remainingToSell) {
        // Consume entire lot
        totalCostBasis += lot.costBasisSol;
        remainingToSell -= lot.tokenAmount;
        position.buyLots.shift(); // Remove lot
      } else {
        // Partial lot consumption
        const portionSold = remainingToSell / lot.tokenAmount;
        const costBasis = lot.costBasisSol * portionSold;
        totalCostBasis += costBasis;

        // Update remaining lot
        lot.tokenAmount -= remainingToSell;
        lot.costBasisSol -= costBasis;
        remainingToSell = 0;
      }
    }

    // Handle case where sold more than bought (shouldn't happen but be safe)
    if (remainingToSell > 0) {
      console.warn(
        `Sold more than bought for ${position.tokenSymbol}: remaining=${remainingToSell}`
      );
      // Use current price as cost basis for excess
      totalCostBasis += remainingToSell * tx.priceSol;
    }

    // Calculate realized P&L (subtract fee from proceeds)
    const proceeds = tx.solAmount - tx.feeSol;
    const realizedPnl = proceeds - totalCostBasis;

    // Store P&L on the trade for daily tracking
    tx.realizedPnl = realizedPnl;
    tx.costBasis = totalCostBasis;

    // Update position
    position.realizedPNL += realizedPnl;
    position.solReceived += tx.solAmount;
    position.tokensSold += tx.tokenAmount;
  }

  /**
   * Process TRANSFER_IN transaction
   */
  static processTransferIn(position, tx) {
    // Treat as a buy at current market price (estimated)
    const estimatedCost = tx.tokenAmount * tx.priceSol;

    position.buyLots.push({
      tokenAmount: tx.tokenAmount,
      costBasisSol: estimatedCost,
      costPerToken: tx.priceSol,
      date: tx.blockTime
    });

    position.solSpent += estimatedCost;
    position.tokensBought += tx.tokenAmount;
    position.metadata.hasEstimatedTransfers = true;
    position.metadata.transferCount++;
  }

  /**
   * Process TRANSFER_OUT transaction
   */
  static async processTransferOut(position, tx) {
    // Get current price for estimation
    let currentPrice = tx.priceSol;
    if (currentPrice === 0) {
      currentPrice = await PriceOracle.getCurrentTokenPrice(tx.tokenMint);
    }

    const estimatedValue = tx.tokenAmount * currentPrice;

    // Use FIFO to calculate cost basis (same as sell)
    let remainingToTransfer = tx.tokenAmount;
    let totalCostBasis = 0;

    while (remainingToTransfer > 0 && position.buyLots.length > 0) {
      const lot = position.buyLots[0];

      if (lot.tokenAmount <= remainingToTransfer) {
        totalCostBasis += lot.costBasisSol;
        remainingToTransfer -= lot.tokenAmount;
        position.buyLots.shift();
      } else {
        const portionSold = remainingToTransfer / lot.tokenAmount;
        const costBasis = lot.costBasisSol * portionSold;
        totalCostBasis += costBasis;

        lot.tokenAmount -= remainingToTransfer;
        lot.costBasisSol -= costBasis;
        remainingToTransfer = 0;
      }
    }

    // Calculate estimated realized P&L
    const estimatedPnl = estimatedValue - totalCostBasis;

    // Update position
    position.realizedPNL += estimatedPnl;
    position.solReceived += estimatedValue;
    position.tokensSold += tx.tokenAmount;
    position.metadata.hasEstimatedTransfers = true;
    position.metadata.transferCount++;
  }

  /**
   * Calculate unrealized P&L for all active positions
   */
  static async calculateUnrealizedPNL(positions) {
    const activeMints = Object.keys(positions).filter(
      mint => positions[mint].isActive
    );

    if (activeMints.length === 0) return;

    console.log(`Calculating unrealized P&L for ${activeMints.length} active positions`);

    // Batch fetch current prices
    const prices = await PriceOracle.getBatchPrices(activeMints);

    for (const mint of activeMints) {
      const position = positions[mint];
      const currentPrice = prices[mint] || 0;

      // Remaining cost basis from unsold lots
      const remainingCostBasis = position.buyLots.reduce(
        (sum, lot) => sum + lot.costBasisSol,
        0
      );

      if (currentPrice > 0 && position.currentBalance > 0) {
        position.currentPriceSol = currentPrice;
        position.currentValueSol = position.currentBalance * currentPrice;
        position.unrealizedPNL = position.currentValueSol - remainingCostBasis;
      } else if (position.currentBalance > 0 && remainingCostBasis > 0) {
        // Price unavailable but we have tokens with cost basis
        // Treat as unrealized loss equal to cost basis (conservative: assume worthless)
        position.currentPriceSol = 0;
        position.currentValueSol = 0;
        position.unrealizedPNL = -remainingCostBasis; // Negative = loss
      }
    }
  }

  /**
   * Update daily P&L aggregates
   */
  static updateDailyPNL(dailyPNL, tx) {
    const date = tx.blockTime.toISOString().split('T')[0]; // YYYY-MM-DD

    if (!dailyPNL[date]) {
      dailyPNL[date] = {
        date,
        realizedPNLSol: 0,
        transactionCount: 0,
        tokensTraded: new Set()
      };
    }

    // Only count sells/transfers for daily P&L
    if (tx.type === 'SELL' || tx.type === 'TRANSFER_OUT') {
      // This is simplified - actual realized PNL is calculated in processSell
      // We'll need to pass the calculated PNL from there
      dailyPNL[date].transactionCount++;
      dailyPNL[date].tokensTraded.add(tx.tokenMint);
    }
  }

  /**
   * Calculate summary statistics
   * Uses Net SOL Flow as primary P&L (matches GMGN), FIFO as fallback
   */
  static calculateSummary(positions, netSolFlowPNL = null) {
    // FIFO-based P&L (per-token aggregation - used as fallback)
    let fifoRealizedPNL = 0;
    let fifoUnrealizedPNL = 0;
    let activePositions = 0;
    let closedPositions = 0;
    let profitablePositions = 0;
    let totalPositions = 0;

    for (const mint in positions) {
      const pos = positions[mint];
      totalPositions++;

      fifoRealizedPNL += pos.realizedPNL;
      fifoUnrealizedPNL += pos.unrealizedPNL;

      if (pos.isActive) {
        activePositions++;
      } else {
        closedPositions++;
        if (pos.realizedPNL > 0) {
          profitablePositions++;
        }
      }
    }

    const winRate = closedPositions > 0
      ? (profitablePositions / closedPositions) * 100
      : 0;

    // Use Net SOL Flow as primary (more accurate for overall P&L)
    // Fall back to FIFO if Net SOL Flow not available
    const totalRealizedPNL = netSolFlowPNL ? netSolFlowPNL.realizedPNL : fifoRealizedPNL;
    const totalUnrealizedPNL = netSolFlowPNL ? netSolFlowPNL.unrealizedPNL : fifoUnrealizedPNL;
    const totalPNL = netSolFlowPNL ? netSolFlowPNL.totalPNL : (fifoRealizedPNL + fifoUnrealizedPNL);

    return {
      // Primary P&L values (Net SOL Flow method)
      totalRealizedPNL,
      totalUnrealizedPNL,
      totalPNL,
      // FIFO values preserved for per-token analysis
      fifoRealizedPNL,
      fifoUnrealizedPNL,
      fifoTotalPNL: fifoRealizedPNL + fifoUnrealizedPNL,
      // Position counts
      activePositions,
      closedPositions,
      totalPositions,
      profitablePositions,
      winRate: Math.round(winRate * 100) / 100, // Round to 2 decimals
      // Method indicator
      pnlMethod: netSolFlowPNL ? 'NET_SOL_FLOW' : 'FIFO'
    };
  }

  /**
   * Detect MEV/sandwich attacks
   */
  static detectMEV(transactions) {
    const bundles = [];

    for (let i = 0; i < transactions.length - 2; i++) {
      const t1 = transactions[i];
      const t2 = transactions[i + 1];
      const t3 = transactions[i + 2];

      // Same token, same block, buy-sell-buy or sell-buy-sell pattern
      if (
        t1.tokenMint === t2.tokenMint &&
        t2.tokenMint === t3.tokenMint &&
        t1.blockTime.getTime() === t2.blockTime.getTime() &&
        t2.blockTime.getTime() === t3.blockTime.getTime()
      ) {
        const pattern = `${t1.type}-${t2.type}-${t3.type}`;

        if (
          pattern === 'BUY-SELL-BUY' ||
          pattern === 'SELL-BUY-SELL'
        ) {
          bundles.push({
            transactions: [t1.signature, t2.signature, t3.signature],
            type: 'POTENTIAL_MEV',
            pattern
          });
        }
      }
    }

    return bundles;
  }
}

module.exports = PNLCalculator;
