const PriceOracle = require('./priceOracle');
const DatabaseQueries = require('../database/queries');

/**
 * Highlights Generator - Creates 6 key trading performance metrics
 *
 * VERSION HISTORY:
 * v1 - Initial 12 highlights
 * v2 - Reduced to 6 key highlights with pre-formatted values
 * v3 - Added fallbacks for all highlights, changed Overall P&L to total (realized+unrealized)
 * v4 - Excluded stablecoins from biggest win/loss calculations
 * v5 - Changed decimal precision from 2-4 decimals to 1 decimal place for all values
 * v6 - Updated best profit day fallback message to "Never a profitable day? Sheesh!"
 * v7 - Fixed best profit day calculation to use dailyPNL aggregates instead of position.trades
 * v8 - Temporarily used total P&L (reverted)
 * v9 - Use REALIZED P&L only for Win/Loss/WinRate (matches GMGN.ai) + PumpFun accountData fix
 */
const HIGHLIGHTS_VERSION = 9;

// Stablecoins and wrapped tokens to exclude from win/loss calculations
// These are used for swapping, not trading
const EXCLUDED_TOKENS = new Set([
  // USDC variants
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC (native)
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
  // Wrapped SOL
  'So11111111111111111111111111111111111111112',   // Wrapped SOL
]);

// Also exclude by symbol as a fallback
const EXCLUDED_SYMBOLS = new Set([
  'USDC', 'USDT', 'BUSD', 'DAI', 'USDH', 'UXD', 'USDR', 'PAI',
  'WSOL', 'wSOL'
]);

class HighlightsGenerator {
  /**
   * Get current highlights version
   */
  static getVersion() {
    return HIGHLIGHTS_VERSION;
  }
  /**
   * Generate all highlights for a wallet
   * @param {Object} positions - Token positions map
   * @param {Array} transactions - All transactions
   * @param {Object} dailyPNL - Daily P&L aggregates
   * @param {Object} summary - Summary statistics
   * @returns {Array} Array of highlight objects
   */
  static async generate(positions, transactions, dailyPNL, summary) {
    console.log('Generating highlights...');

    const highlights = [];

    // Get SOL price for USD conversion
    const solPriceUSD = await PriceOracle.getSolPriceUSD();

    // Generate the 6 key highlights (all have fallbacks, none will be null)
    highlights.push(await this.overallPNL(summary, solPriceUSD));
    highlights.push(await this.biggestWin(positions, solPriceUSD));
    highlights.push(await this.biggestLoss(positions, solPriceUSD));
    highlights.push(await this.winRate(summary));
    highlights.push(await this.longestHold(positions, transactions));
    highlights.push(await this.bestProfitDay(dailyPNL, solPriceUSD));

    // Add rank and version to each highlight (1-6)
    const rankedHighlights = highlights.map((h, index) => ({
      ...h,
      rank: index + 1,
      metadata: {
        ...h.metadata,
        highlightsVersion: HIGHLIGHTS_VERSION
      }
    }));

    console.log(`Generated ${rankedHighlights.length} highlights (v${HIGHLIGHTS_VERSION})`);
    return rankedHighlights;
  }

  /**
   * 1. Overall PNL this year - Total P&L (realized + unrealized) with USD and SOL
   */
  static async overallPNL(summary, solPriceUSD) {
    const pnlSol = summary.totalPNL; // Realized + Unrealized
    const pnlUsd = pnlSol * solPriceUSD;

    return {
      type: 'overall_pnl',
      title: 'Overall P&L',
      description: `Your total profit/loss (realized + unrealized)`,
      valuePrimary: this.roundUsd(pnlUsd), // Numeric value for database
      valueSecondary: this.roundSol(pnlSol), // Numeric value for database
      metadata: {
        pnlSol: this.roundSol(pnlSol),
        pnlUsd: this.roundUsd(pnlUsd),
        realizedPnlSol: this.roundSol(summary.totalRealizedPNL),
        unrealizedPnlSol: this.roundSol(summary.totalUnrealizedPNL),
        isProfit: pnlSol >= 0,
        closedPositions: summary.closedPositions,
        activePositions: summary.activePositions,
        formattedPrimary: this.formatUsd(pnlUsd), // Formatted string for display
        formattedSecondary: `(${this.formatSol(pnlSol)} SOL)`
      }
    };
  }

  /**
   * Helper: Check if a token should be excluded from win/loss calculations
   */
  static isExcludedToken(position) {
    if (EXCLUDED_TOKENS.has(position.tokenMint)) return true;
    if (EXCLUDED_SYMBOLS.has(position.tokenSymbol?.toUpperCase())) return true;
    return false;
  }

  /**
   * 2. Biggest Win - Token with highest REALIZED P&L (excluding stablecoins)
   * This shows actual profits from closed trades, not paper gains
   */
  static async biggestWin(positions, solPriceUSD) {
    const winner = Object.values(positions)
      .filter(p => p.realizedPNL > 0 && !this.isExcludedToken(p))
      .sort((a, b) => b.realizedPNL - a.realizedPNL)[0];

    // Fallback if no winning trades
    if (!winner) {
      return {
        type: 'biggest_win',
        title: 'Biggest Win',
        description: 'No profitable trades yet - your first win is coming!',
        valuePrimary: 0, // Numeric value
        valueSecondary: 0, // Numeric value
        metadata: {
          tokenSymbol: null,
          tokenMint: null,
          pnlSol: 0,
          pnlUsd: 0,
          noData: true,
          formattedPrimary: '$0',
          formattedSecondary: '(0 SOL)'
        }
      };
    }

    const pnlSol = winner.realizedPNL;
    const pnlUsd = pnlSol * solPriceUSD;

    return {
      type: 'biggest_win',
      title: 'Biggest Win',
      description: `Your most profitable token was ${winner.tokenSymbol}`,
      valuePrimary: this.roundUsd(pnlUsd), // Numeric value
      valueSecondary: this.roundSol(pnlSol), // Numeric value
      metadata: {
        tokenSymbol: winner.tokenSymbol,
        tokenMint: winner.tokenMint,
        pnlSol: this.roundSol(pnlSol),
        pnlUsd: this.roundUsd(pnlUsd),
        formattedPrimary: this.formatUsd(pnlUsd),
        formattedSecondary: `(${this.formatSol(pnlSol)} SOL)`
      }
    };
  }

  /**
   * 3. Biggest Loss - Token with most negative REALIZED P&L (excluding stablecoins)
   * This shows actual losses from closed trades, not paper losses
   */
  static async biggestLoss(positions, solPriceUSD) {
    const loser = Object.values(positions)
      .filter(p => p.realizedPNL < 0 && !this.isExcludedToken(p))
      .sort((a, b) => a.realizedPNL - b.realizedPNL)[0];

    // Fallback if no losing trades
    if (!loser) {
      return {
        type: 'biggest_loss',
        title: 'Biggest Loss',
        description: 'No losses yet - keep up the winning streak!',
        valuePrimary: 0, // Numeric value
        valueSecondary: 0, // Numeric value
        metadata: {
          tokenSymbol: null,
          tokenMint: null,
          pnlSol: 0,
          pnlUsd: 0,
          noData: true,
          formattedPrimary: '$0',
          formattedSecondary: '(0 SOL)'
        }
      };
    }

    const pnlSol = loser.realizedPNL; // Keep negative
    const pnlUsd = pnlSol * solPriceUSD;

    return {
      type: 'biggest_loss',
      title: 'Biggest Loss',
      description: `Your biggest loss was on ${loser.tokenSymbol}`,
      valuePrimary: this.roundUsd(pnlUsd), // Numeric value
      valueSecondary: this.roundSol(pnlSol), // Numeric value
      metadata: {
        tokenSymbol: loser.tokenSymbol,
        tokenMint: loser.tokenMint,
        pnlSol: this.roundSol(pnlSol),
        pnlUsd: this.roundUsd(pnlUsd),
        formattedPrimary: this.formatUsd(pnlUsd),
        formattedSecondary: `(${this.formatSol(pnlSol)} SOL)`
      }
    };
  }

  /**
   * 4. Win Rate - Percentage of profitable CLOSED positions (realized P&L > 0)
   * This matches GMGN.ai's approach - only counting completed trades, not active holdings
   */
  static async winRate(summary) {
    // Fallback if no closed positions
    if (summary.closedPositions === 0) {
      return {
        type: 'win_rate',
        title: 'Win Rate',
        description: 'No completed trades yet - close a position to see your win rate',
        valuePrimary: 0, // Numeric value
        valueSecondary: 0, // Numeric value
        metadata: {
          winRate: 0,
          profitablePositions: 0,
          closedPositions: 0,
          grade: 'N/A',
          noData: true,
          formattedPrimary: '0%',
          formattedSecondary: '0/0 wins'
        }
      };
    }

    const winRateValue = this.roundUsd(summary.winRate); // Round to 1 decimal place

    return {
      type: 'win_rate',
      title: 'Win Rate',
      description: `${winRateValue}% of your closed trades were profitable`,
      valuePrimary: winRateValue, // Numeric value (percentage as number, 1 DP)
      valueSecondary: summary.profitablePositions, // Numeric value (count)
      metadata: {
        winRate: winRateValue,
        profitablePositions: summary.profitablePositions,
        closedPositions: summary.closedPositions,
        grade: this.getWinRateGrade(winRateValue),
        formattedPrimary: `${winRateValue}%`,
        formattedSecondary: `${summary.profitablePositions}/${summary.closedPositions} wins`
      }
    };
  }

  /**
   * 5. Longest Hold - Token held longest before any sell (excluding stablecoins)
   */
  static async longestHold(positions, transactions) {
    let longestHold = null;
    let maxDays = 0;

    for (const position of Object.values(positions)) {
      if (!position.trades || position.trades.length < 2) continue;
      if (this.isExcludedToken(position)) continue; // Skip stablecoins

      // Sort trades by time
      const trades = position.trades.sort((a, b) =>
        new Date(a.blockTime) - new Date(b.blockTime)
      );

      // Find first buy and first sell
      const firstBuy = trades.find(t => t.type === 'BUY');
      const firstSell = trades.find(t => t.type === 'SELL');

      if (firstBuy && firstSell) {
        const buyDate = new Date(firstBuy.blockTime);
        const sellDate = new Date(firstSell.blockTime);
        const holdDays = Math.floor((sellDate - buyDate) / (1000 * 60 * 60 * 24));

        if (holdDays > maxDays) {
          maxDays = holdDays;
          longestHold = {
            position,
            holdDays,
            buyDate,
            sellDate
          };
        }
      }
    }

    // Fallback if no completed holds found
    if (!longestHold || maxDays === 0) {
      return {
        type: 'longest_hold',
        title: 'Diamond Hands',
        description: 'No completed holds yet - keep holding!',
        valuePrimary: 0, // Numeric value (days)
        valueSecondary: 0, // Numeric value
        metadata: {
          tokenSymbol: null,
          tokenMint: null,
          holdDays: 0,
          buyDate: null,
          sellDate: null,
          noData: true,
          formattedPrimary: '0 days',
          formattedSecondary: 'N/A'
        }
      };
    }

    return {
      type: 'longest_hold',
      title: 'Diamond Hands',
      description: `You held ${longestHold.position.tokenSymbol} for ${maxDays} days before selling`,
      valuePrimary: maxDays, // Numeric value (days)
      valueSecondary: maxDays, // Numeric value (also days, for consistency)
      metadata: {
        tokenSymbol: longestHold.position.tokenSymbol,
        tokenMint: longestHold.position.tokenMint,
        holdDays: maxDays,
        buyDate: longestHold.buyDate.toISOString(),
        sellDate: longestHold.sellDate.toISOString(),
        formattedPrimary: `${maxDays} days`,
        formattedSecondary: longestHold.position.tokenSymbol
      }
    };
  }

  /**
   * 6. Best Profit Day - Most profit made in a single day
   * Uses the dailyPNL aggregates from the database
   */
  static async bestProfitDay(dailyPNL, solPriceUSD) {
    // Find the day with the highest realized P&L
    let bestDay = null;
    let maxProfit = 0;

    for (const [date, data] of Object.entries(dailyPNL)) {
      const profitSol = data.realizedPNLSol || 0;

      // Only consider profitable days
      if (profitSol > maxProfit) {
        maxProfit = profitSol;
        bestDay = {
          date,
          profitSol
        };
      }
    }

    // Fallback if no profitable days
    if (!bestDay || maxProfit <= 0) {
      return {
        type: 'best_profit_day',
        title: 'Best Day',
        description: 'Never a profitable day? Sheesh!',
        valuePrimary: 0, // Numeric value
        valueSecondary: 0, // Numeric value
        metadata: {
          date: null,
          profitSol: 0,
          profitUsd: 0,
          noData: true,
          formattedPrimary: '$0',
          formattedSecondary: '(0 SOL)'
        }
      };
    }

    const profitUsd = bestDay.profitSol * solPriceUSD;
    const formattedDate = new Date(bestDay.date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });

    return {
      type: 'best_profit_day',
      title: 'Best Day',
      description: `Your most profitable day was ${formattedDate}`,
      valuePrimary: this.roundUsd(profitUsd), // Numeric value
      valueSecondary: this.roundSol(bestDay.profitSol), // Numeric value
      metadata: {
        date: bestDay.date,
        profitSol: this.roundSol(bestDay.profitSol),
        profitUsd: this.roundUsd(profitUsd),
        formattedPrimary: this.formatUsd(profitUsd),
        formattedSecondary: `(${this.formatSol(bestDay.profitSol)} SOL)`
      }
    };
  }

  /**
   * Helper: Format USD with $ and sign
   */
  static formatUsd(value) {
    const sign = value >= 0 ? '+' : '-';
    return `${sign}$${Math.abs(this.roundUsd(value)).toLocaleString()}`;
  }

  /**
   * Helper: Format SOL with sign
   */
  static formatSol(value) {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${this.roundSol(value)}`;
  }

  /**
   * Helper: Round SOL to 1 decimal place
   */
  static roundSol(value) {
    return Math.round(value * 10) / 10;
  }

  /**
   * Helper: Round USD to 1 decimal place
   */
  static roundUsd(value) {
    return Math.round(value * 10) / 10;
  }

  /**
   * Helper: Get win rate grade
   */
  static getWinRateGrade(winRate) {
    if (winRate >= 80) return 'S';
    if (winRate >= 70) return 'A';
    if (winRate >= 60) return 'B';
    if (winRate >= 50) return 'C';
    if (winRate >= 40) return 'D';
    return 'F';
  }

  /**
   * Save highlights to database
   */
  static async saveHighlights(walletAddress, highlights) {
    for (const highlight of highlights) {
      await DatabaseQueries.upsertHighlight(walletAddress, highlight);
    }
    console.log(`Saved ${highlights.length} highlights for ${walletAddress}`);
  }
}

module.exports = HighlightsGenerator;
