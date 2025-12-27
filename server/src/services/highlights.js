const PriceOracle = require('./priceOracle');
const DatabaseQueries = require('../database/queries');

/**
 * Highlights Generator - Creates 6 key trading performance metrics
 *
 * VERSION HISTORY:
 * v1 - Initial 12 highlights
 * v2 - Reduced to 6 key highlights with pre-formatted values
 * v3 - Added fallbacks for all highlights, changed Overall P&L to total (realized+unrealized)
 */
const HIGHLIGHTS_VERSION = 3;

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
    highlights.push(await this.bestProfitDay(positions, transactions, solPriceUSD));

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
      valuePrimary: this.formatUsd(pnlUsd),
      valueSecondary: `(${this.formatSol(pnlSol)} SOL)`,
      metadata: {
        pnlSol: this.roundSol(pnlSol),
        pnlUsd: this.roundUsd(pnlUsd),
        realizedPnlSol: this.roundSol(summary.totalRealizedPNL),
        unrealizedPnlSol: this.roundSol(summary.totalUnrealizedPNL),
        isProfit: pnlSol >= 0,
        closedPositions: summary.closedPositions,
        activePositions: summary.activePositions
      }
    };
  }

  /**
   * 2. Biggest Win - Token with highest realized P&L
   */
  static async biggestWin(positions, solPriceUSD) {
    const winner = Object.values(positions)
      .filter(p => p.realizedPNL > 0)
      .sort((a, b) => b.realizedPNL - a.realizedPNL)[0];

    // Fallback if no winning trades
    if (!winner) {
      return {
        type: 'biggest_win',
        title: 'Biggest Win',
        description: 'No profitable trades yet - your first win is coming!',
        valuePrimary: '$0',
        valueSecondary: '(0 SOL)',
        metadata: {
          tokenSymbol: null,
          tokenMint: null,
          pnlSol: 0,
          pnlUsd: 0,
          noData: true
        }
      };
    }

    const pnlSol = winner.realizedPNL;
    const pnlUsd = pnlSol * solPriceUSD;

    return {
      type: 'biggest_win',
      title: 'Biggest Win',
      description: `Your most profitable token was ${winner.tokenSymbol}`,
      valuePrimary: this.formatUsd(pnlUsd),
      valueSecondary: `(${this.formatSol(pnlSol)} SOL)`,
      metadata: {
        tokenSymbol: winner.tokenSymbol,
        tokenMint: winner.tokenMint,
        pnlSol: this.roundSol(pnlSol),
        pnlUsd: this.roundUsd(pnlUsd)
      }
    };
  }

  /**
   * 3. Biggest Loss - Token with most negative realized P&L
   */
  static async biggestLoss(positions, solPriceUSD) {
    const loser = Object.values(positions)
      .filter(p => p.realizedPNL < 0)
      .sort((a, b) => a.realizedPNL - b.realizedPNL)[0];

    // Fallback if no losing trades
    if (!loser) {
      return {
        type: 'biggest_loss',
        title: 'Biggest Loss',
        description: 'No losses yet - keep up the winning streak!',
        valuePrimary: '$0',
        valueSecondary: '(0 SOL)',
        metadata: {
          tokenSymbol: null,
          tokenMint: null,
          pnlSol: 0,
          pnlUsd: 0,
          noData: true
        }
      };
    }

    const pnlSol = loser.realizedPNL; // Keep negative
    const pnlUsd = pnlSol * solPriceUSD;

    return {
      type: 'biggest_loss',
      title: 'Biggest Loss',
      description: `Your biggest loss was on ${loser.tokenSymbol}`,
      valuePrimary: this.formatUsd(pnlUsd),
      valueSecondary: `(${this.formatSol(pnlSol)} SOL)`,
      metadata: {
        tokenSymbol: loser.tokenSymbol,
        tokenMint: loser.tokenMint,
        pnlSol: this.roundSol(pnlSol),
        pnlUsd: this.roundUsd(pnlUsd)
      }
    };
  }

  /**
   * 4. Win Rate - Percentage of profitable closed positions
   */
  static async winRate(summary) {
    // Fallback if no closed positions
    if (summary.closedPositions === 0) {
      return {
        type: 'win_rate',
        title: 'Win Rate',
        description: 'No completed trades yet - close a position to see your win rate',
        valuePrimary: '0%',
        valueSecondary: '0/0 wins',
        metadata: {
          winRate: 0,
          profitablePositions: 0,
          closedPositions: 0,
          grade: 'N/A',
          noData: true
        }
      };
    }

    return {
      type: 'win_rate',
      title: 'Win Rate',
      description: `${summary.winRate}% of your trades were profitable`,
      valuePrimary: `${summary.winRate}%`,
      valueSecondary: `${summary.profitablePositions}/${summary.closedPositions} wins`,
      metadata: {
        winRate: summary.winRate,
        profitablePositions: summary.profitablePositions,
        closedPositions: summary.closedPositions,
        grade: this.getWinRateGrade(summary.winRate)
      }
    };
  }

  /**
   * 5. Longest Hold - Token held longest before any sell
   */
  static async longestHold(positions, transactions) {
    let longestHold = null;
    let maxDays = 0;

    for (const position of Object.values(positions)) {
      if (!position.trades || position.trades.length < 2) continue;

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
        valuePrimary: '0 days',
        valueSecondary: 'N/A',
        metadata: {
          tokenSymbol: null,
          tokenMint: null,
          holdDays: 0,
          buyDate: null,
          sellDate: null,
          noData: true
        }
      };
    }

    return {
      type: 'longest_hold',
      title: 'Diamond Hands',
      description: `You held ${longestHold.position.tokenSymbol} for ${maxDays} days before selling`,
      valuePrimary: `${maxDays} days`,
      valueSecondary: longestHold.position.tokenSymbol,
      metadata: {
        tokenSymbol: longestHold.position.tokenSymbol,
        tokenMint: longestHold.position.tokenMint,
        holdDays: maxDays,
        buyDate: longestHold.buyDate.toISOString(),
        sellDate: longestHold.sellDate.toISOString()
      }
    };
  }

  /**
   * 6. Best Profit Day - Most profit made in a single day
   */
  static async bestProfitDay(positions, transactions, solPriceUSD) {
    // Group sells by day and calculate daily profit using FIFO-calculated realizedPnl
    const dailyProfit = {};

    for (const position of Object.values(positions)) {
      if (!position.trades) continue;

      for (const trade of position.trades) {
        // Only count sells that have realized P&L calculated
        if (trade.type !== 'SELL') continue;

        const date = new Date(trade.blockTime).toISOString().split('T')[0];

        if (!dailyProfit[date]) {
          dailyProfit[date] = {
            profitSol: 0,
            tokens: new Set()
          };
        }

        // Use the FIFO-calculated realizedPnl from the trade
        const profit = trade.realizedPnl || 0;

        if (profit > 0) {
          dailyProfit[date].profitSol += profit;
          dailyProfit[date].tokens.add(position.tokenSymbol);
        }
      }
    }

    // Find the best day
    let bestDay = null;
    let maxProfit = 0;

    for (const [date, data] of Object.entries(dailyProfit)) {
      if (data.profitSol > maxProfit) {
        maxProfit = data.profitSol;
        bestDay = {
          date,
          profitSol: data.profitSol,
          tokens: Array.from(data.tokens)
        };
      }
    }

    // Fallback if no profitable days
    if (!bestDay || maxProfit <= 0) {
      return {
        type: 'best_profit_day',
        title: 'Best Day',
        description: 'No profitable days yet - your best day is ahead!',
        valuePrimary: '$0',
        valueSecondary: '(0 SOL)',
        metadata: {
          date: null,
          profitSol: 0,
          profitUsd: 0,
          tokens: '',
          noData: true
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
      valuePrimary: this.formatUsd(profitUsd),
      valueSecondary: `(${this.formatSol(bestDay.profitSol)} SOL)`,
      metadata: {
        date: bestDay.date,
        profitSol: this.roundSol(bestDay.profitSol),
        profitUsd: this.roundUsd(profitUsd),
        tokens: bestDay.tokens.join(', ')
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
   * Helper: Round SOL to 4 decimals
   */
  static roundSol(value) {
    return Math.round(value * 10000) / 10000;
  }

  /**
   * Helper: Round USD to 2 decimals
   */
  static roundUsd(value) {
    return Math.round(value * 100) / 100;
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
