const { query, transaction, batchInsert, batchUpsert } = require('../config/database');

/**
 * Database Queries - Optimized prepared statements and batch operations
 */
class DatabaseQueries {
  /**
   * ============================================================================
   * WALLET ANALYSES
   * ============================================================================
   */

  static async getAnalysis(walletAddress) {
    const result = await query(
      `SELECT * FROM wallet_analyses
       WHERE wallet_address = $1
       AND expires_at > CURRENT_TIMESTAMP
       LIMIT 1`,
      [walletAddress]
    );
    return result.rows[0] || null;
  }

  static async createAnalysis(walletAddress) {
    const result = await query(
      `INSERT INTO wallet_analyses (wallet_address, analysis_status, expires_at)
       VALUES ($1, 'pending', CURRENT_TIMESTAMP + INTERVAL '24 hours')
       ON CONFLICT (wallet_address)
       DO UPDATE SET
         analysis_status = 'pending',
         progress_percent = 0,
         started_at = CURRENT_TIMESTAMP,
         expires_at = CURRENT_TIMESTAMP + INTERVAL '24 hours'
       RETURNING *`,
      [walletAddress]
    );
    return result.rows[0];
  }

  static async updateAnalysisProgress(walletAddress, status, progressPercent, errorMessage = null) {
    await query(
      `UPDATE wallet_analyses
       SET analysis_status = $2,
           progress_percent = $3,
           error_message = $4,
           updated_at = CURRENT_TIMESTAMP
       WHERE wallet_address = $1`,
      [walletAddress, status, progressPercent, errorMessage]
    );
  }

  static async completeAnalysis(walletAddress, totalTransactions, lastSignature) {
    await query(
      `UPDATE wallet_analyses
       SET analysis_status = 'completed',
           progress_percent = 100,
           total_transactions = $2,
           last_signature = $3,
           completed_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE wallet_address = $1`,
      [walletAddress, totalTransactions, lastSignature]
    );
  }

  /**
   * ============================================================================
   * TRANSACTIONS - BATCH OPERATIONS
   * ============================================================================
   */

  static async insertTransactionsBatch(transactions) {
    if (!transactions || transactions.length === 0) return;

    const columns = [
      'wallet_address', 'signature', 'block_time', 'transaction_type',
      'token_mint', 'token_symbol', 'sol_amount', 'token_amount',
      'price_sol', 'fee_sol', 'is_estimated', 'raw_data'
    ];

    const values = transactions.map(tx => [
      tx.walletAddress,
      tx.signature,
      tx.blockTime,
      tx.type,
      tx.tokenMint,
      tx.tokenSymbol,
      tx.solAmount,
      tx.tokenAmount,
      tx.priceSol,
      tx.feeSol,
      tx.isEstimated || false,
      JSON.stringify(tx.rawData || {})
    ]);

    try {
      await batchInsert('transactions', columns, values, 500);
    } catch (error) {
      // Handle unique constraint violations gracefully
      if (error.code === '23505') { // Duplicate key
        console.warn('Duplicate transactions detected, inserting individually...');
        await this.insertTransactionsIndividually(transactions);
      } else {
        throw error;
      }
    }
  }

  static async insertTransactionsIndividually(transactions) {
    for (const tx of transactions) {
      try {
        await query(
          `INSERT INTO transactions (
            wallet_address, signature, block_time, transaction_type,
            token_mint, token_symbol, sol_amount, token_amount,
            price_sol, fee_sol, is_estimated, raw_data
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT (signature) DO NOTHING`,
          [
            tx.walletAddress, tx.signature, tx.blockTime, tx.type,
            tx.tokenMint, tx.tokenSymbol, tx.solAmount, tx.tokenAmount,
            tx.priceSol, tx.feeSol, tx.isEstimated || false,
            JSON.stringify(tx.rawData || {})
          ]
        );
      } catch (err) {
        console.error('Failed to insert transaction:', tx.signature, err.message);
      }
    }
  }

  /**
   * ============================================================================
   * TOKEN POSITIONS - UPSERT OPERATIONS
   * ============================================================================
   */

  static async upsertPosition(walletAddress, position) {
    const result = await query(
      `INSERT INTO token_positions (
        wallet_address, token_mint, token_symbol, token_name,
        sol_spent, sol_received, tokens_bought, tokens_sold, current_balance,
        realized_pnl_sol, unrealized_pnl_sol, current_value_sol,
        current_price_sol, avg_buy_price, avg_sell_price,
        buy_lots, first_trade_date, last_trade_date,
        is_active, has_estimated_transfers, has_balance_discrepancy,
        has_mev_activity, transfer_count, trade_count
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
        $16::jsonb, $17, $18, $19, $20, $21, $22, $23, $24
      )
      ON CONFLICT (wallet_address, token_mint) DO UPDATE SET
        token_symbol = EXCLUDED.token_symbol,
        token_name = EXCLUDED.token_name,
        sol_spent = EXCLUDED.sol_spent,
        sol_received = EXCLUDED.sol_received,
        tokens_bought = EXCLUDED.tokens_bought,
        tokens_sold = EXCLUDED.tokens_sold,
        current_balance = EXCLUDED.current_balance,
        realized_pnl_sol = EXCLUDED.realized_pnl_sol,
        unrealized_pnl_sol = EXCLUDED.unrealized_pnl_sol,
        current_value_sol = EXCLUDED.current_value_sol,
        current_price_sol = EXCLUDED.current_price_sol,
        avg_buy_price = EXCLUDED.avg_buy_price,
        avg_sell_price = EXCLUDED.avg_sell_price,
        buy_lots = EXCLUDED.buy_lots,
        last_trade_date = EXCLUDED.last_trade_date,
        is_active = EXCLUDED.is_active,
        has_estimated_transfers = EXCLUDED.has_estimated_transfers,
        has_balance_discrepancy = EXCLUDED.has_balance_discrepancy,
        has_mev_activity = EXCLUDED.has_mev_activity,
        transfer_count = EXCLUDED.transfer_count,
        trade_count = EXCLUDED.trade_count,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *`,
      [
        walletAddress, position.tokenMint, position.tokenSymbol, position.tokenName || '',
        position.solSpent, position.solReceived, position.tokensBought, position.tokensSold,
        position.currentBalance, position.realizedPNL, position.unrealizedPNL,
        position.currentValueSol, position.currentPriceSol, position.avgBuyPrice,
        position.avgSellPrice, JSON.stringify(position.buyLots),
        position.firstTradeDate, position.lastTradeDate, position.isActive,
        position.metadata.hasEstimatedTransfers, position.metadata.hasBalanceDiscrepancy || false,
        position.metadata.hasMEVActivity, position.metadata.transferCount,
        position.trades?.length || 0
      ]
    );
    return result.rows[0];
  }

  static async upsertPositionsBatch(walletAddress, positions) {
    // OPTIMIZATION: Use bulk upsert instead of sequential queries
    // This reduces N database round trips to 1 (up to 95% faster for large wallets)
    const positionList = Object.values(positions);
    if (positionList.length === 0) return [];

    const columns = [
      'wallet_address', 'token_mint', 'token_symbol', 'token_name',
      'sol_spent', 'sol_received', 'tokens_bought', 'tokens_sold', 'current_balance',
      'realized_pnl_sol', 'unrealized_pnl_sol', 'current_value_sol',
      'current_price_sol', 'avg_buy_price', 'avg_sell_price',
      'buy_lots', 'first_trade_date', 'last_trade_date',
      'is_active', 'has_estimated_transfers', 'has_balance_discrepancy',
      'has_mev_activity', 'transfer_count', 'trade_count'
    ];

    const columnTypes = [
      'text', 'text', 'text', 'text',
      'numeric', 'numeric', 'numeric', 'numeric', 'numeric',
      'numeric', 'numeric', 'numeric',
      'numeric', 'numeric', 'numeric',
      'jsonb', 'timestamptz', 'timestamptz',
      'boolean', 'boolean', 'boolean',
      'boolean', 'integer', 'integer'
    ];

    const values = positionList.map(position => [
      walletAddress,
      position.tokenMint,
      position.tokenSymbol,
      position.tokenName || '',
      position.solSpent,
      position.solReceived,
      position.tokensBought,
      position.tokensSold,
      position.currentBalance,
      position.realizedPNL,
      position.unrealizedPNL,
      position.currentValueSol,
      position.currentPriceSol,
      position.avgBuyPrice,
      position.avgSellPrice,
      JSON.stringify(position.buyLots),
      position.firstTradeDate,
      position.lastTradeDate,
      position.isActive,
      position.metadata.hasEstimatedTransfers,
      position.metadata.hasBalanceDiscrepancy || false,
      position.metadata.hasMEVActivity,
      position.metadata.transferCount,
      position.trades?.length || 0
    ]);

    const updateColumns = [
      'token_symbol', 'token_name', 'sol_spent', 'sol_received',
      'tokens_bought', 'tokens_sold', 'current_balance',
      'realized_pnl_sol', 'unrealized_pnl_sol', 'current_value_sol',
      'current_price_sol', 'avg_buy_price', 'avg_sell_price',
      'buy_lots', 'last_trade_date', 'is_active',
      'has_estimated_transfers', 'has_balance_discrepancy',
      'has_mev_activity', 'transfer_count', 'trade_count'
    ];

    await batchUpsert(
      'token_positions',
      columns,
      values,
      ['wallet_address', 'token_mint'],
      updateColumns,
      columnTypes
    );

    return positionList.map(p => ({ tokenMint: p.tokenMint }));
  }

  static async getPositions(walletAddress, limit = 10000, offset = 0) {
    const result = await query(
      `SELECT * FROM token_positions
       WHERE wallet_address = $1
       ORDER BY realized_pnl_sol DESC
       LIMIT $2 OFFSET $3`,
      [walletAddress, limit, offset]
    );
    return result.rows;
  }

  static async getActivePositions(walletAddress, limit = 10000, offset = 0) {
    const result = await query(
      `SELECT * FROM token_positions
       WHERE wallet_address = $1 AND is_active = true
       ORDER BY unrealized_pnl_sol DESC
       LIMIT $2 OFFSET $3`,
      [walletAddress, limit, offset]
    );
    return result.rows;
  }

  /**
   * Get all transactions for a wallet, optionally filtered by token mint
   * IMPORTANT: Use limit/offset for large wallets to prevent OOM
   */
  static async getTransactions(walletAddress, tokenMint = null, limit = 50000, offset = 0) {
    let queryText = `SELECT * FROM transactions WHERE wallet_address = $1`;
    const params = [walletAddress];

    if (tokenMint) {
      queryText += ` AND token_mint = $2`;
      params.push(tokenMint);
    }

    queryText += ` ORDER BY block_time ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await query(queryText, params);
    return result.rows;
  }

  /**
   * Get transactions grouped by token mint for highlight calculations
   */
  static async getTransactionsGroupedByToken(walletAddress) {
    const result = await query(
      `SELECT token_mint, json_agg(
        json_build_object(
          'signature', signature,
          'blockTime', block_time,
          'type', transaction_type,
          'tokenMint', token_mint,
          'tokenSymbol', token_symbol,
          'solAmount', sol_amount,
          'tokenAmount', token_amount,
          'priceSol', price_sol,
          'feeSol', fee_sol,
          'isEstimated', is_estimated
        ) ORDER BY block_time ASC
      ) as trades
      FROM transactions
      WHERE wallet_address = $1 AND token_mint IS NOT NULL
      GROUP BY token_mint`,
      [walletAddress]
    );
    return result.rows;
  }

  /**
   * ============================================================================
   * DAILY P&L - BATCH UPSERT
   * ============================================================================
   */

  static async upsertDailyPNL(walletAddress, dailyPNL, solPrices = {}) {
    // OPTIMIZATION: Use bulk upsert instead of sequential queries
    // This reduces N database round trips to 1
    const entries = Object.entries(dailyPNL);
    if (entries.length === 0) return;

    const columns = [
      'wallet_address', 'date', 'realized_pnl_sol', 'realized_pnl_usd',
      'transaction_count', 'tokens_traded', 'sol_price_usd'
    ];

    const columnTypes = [
      'text', 'date', 'numeric', 'numeric',
      'integer', 'integer', 'numeric'
    ];

    const values = entries.map(([date, data]) => {
      const solPrice = solPrices[date] || 0;
      const realizedPNLUsd = (data.realizedPNLSol || 0) * solPrice;
      return [
        walletAddress,
        date,
        data.realizedPNLSol || 0,
        realizedPNLUsd,
        data.transactionCount || 0,
        data.tokensTraded?.size || 0,
        solPrice
      ];
    });

    const updateColumns = [
      'realized_pnl_sol', 'realized_pnl_usd',
      'transaction_count', 'tokens_traded', 'sol_price_usd'
    ];

    await batchUpsert(
      'daily_pnl',
      columns,
      values,
      ['wallet_address', 'date'],
      updateColumns,
      columnTypes
    );
  }

  static async getDailyPNL(walletAddress, year, month = null) {
    let dateFilter = `EXTRACT(YEAR FROM date) = $2`;
    const params = [walletAddress, year];

    if (month !== null) {
      dateFilter += ` AND EXTRACT(MONTH FROM date) = $3`;
      params.push(month);
    }

    const result = await query(
      `SELECT * FROM daily_pnl
       WHERE wallet_address = $1 AND ${dateFilter}
       ORDER BY date DESC`,
      params
    );
    return result.rows;
  }

  /**
   * ============================================================================
   * HIGHLIGHTS
   * ============================================================================
   */

  static async upsertHighlight(walletAddress, highlight) {
    const result = await query(
      `INSERT INTO highlights (
        wallet_address, highlight_type, title, description,
        value_primary, value_secondary, metadata, rank, image_url
      ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
      ON CONFLICT (wallet_address, highlight_type) DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        value_primary = EXCLUDED.value_primary,
        value_secondary = EXCLUDED.value_secondary,
        metadata = EXCLUDED.metadata,
        rank = EXCLUDED.rank,
        image_url = EXCLUDED.image_url,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *`,
      [
        walletAddress,
        highlight.type,
        highlight.title,
        highlight.description,
        highlight.valuePrimary,
        highlight.valueSecondary,
        JSON.stringify(highlight.metadata || {}),
        highlight.rank || 0,
        highlight.imageUrl || null
      ]
    );
    return result.rows[0];
  }

  /**
   * Batch upsert highlights (3-5x faster than individual upserts)
   * Optimized for end-of-analysis highlight saves
   */
  static async upsertHighlightsBatch(walletAddress, highlights) {
    if (!highlights || highlights.length === 0) return [];

    const columns = [
      'wallet_address', 'highlight_type', 'title', 'description',
      'value_primary', 'value_secondary', 'metadata', 'rank', 'image_url'
    ];

    const values = highlights.map(h => [
      walletAddress,
      h.type,
      h.title,
      h.description,
      h.valuePrimary,
      h.valueSecondary,
      JSON.stringify(h.metadata || {}),
      h.rank || 0,
      h.imageUrl || null
    ]);

    const columnTypes = [
      'text', 'text', 'text', 'text',
      'text', 'text', 'jsonb', 'integer', 'text'
    ];

    await batchUpsert(
      'highlights',
      columns,
      values,
      ['wallet_address', 'highlight_type'], // conflict columns
      null, // update all non-conflict columns
      columnTypes
    );

    // Return highlights for consistency with single upsert
    return highlights;
  }

  static async getHighlights(walletAddress) {
    const result = await query(
      `SELECT * FROM highlights
       WHERE wallet_address = $1
       ORDER BY rank ASC`,
      [walletAddress]
    );
    return result.rows;
  }

  /**
   * Delete all highlights for a wallet (used for refresh)
   */
  static async deleteHighlights(walletAddress) {
    const result = await query(
      `DELETE FROM highlights WHERE wallet_address = $1`,
      [walletAddress]
    );
    console.log(`Deleted ${result.rowCount} highlights for ${walletAddress}`);
    return result.rowCount;
  }

  /**
   * Reset analysis status to force re-processing on refresh
   * Sets completed_at to null so the analyzer doesn't skip it
   */
  static async resetAnalysisForRefresh(walletAddress) {
    const result = await query(
      `UPDATE wallet_analyses
       SET completed_at = NULL,
           analysis_status = 'pending',
           progress_percent = 0,
           updated_at = CURRENT_TIMESTAMP
       WHERE wallet_address = $1`,
      [walletAddress]
    );
    console.log(`Reset analysis for refresh: ${walletAddress}`);
    return result.rowCount;
  }

  /**
   * ============================================================================
   * CLEANUP & MAINTENANCE
   * ============================================================================
   */

  static async cleanupExpiredAnalyses() {
    const result = await query(
      `DELETE FROM wallet_analyses
       WHERE expires_at < CURRENT_TIMESTAMP
       AND analysis_status IN ('completed', 'failed')
       RETURNING wallet_address`
    );
    console.log(`Cleaned up ${result.rowCount} expired analyses`);
    return result.rowCount;
  }

  /**
   * Mark stale processing analyses as failed
   * Any analysis stuck in 'processing' for more than 10 minutes is considered failed
   * Also cleans up orphaned Redis locks
   */
  static async cleanupStaleProcessing() {
    const result = await query(
      `UPDATE wallet_analyses
       SET analysis_status = 'failed',
           error_message = 'Analysis timed out',
           updated_at = CURRENT_TIMESTAMP
       WHERE analysis_status = 'processing'
       AND updated_at < CURRENT_TIMESTAMP - INTERVAL '10 minutes'
       RETURNING wallet_address`
    );
    if (result.rowCount > 0) {
      console.log(`Marked ${result.rowCount} stale analyses as failed:`, result.rows.map(r => r.wallet_address));

      // Also release Redis locks for these stale analyses
      try {
        const RateLimiter = require('../utils/rateLimiter');
        for (const row of result.rows) {
          await RateLimiter.releaseAnalysisLock(row.wallet_address);
        }
        console.log('Released Redis locks for stale analyses');
      } catch (lockError) {
        console.error('Error releasing locks for stale analyses:', lockError.message);
      }
    }
    return result.rowCount;
  }

  static async vacuumAnalyze() {
    // Run VACUUM ANALYZE to optimize database
    await query('VACUUM ANALYZE wallet_analyses');
    await query('VACUUM ANALYZE token_positions');
    await query('VACUUM ANALYZE transactions');
    await query('VACUUM ANALYZE daily_pnl');
    console.log('Database vacuum and analyze completed');
  }
}

module.exports = DatabaseQueries;
