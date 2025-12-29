const express = require('express');
const router = express.Router();
const { query } = require('../config/database');

/**
 * Simple admin authentication middleware
 * Uses a secret key from environment variable
 */
function adminAuth(req, res, next) {
  const adminKey = req.headers['x-admin-key'] || req.query.key;
  const expectedKey = process.env.ADMIN_SECRET_KEY;

  if (!expectedKey) {
    console.error('ADMIN_SECRET_KEY not configured');
    return res.status(500).json({ error: 'Admin access not configured' });
  }

  if (!adminKey || adminKey !== expectedKey) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}

/**
 * GET /api/admin/stats
 * Get overall statistics
 */
router.get('/stats', adminAuth, async (req, res) => {
  try {
    const stats = await query(`
      SELECT
        COUNT(*) as total_analyses,
        COUNT(CASE WHEN analysis_status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN analysis_status = 'processing' THEN 1 END) as processing,
        COUNT(CASE WHEN analysis_status = 'failed' THEN 1 END) as failed,
        COUNT(CASE WHEN analysis_status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN started_at > NOW() - INTERVAL '24 hours' THEN 1 END) as last_24h,
        COUNT(CASE WHEN started_at > NOW() - INTERVAL '1 hour' THEN 1 END) as last_hour,
        SUM(total_transactions) as total_transactions_analyzed,
        AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) as avg_duration_seconds
      FROM wallet_analyses
    `);

    const positionStats = await query(`
      SELECT
        COUNT(DISTINCT wallet_address) as wallets_with_positions,
        COUNT(*) as total_positions,
        SUM(CASE WHEN is_active THEN 1 ELSE 0 END) as active_positions
      FROM token_positions
    `);

    res.json({
      analyses: stats.rows[0],
      positions: positionStats.rows[0],
      serverTime: new Date().toISOString()
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

/**
 * GET /api/admin/analyses
 * Get list of analyses with pagination
 */
router.get('/analyses', adminAuth, async (req, res) => {
  try {
    const {
      status,
      limit = 50,
      offset = 0,
      sort = 'started_at',
      order = 'desc'
    } = req.query;

    // Validate sort column (whitelist)
    const validSorts = ['started_at', 'completed_at', 'total_transactions', 'progress_percent'];
    const sortColumn = validSorts.includes(sort) ? sort : 'started_at';
    const sortOrder = order === 'asc' ? 'ASC' : 'DESC';

    let whereClause = '';
    const params = [];

    if (status) {
      whereClause = 'WHERE analysis_status = $1';
      params.push(status);
    }

    const analyses = await query(`
      SELECT
        wallet_address,
        analysis_status,
        progress_percent,
        total_transactions,
        started_at,
        completed_at,
        updated_at,
        error_message,
        EXTRACT(EPOCH FROM (COALESCE(completed_at, NOW()) - started_at)) as duration_seconds
      FROM wallet_analyses
      ${whereClause}
      ORDER BY ${sortColumn} ${sortOrder} NULLS LAST
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `, [...params, parseInt(limit), parseInt(offset)]);

    const countResult = await query(`
      SELECT COUNT(*) as total FROM wallet_analyses ${whereClause}
    `, params);

    res.json({
      analyses: analyses.rows,
      total: parseInt(countResult.rows[0].total),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Admin analyses error:', error);
    res.status(500).json({ error: 'Failed to fetch analyses' });
  }
});

/**
 * GET /api/admin/analyses/live
 * Get currently processing analyses (for live view)
 */
router.get('/analyses/live', adminAuth, async (req, res) => {
  try {
    const liveAnalyses = await query(`
      SELECT
        wallet_address,
        analysis_status,
        progress_percent,
        started_at,
        updated_at,
        EXTRACT(EPOCH FROM (NOW() - started_at)) as elapsed_seconds
      FROM wallet_analyses
      WHERE analysis_status = 'processing'
         OR (analysis_status = 'pending' AND started_at > NOW() - INTERVAL '5 minutes')
      ORDER BY started_at DESC
      LIMIT 50
    `);

    res.json({
      live: liveAnalyses.rows,
      count: liveAnalyses.rows.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Admin live analyses error:', error);
    res.status(500).json({ error: 'Failed to fetch live analyses' });
  }
});

/**
 * GET /api/admin/analyses/recent
 * Get recently completed analyses
 */
router.get('/analyses/recent', adminAuth, async (req, res) => {
  try {
    const { hours = 24 } = req.query;

    const recentAnalyses = await query(`
      SELECT
        wallet_address,
        analysis_status,
        total_transactions,
        started_at,
        completed_at,
        EXTRACT(EPOCH FROM (completed_at - started_at)) as duration_seconds,
        error_message
      FROM wallet_analyses
      WHERE started_at > NOW() - INTERVAL '${parseInt(hours)} hours'
      ORDER BY started_at DESC
      LIMIT 200
    `);

    res.json({
      analyses: recentAnalyses.rows,
      count: recentAnalyses.rows.length,
      hours: parseInt(hours)
    });
  } catch (error) {
    console.error('Admin recent analyses error:', error);
    res.status(500).json({ error: 'Failed to fetch recent analyses' });
  }
});

/**
 * GET /api/admin/analyses/:address
 * Get detailed info for a specific wallet
 */
router.get('/analyses/:address', adminAuth, async (req, res) => {
  try {
    const { address } = req.params;

    const analysis = await query(`
      SELECT * FROM wallet_analyses WHERE wallet_address = $1
    `, [address]);

    if (analysis.rows.length === 0) {
      return res.status(404).json({ error: 'Analysis not found' });
    }

    const positions = await query(`
      SELECT
        token_mint,
        token_symbol,
        token_name,
        sol_spent,
        sol_received,
        tokens_bought,
        tokens_sold,
        current_balance,
        realized_pnl_sol,
        unrealized_pnl_sol,
        is_active,
        trade_count,
        first_trade_date,
        last_trade_date
      FROM token_positions
      WHERE wallet_address = $1
      ORDER BY ABS(realized_pnl_sol) DESC
      LIMIT 50
    `, [address]);

    const highlights = await query(`
      SELECT
        highlight_type,
        title,
        value_primary,
        value_secondary
      FROM wallet_highlights
      WHERE wallet_address = $1
      ORDER BY rank
    `, [address]);

    res.json({
      analysis: analysis.rows[0],
      positions: positions.rows,
      highlights: highlights.rows
    });
  } catch (error) {
    console.error('Admin analysis detail error:', error);
    res.status(500).json({ error: 'Failed to fetch analysis details' });
  }
});

/**
 * GET /api/admin/hourly
 * Get hourly analysis counts for the last 24 hours
 */
router.get('/hourly', adminAuth, async (req, res) => {
  try {
    const hourlyStats = await query(`
      SELECT
        DATE_TRUNC('hour', started_at) as hour,
        COUNT(*) as total,
        COUNT(CASE WHEN analysis_status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN analysis_status = 'failed' THEN 1 END) as failed,
        AVG(total_transactions) as avg_transactions
      FROM wallet_analyses
      WHERE started_at > NOW() - INTERVAL '24 hours'
      GROUP BY DATE_TRUNC('hour', started_at)
      ORDER BY hour DESC
    `);

    res.json({
      hourly: hourlyStats.rows
    });
  } catch (error) {
    console.error('Admin hourly stats error:', error);
    res.status(500).json({ error: 'Failed to fetch hourly stats' });
  }
});

module.exports = router;
