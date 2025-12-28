-- Migration: Add Performance Indexes
-- Description: Adds composite indexes for common query patterns
-- Date: 2025-01-XX

-- Add composite index for stale analysis cleanup
CREATE INDEX IF NOT EXISTS idx_wallet_analyses_status_expires
ON wallet_analyses(analysis_status, expires_at)
WHERE analysis_status = 'processing';

-- Add composite index for P&L calculations (FIFO sorting)
CREATE INDEX IF NOT EXISTS idx_transactions_token_time
ON transactions(token_mint, block_time)
WHERE token_mint IS NOT NULL;

-- Add composite index for calendar queries with year/month filtering
CREATE INDEX IF NOT EXISTS idx_daily_pnl_wallet_year_month
ON daily_pnl(wallet_address, EXTRACT(YEAR FROM date), EXTRACT(MONTH FROM date));

-- Verify indexes were created
SELECT
  schemaname,
  tablename,
  indexname
FROM pg_indexes
WHERE indexname IN (
  'idx_wallet_analyses_status_expires',
  'idx_transactions_token_time',
  'idx_daily_pnl_wallet_year_month'
)
ORDER BY tablename, indexname;
