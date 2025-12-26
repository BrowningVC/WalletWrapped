const express = require('express');
const router = express.Router();
const { PublicKey } = require('@solana/web3.js');
const DatabaseQueries = require('../database/queries');
const CacheManager = require('../utils/cacheManager');
const WalletAnalyzer = require('../services/analyzer');

/**
 * Validate Solana wallet address
 */
function isValidSolanaAddress(address) {
  try {
    const pubkey = new PublicKey(address);
    return PublicKey.isOnCurve(pubkey.toBuffer());
  } catch {
    return false;
  }
}

/**
 * Check if analysis exists and is complete
 */
async function requireCompletedAnalysis(address) {
  const analysis = await DatabaseQueries.getAnalysis(address);

  if (!analysis) {
    return { error: 'Analysis not found', status: 404 };
  }

  if (analysis.analysis_status !== 'completed') {
    return {
      error: 'Analysis not complete',
      status: 400,
      message: `Analysis is currently ${analysis.analysis_status}. Please wait for completion.`
    };
  }

  return { success: true, analysis };
}

/**
 * GET /api/wallet/:address/summary
 * Get wallet analysis summary
 *
 * Returns:
 * - Total P&L (realized + unrealized)
 * - Active/closed position counts
 * - Win rate
 * - Transaction count
 */
router.get('/wallet/:address/summary', async (req, res) => {
  try {
    const { address } = req.params;

    if (!isValidSolanaAddress(address)) {
      return res.status(400).json({ error: 'Invalid wallet address' });
    }

    const check = await requireCompletedAnalysis(address);
    if (check.error) {
      return res.status(check.status).json({ error: check.error, message: check.message });
    }

    // Try cache first
    const cached = await CacheManager.getWalletSummary(address);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    // Get from database
    const summary = await WalletAnalyzer.getAnalysisSummary(address);

    if (!summary) {
      return res.status(404).json({ error: 'Summary not found' });
    }

    // Cache for 24 hours
    await CacheManager.cacheWalletSummary(address, JSON.stringify(summary));

    res.json(summary);

  } catch (error) {
    console.error('Summary endpoint error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/wallet/:address/positions
 * Get all token positions for wallet
 *
 * Query params:
 * - active: boolean (filter for active positions only)
 * - sort: string (realized_pnl, unrealized_pnl, balance)
 * - order: asc|desc
 */
router.get('/wallet/:address/positions', async (req, res) => {
  try {
    const { address } = req.params;
    const { active, sort = 'realized_pnl', order = 'desc' } = req.query;

    if (!isValidSolanaAddress(address)) {
      return res.status(400).json({ error: 'Invalid wallet address' });
    }

    const check = await requireCompletedAnalysis(address);
    if (check.error) {
      return res.status(check.status).json({ error: check.error, message: check.message });
    }

    // Get positions from database
    let positions = active === 'true'
      ? await DatabaseQueries.getActivePositions(address)
      : await DatabaseQueries.getPositions(address);

    // Sort
    const sortKey = {
      'realized_pnl': 'realized_pnl_sol',
      'unrealized_pnl': 'unrealized_pnl_sol',
      'balance': 'current_balance'
    }[sort] || 'realized_pnl_sol';

    positions.sort((a, b) => {
      const aVal = parseFloat(a[sortKey]);
      const bVal = parseFloat(b[sortKey]);
      return order === 'asc' ? aVal - bVal : bVal - aVal;
    });

    res.json({
      count: positions.length,
      positions: positions.map(p => ({
        tokenMint: p.token_mint,
        tokenSymbol: p.token_symbol,
        tokenName: p.token_name,
        solSpent: parseFloat(p.sol_spent),
        solReceived: parseFloat(p.sol_received),
        tokensBought: parseFloat(p.tokens_bought),
        tokensSold: parseFloat(p.tokens_sold),
        currentBalance: parseFloat(p.current_balance),
        realizedPNL: parseFloat(p.realized_pnl_sol),
        unrealizedPNL: parseFloat(p.unrealized_pnl_sol),
        currentValueSol: parseFloat(p.current_value_sol),
        currentPriceSol: parseFloat(p.current_price_sol || 0),
        avgBuyPrice: parseFloat(p.avg_buy_price || 0),
        avgSellPrice: parseFloat(p.avg_sell_price || 0),
        firstTradeDate: p.first_trade_date,
        lastTradeDate: p.last_trade_date,
        isActive: p.is_active,
        tradeCount: p.trade_count,
        hasEstimatedTransfers: p.has_estimated_transfers,
        hasBalanceDiscrepancy: p.has_balance_discrepancy,
        hasMEVActivity: p.has_mev_activity
      }))
    });

  } catch (error) {
    console.error('Positions endpoint error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/wallet/:address/highlights
 * Get all highlight cards for wallet
 *
 * Returns: Array of 12 highlight objects
 */
router.get('/wallet/:address/highlights', async (req, res) => {
  try {
    const { address } = req.params;

    if (!isValidSolanaAddress(address)) {
      return res.status(400).json({ error: 'Invalid wallet address' });
    }

    const check = await requireCompletedAnalysis(address);
    if (check.error) {
      return res.status(check.status).json({ error: check.error, message: check.message });
    }

    // Try cache first
    const cached = await CacheManager.getHighlights(address);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    // Get from database
    const highlights = await DatabaseQueries.getHighlights(address);

    if (!highlights || highlights.length === 0) {
      return res.status(404).json({ error: 'Highlights not found' });
    }

    const result = highlights.map(h => ({
      type: h.highlight_type,
      title: h.title,
      description: h.description,
      valuePrimary: parseFloat(h.value_primary || 0),
      valueSecondary: parseFloat(h.value_secondary || 0),
      metadata: h.metadata,
      rank: h.rank,
      imageUrl: h.image_url
    }));

    // Cache for 24 hours
    await CacheManager.cacheHighlights(address, JSON.stringify(result));

    res.json(result);

  } catch (error) {
    console.error('Highlights endpoint error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/wallet/:address/calendar
 * Get daily P&L for calendar view
 *
 * Query params:
 * - year: number (required)
 * - month: number (optional, 1-12)
 * - currency: SOL|USD (default: SOL)
 *
 * Returns: { dailyPNL: { [date]: { ... } }, currency }
 */
router.get('/wallet/:address/calendar', async (req, res) => {
  try {
    const { address } = req.params;
    const { year, month, currency = 'SOL' } = req.query;

    if (!isValidSolanaAddress(address)) {
      return res.status(400).json({ error: 'Invalid wallet address' });
    }

    if (!year || isNaN(year)) {
      return res.status(400).json({
        error: 'Missing year parameter',
        message: 'Please provide a valid year (e.g., 2024)'
      });
    }

    if (month && (isNaN(month) || month < 1 || month > 12)) {
      return res.status(400).json({
        error: 'Invalid month parameter',
        message: 'Month must be between 1-12'
      });
    }

    const check = await requireCompletedAnalysis(address);
    if (check.error) {
      return res.status(check.status).json({ error: check.error, message: check.message });
    }

    // Try cache first
    const cached = await CacheManager.getDailyPNL(address, year, month);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    // Get from database
    const dailyPNLRows = await DatabaseQueries.getDailyPNL(
      address,
      parseInt(year),
      month ? parseInt(month) : null
    );

    // Transform to frontend format
    const dailyPNL = dailyPNLRows.reduce((acc, row) => {
      const date = row.date.toISOString().split('T')[0]; // YYYY-MM-DD

      acc[date] = {
        date,
        realizedPNLSol: parseFloat(row.realized_pnl_sol),
        realizedPNLUsd: parseFloat(row.realized_pnl_usd),
        transactionCount: row.transaction_count,
        tokensTraded: row.tokens_traded,
        solPriceUsd: parseFloat(row.sol_price_usd || 0)
      };

      return acc;
    }, {});

    const result = { dailyPNL, currency };

    // Cache for 24 hours
    await CacheManager.cacheDailyPNL(address, year, month, JSON.stringify(result));

    res.json(result);

  } catch (error) {
    console.error('Calendar endpoint error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/wallet/:address/refresh
 * Force refresh analysis (invalidate cache and re-analyze)
 *
 * Rate limited to 1 request per hour per wallet
 */
router.post('/wallet/:address/refresh', async (req, res) => {
  try {
    const { address } = req.params;

    if (!isValidSolanaAddress(address)) {
      return res.status(400).json({ error: 'Invalid wallet address' });
    }

    // Check rate limit (1 refresh per hour per wallet)
    const { checkLimit } = require('../utils/rateLimiter');
    const rateLimit = await checkLimit(`refresh:${address}`, 1, 3600000);

    if (!rateLimit.allowed) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: `Please wait ${Math.ceil(rateLimit.retryAfter / 60000)} minutes before refreshing again`
      });
    }

    // Invalidate all caches for this wallet
    await CacheManager.invalidateWallet(address);

    // Queue new analysis
    const { queueAnalysis } = require('../workers/queue');
    await queueAnalysis(address, { priority: 'high', incremental: true });

    res.json({
      success: true,
      message: 'Refresh started. Analysis will be updated shortly.'
    });

  } catch (error) {
    console.error('Refresh endpoint error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
