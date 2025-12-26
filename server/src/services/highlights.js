const PriceOracle = require('./priceOracle');
const DatabaseQueries = require('../database/queries');

/**
 * Highlights Generator - Creates shareable achievement cards
 * Generates 10-12 highlight types showcasing trading performance
 */
class HighlightsGenerator {
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

    // Generate all highlight types
    highlights.push(await this.biggestRealizedWin(positions, solPriceUSD));
    highlights.push(await this.biggestRealizedLoss(positions, solPriceUSD));
    highlights.push(await this.bestUnrealizedGain(positions, solPriceUSD));
    highlights.push(await this.worstUnrealizedLoss(positions, solPriceUSD));
    highlights.push(await this.bestSingleTrade(positions, solPriceUSD));
    highlights.push(await this.mostTradedToken(positions, solPriceUSD));
    highlights.push(await this.diamondHands(positions, solPriceUSD));
    highlights.push(await this.paperHands(positions, solPriceUSD));
    highlights.push(await this.totalRealizedPNL(summary, solPriceUSD));
    highlights.push(await this.totalUnrealizedPNL(summary, solPriceUSD));
    highlights.push(await this.winRate(summary));
    highlights.push(await this.bestMonth(dailyPNL, solPriceUSD));

    // Filter out null highlights and add rank
    const validHighlights = highlights
      .filter(h => h !== null)
      .map((h, index) => ({
        ...h,
        rank: index + 1
      }));

    console.log(`Generated ${validHighlights.length} highlights`);
    return validHighlights;
  }

  /**
   * 1. Biggest Realized Win - Token with highest realized P&L
   */
  static async biggestRealizedWin(positions, solPriceUSD) {
    const winner = Object.values(positions)
      .filter(p => p.realizedPNL > 0)
      .sort((a, b) => b.realizedPNL - a.realizedPNL)[0];

    if (!winner) return null;

    return {
      type: 'biggest_realized_win',
      title: 'Biggest Win 🚀',
      description: `${winner.tokenSymbol} was your most profitable token`,
      valuePrimary: this.roundSol(winner.realizedPNL),
      valueSecondary: this.roundUsd(winner.realizedPNL * solPriceUSD),
      metadata: {
        tokenSymbol: winner.tokenSymbol,
        tokenMint: winner.tokenMint,
        tradesCount: winner.trades?.length || 0,
        profitPercent: winner.solSpent > 0
          ? Math.round((winner.realizedPNL / winner.solSpent) * 100)
          : 0
      }
    };
  }

  /**
   * 2. Biggest Realized Loss - Most negative P&L token
   */
  static async biggestRealizedLoss(positions, solPriceUSD) {
    const loser = Object.values(positions)
      .filter(p => p.realizedPNL < 0)
      .sort((a, b) => a.realizedPNL - b.realizedPNL)[0];

    if (!loser) return null;

    return {
      type: 'biggest_realized_loss',
      title: 'Biggest Loss 📉',
      description: `${loser.tokenSymbol} was your most costly mistake`,
      valuePrimary: this.roundSol(Math.abs(loser.realizedPNL)),
      valueSecondary: this.roundUsd(Math.abs(loser.realizedPNL) * solPriceUSD),
      metadata: {
        tokenSymbol: loser.tokenSymbol,
        tokenMint: loser.tokenMint,
        tradesCount: loser.trades?.length || 0,
        lossPercent: loser.solSpent > 0
          ? Math.round((Math.abs(loser.realizedPNL) / loser.solSpent) * 100)
          : 0
      }
    };
  }

  /**
   * 3. Best Unrealized Gain - Current holding with highest unrealized profit
   */
  static async bestUnrealizedGain(positions, solPriceUSD) {
    const best = Object.values(positions)
      .filter(p => p.isActive && p.unrealizedPNL > 0)
      .sort((a, b) => b.unrealizedPNL - a.unrealizedPNL)[0];

    if (!best) return null;

    return {
      type: 'best_unrealized_gain',
      title: 'Best Hold 💎',
      description: `Still holding ${best.tokenSymbol} with unrealized gains`,
      valuePrimary: this.roundSol(best.unrealizedPNL),
      valueSecondary: this.roundUsd(best.unrealizedPNL * solPriceUSD),
      metadata: {
        tokenSymbol: best.tokenSymbol,
        tokenMint: best.tokenMint,
        currentBalance: best.currentBalance,
        currentValue: this.roundSol(best.currentValueSol),
        profitPercent: best.buyLots.reduce((sum, lot) => sum + lot.costBasisSol, 0) > 0
          ? Math.round((best.unrealizedPNL / best.buyLots.reduce((sum, lot) => sum + lot.costBasisSol, 0)) * 100)
          : 0
      }
    };
  }

  /**
   * 4. Worst Unrealized Loss - Current holding with most unrealized loss
   */
  static async worstUnrealizedLoss(positions, solPriceUSD) {
    const worst = Object.values(positions)
      .filter(p => p.isActive && p.unrealizedPNL < 0)
      .sort((a, b) => a.unrealizedPNL - b.unrealizedPNL)[0];

    if (!worst) return null;

    return {
      type: 'worst_unrealized_loss',
      title: 'Bag Holder 💼',
      description: `Holding ${worst.tokenSymbol} at a loss`,
      valuePrimary: this.roundSol(Math.abs(worst.unrealizedPNL)),
      valueSecondary: this.roundUsd(Math.abs(worst.unrealizedPNL) * solPriceUSD),
      metadata: {
        tokenSymbol: worst.tokenSymbol,
        tokenMint: worst.tokenMint,
        currentBalance: worst.currentBalance,
        currentValue: this.roundSol(worst.currentValueSol),
        lossPercent: worst.buyLots.reduce((sum, lot) => sum + lot.costBasisSol, 0) > 0
          ? Math.round((Math.abs(worst.unrealizedPNL) / worst.buyLots.reduce((sum, lot) => sum + lot.costBasisSol, 0)) * 100)
          : 0
      }
    };
  }

  /**
   * 5. Best Single Trade - Highest return on single buy→sell sequence
   */
  static async bestSingleTrade(positions, solPriceUSD) {
    let bestTrade = null;
    let bestReturn = 0;

    for (const position of Object.values(positions)) {
      if (!position.trades || position.trades.length < 2) continue;

      // Find buy-sell pairs
      const trades = position.trades.sort((a, b) => new Date(a.blockTime) - new Date(b.blockTime));

      for (let i = 0; i < trades.length - 1; i++) {
        const buy = trades[i];
        const sell = trades[i + 1];

        if (buy.type === 'BUY' && sell.type === 'SELL') {
          const invested = buy.solAmount + buy.feeSol;
          const returned = sell.solAmount - sell.feeSol;
          const profit = returned - invested;
          const returnPercent = (profit / invested) * 100;

          if (returnPercent > bestReturn) {
            bestReturn = returnPercent;
            bestTrade = {
              position,
              buy,
              sell,
              profit,
              returnPercent
            };
          }
        }
      }
    }

    if (!bestTrade) return null;

    return {
      type: 'best_single_trade',
      title: 'Best Trade 🎯',
      description: `Perfect timing on ${bestTrade.position.tokenSymbol}`,
      valuePrimary: this.roundSol(bestTrade.profit),
      valueSecondary: this.roundUsd(bestTrade.profit * solPriceUSD),
      metadata: {
        tokenSymbol: bestTrade.position.tokenSymbol,
        tokenMint: bestTrade.position.tokenMint,
        returnPercent: Math.round(bestTrade.returnPercent),
        buyDate: bestTrade.buy.blockTime,
        sellDate: bestTrade.sell.blockTime,
        holdDuration: this.calculateHoldDuration(bestTrade.buy.blockTime, bestTrade.sell.blockTime)
      }
    };
  }

  /**
   * 6. Most Traded Token - Token with most transactions
   */
  static async mostTradedToken(positions, solPriceUSD) {
    const mostTraded = Object.values(positions)
      .sort((a, b) => (b.trades?.length || 0) - (a.trades?.length || 0))[0];

    if (!mostTraded || !mostTraded.trades || mostTraded.trades.length === 0) return null;

    return {
      type: 'most_traded_token',
      title: 'Most Active 📊',
      description: `You traded ${mostTraded.tokenSymbol} the most`,
      valuePrimary: mostTraded.trades.length,
      valueSecondary: this.roundSol(mostTraded.solSpent + mostTraded.solReceived),
      metadata: {
        tokenSymbol: mostTraded.tokenSymbol,
        tokenMint: mostTraded.tokenMint,
        totalVolume: this.roundSol(mostTraded.solSpent + mostTraded.solReceived),
        netPNL: this.roundSol(mostTraded.realizedPNL)
      }
    };
  }

  /**
   * 7. Diamond Hands - Longest held active position
   */
  static async diamondHands(positions, solPriceUSD) {
    const activePositions = Object.values(positions).filter(p => p.isActive);

    if (activePositions.length === 0) return null;

    const longest = activePositions
      .map(p => ({
        position: p,
        holdDays: Math.floor((Date.now() - new Date(p.firstTradeDate).getTime()) / (1000 * 60 * 60 * 24))
      }))
      .sort((a, b) => b.holdDays - a.holdDays)[0];

    return {
      type: 'diamond_hands',
      title: 'Diamond Hands 💎',
      description: `Holding ${longest.position.tokenSymbol} for ${longest.holdDays} days`,
      valuePrimary: longest.holdDays,
      valueSecondary: this.roundSol(longest.position.unrealizedPNL),
      metadata: {
        tokenSymbol: longest.position.tokenSymbol,
        tokenMint: longest.position.tokenMint,
        firstBuyDate: longest.position.firstTradeDate,
        currentValue: this.roundSol(longest.position.currentValueSol),
        unrealizedPNL: this.roundSol(longest.position.unrealizedPNL)
      }
    };
  }

  /**
   * 8. Paper Hands - Fastest sell after buy
   */
  static async paperHands(positions, solPriceUSD) {
    let fastestSell = null;
    let shortestHold = Infinity;

    for (const position of Object.values(positions)) {
      if (!position.trades || position.trades.length < 2) continue;

      const trades = position.trades.sort((a, b) => new Date(a.blockTime) - new Date(b.blockTime));

      for (let i = 0; i < trades.length - 1; i++) {
        const buy = trades[i];
        const sell = trades[i + 1];

        if (buy.type === 'BUY' && sell.type === 'SELL') {
          const holdTime = new Date(sell.blockTime) - new Date(buy.blockTime);
          const holdMinutes = Math.floor(holdTime / (1000 * 60));

          if (holdMinutes < shortestHold && holdMinutes >= 0) {
            shortestHold = holdMinutes;
            fastestSell = {
              position,
              buy,
              sell,
              holdMinutes
            };
          }
        }
      }
    }

    if (!fastestSell) return null;

    const profit = (fastestSell.sell.solAmount - fastestSell.sell.feeSol) -
                   (fastestSell.buy.solAmount + fastestSell.buy.feeSol);

    return {
      type: 'paper_hands',
      title: 'Paper Hands 📄',
      description: `Sold ${fastestSell.position.tokenSymbol} after ${shortestHold} minutes`,
      valuePrimary: shortestHold,
      valueSecondary: this.roundSol(Math.abs(profit)),
      metadata: {
        tokenSymbol: fastestSell.position.tokenSymbol,
        tokenMint: fastestSell.position.tokenMint,
        profit: this.roundSol(profit),
        wasProfit: profit > 0
      }
    };
  }

  /**
   * 9. Total Realized P&L
   */
  static async totalRealizedPNL(summary, solPriceUSD) {
    return {
      type: 'total_realized_pnl',
      title: summary.totalRealizedPNL >= 0 ? 'Total Profit 💰' : 'Total Loss 💸',
      description: `Realized ${summary.totalRealizedPNL >= 0 ? 'gains' : 'losses'} from all trades`,
      valuePrimary: this.roundSol(Math.abs(summary.totalRealizedPNL)),
      valueSecondary: this.roundUsd(Math.abs(summary.totalRealizedPNL) * solPriceUSD),
      metadata: {
        isProfit: summary.totalRealizedPNL >= 0,
        closedPositions: summary.closedPositions,
        profitablePositions: summary.profitablePositions
      }
    };
  }

  /**
   * 10. Total Unrealized P&L
   */
  static async totalUnrealizedPNL(summary, solPriceUSD) {
    if (summary.activePositions === 0) return null;

    return {
      type: 'total_unrealized_pnl',
      title: summary.totalUnrealizedPNL >= 0 ? 'Unrealized Gains 📈' : 'Unrealized Losses 📉',
      description: `${summary.totalUnrealizedPNL >= 0 ? 'Gains' : 'Losses'} on current holdings`,
      valuePrimary: this.roundSol(Math.abs(summary.totalUnrealizedPNL)),
      valueSecondary: this.roundUsd(Math.abs(summary.totalUnrealizedPNL) * solPriceUSD),
      metadata: {
        isProfit: summary.totalUnrealizedPNL >= 0,
        activePositions: summary.activePositions
      }
    };
  }

  /**
   * 11. Win Rate
   */
  static async winRate(summary) {
    if (summary.closedPositions === 0) return null;

    return {
      type: 'win_rate',
      title: 'Win Rate 🎲',
      description: `${summary.winRate}% of your trades were profitable`,
      valuePrimary: summary.winRate,
      valueSecondary: summary.profitablePositions,
      metadata: {
        profitablePositions: summary.profitablePositions,
        closedPositions: summary.closedPositions,
        grade: this.getWinRateGrade(summary.winRate)
      }
    };
  }

  /**
   * 12. Best Month
   */
  static async bestMonth(dailyPNL, solPriceUSD) {
    if (!dailyPNL || Object.keys(dailyPNL).length === 0) return null;

    // Group by month
    const monthlyPNL = {};

    for (const [date, data] of Object.entries(dailyPNL)) {
      const month = date.substring(0, 7); // YYYY-MM

      if (!monthlyPNL[month]) {
        monthlyPNL[month] = {
          realizedPNL: 0,
          transactionCount: 0,
          tokensTraded: new Set()
        };
      }

      monthlyPNL[month].realizedPNL += data.realizedPNLSol || 0;
      monthlyPNL[month].transactionCount += data.transactionCount || 0;

      if (data.tokensTraded) {
        data.tokensTraded.forEach(token => monthlyPNL[month].tokensTraded.add(token));
      }
    }

    // Find best month
    const bestMonth = Object.entries(monthlyPNL)
      .sort((a, b) => b[1].realizedPNL - a[1].realizedPNL)[0];

    if (!bestMonth || bestMonth[1].realizedPNL <= 0) return null;

    const [monthStr, data] = bestMonth;
    const monthName = new Date(monthStr + '-01').toLocaleString('en-US', { month: 'long', year: 'numeric' });

    return {
      type: 'best_month',
      title: 'Best Month 📅',
      description: `${monthName} was your most profitable month`,
      valuePrimary: this.roundSol(data.realizedPNL),
      valueSecondary: this.roundUsd(data.realizedPNL * solPriceUSD),
      metadata: {
        month: monthName,
        monthKey: monthStr,
        transactionCount: data.transactionCount,
        tokensTraded: data.tokensTraded.size
      }
    };
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
   * Helper: Calculate hold duration in human-readable format
   */
  static calculateHoldDuration(startDate, endDate) {
    const ms = new Date(endDate) - new Date(startDate);
    const minutes = Math.floor(ms / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days !== 1 ? 's' : ''}`;
    if (hours > 0) return `${hours} hour${hours !== 1 ? 's' : ''}`;
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
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
