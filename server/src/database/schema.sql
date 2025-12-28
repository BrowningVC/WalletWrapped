-- WalletWrapped Database Schema
-- PostgreSQL 14+
-- Optimized for FIFO cost basis, partial sells, and unrealized P&L tracking

-- Drop existing tables (for development)
DROP TABLE IF EXISTS highlights CASCADE;
DROP TABLE IF EXISTS daily_pnl CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS token_positions CASCADE;
DROP TABLE IF EXISTS wallet_analyses CASCADE;
DROP TABLE IF EXISTS sol_prices CASCADE;

-- ============================================================================
-- Wallet Analyses Tracking
-- ============================================================================
CREATE TABLE wallet_analyses (
  id SERIAL PRIMARY KEY,
  wallet_address VARCHAR(44) UNIQUE NOT NULL,
  analysis_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  progress_percent INTEGER DEFAULT 0,
  total_transactions INTEGER DEFAULT 0,
  processed_transactions INTEGER DEFAULT 0,
  last_signature VARCHAR(88),  -- For incremental updates
  error_message TEXT,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  expires_at TIMESTAMP NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours'),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- Token Positions (CRITICAL - Supports FIFO, Partial Sells, Unrealized P&L)
-- ============================================================================
CREATE TABLE token_positions (
  id SERIAL PRIMARY KEY,
  wallet_address VARCHAR(44) NOT NULL,
  token_mint VARCHAR(44) NOT NULL,
  token_symbol VARCHAR(20),
  token_name VARCHAR(100),

  -- Transaction totals
  sol_spent DECIMAL(20, 9) DEFAULT 0,              -- Total SOL spent buying
  sol_received DECIMAL(20, 9) DEFAULT 0,            -- Total SOL received selling
  tokens_bought DECIMAL(30, 9) DEFAULT 0,           -- Total tokens bought
  tokens_sold DECIMAL(30, 9) DEFAULT 0,             -- Total tokens sold
  current_balance DECIMAL(30, 9) DEFAULT 0,         -- Tokens still held

  -- P&L calculations
  realized_pnl_sol DECIMAL(20, 9) DEFAULT 0,        -- Realized P&L (from completed sells)
  unrealized_pnl_sol DECIMAL(20, 9) DEFAULT 0,      -- Unrealized P&L (current holdings)
  current_value_sol DECIMAL(20, 9) DEFAULT 0,       -- Current market value of holdings

  -- Pricing
  current_price_sol DECIMAL(20, 9),                 -- Current token price
  avg_buy_price DECIMAL(20, 9),                     -- Average cost per token
  avg_sell_price DECIMAL(20, 9),                    -- Average sell price per token

  -- FIFO tracking (CRITICAL for partial sells)
  buy_lots JSONB DEFAULT '[]'::jsonb,               -- Array of unsold lots: [{ tokenAmount, costBasisSol, costPerToken, date }]

  -- Metadata
  first_trade_date TIMESTAMP,
  last_trade_date TIMESTAMP,
  is_active BOOLEAN DEFAULT false,                  -- true if currentBalance > 0
  has_estimated_transfers BOOLEAN DEFAULT false,    -- true if includes transfer P&L estimates
  has_balance_discrepancy BOOLEAN DEFAULT false,    -- true if calculated != actual on-chain balance
  has_mev_activity BOOLEAN DEFAULT false,           -- true if MEV/sandwich attacks detected
  transfer_count INTEGER DEFAULT 0,
  trade_count INTEGER DEFAULT 0,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(wallet_address, token_mint)
);

-- ============================================================================
-- Individual Transactions
-- ============================================================================
CREATE TABLE transactions (
  id SERIAL PRIMARY KEY,
  wallet_address VARCHAR(44) NOT NULL,
  signature VARCHAR(88) UNIQUE NOT NULL,
  block_time TIMESTAMP NOT NULL,
  transaction_type VARCHAR(20) NOT NULL,  -- BUY, SELL, TRANSFER_IN, TRANSFER_OUT, SOL_TRANSFER
  token_mint VARCHAR(44),                  -- NULL for SOL-only transfers
  token_symbol VARCHAR(20),
  sol_amount DECIMAL(20, 9),               -- SOL spent (buy) or received (sell)
  token_amount DECIMAL(30, 9),             -- Tokens bought or sold
  price_sol DECIMAL(20, 9),                -- Effective price per token
  fee_sol DECIMAL(20, 9),                  -- Transaction fee
  raw_data JSONB,                          -- Original Helius data
  is_estimated BOOLEAN DEFAULT false,      -- true for transfer-outs with estimated prices
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- Daily P&L Aggregates (for Calendar View)
-- ============================================================================
CREATE TABLE daily_pnl (
  id SERIAL PRIMARY KEY,
  wallet_address VARCHAR(44) NOT NULL,
  date DATE NOT NULL,
  realized_pnl_sol DECIMAL(20, 9) DEFAULT 0,        -- Only realized P&L (from sells)
  realized_pnl_usd DECIMAL(20, 2) DEFAULT 0,
  transaction_count INTEGER DEFAULT 0,
  tokens_traded INTEGER DEFAULT 0,                  -- Unique tokens traded that day
  sol_price_usd DECIMAL(10, 2),                     -- SOL/USD price on that date
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(wallet_address, date)
);

-- ============================================================================
-- Highlights/Achievements
-- ============================================================================
CREATE TABLE highlights (
  id SERIAL PRIMARY KEY,
  wallet_address VARCHAR(44) NOT NULL,
  highlight_type VARCHAR(50) NOT NULL,              -- biggest_win, best_trade, diamond_hands, etc.
  title VARCHAR(200) NOT NULL,
  description TEXT,
  value_primary DECIMAL(20, 1),                     -- Primary value (1 decimal precision)
  value_secondary DECIMAL(20, 1),                   -- Secondary value (1 decimal precision)
  metadata JSONB DEFAULT '{}'::jsonb,               -- Additional data (token info, dates, etc.)
  rank INTEGER,                                     -- For ordering within type
  image_url VARCHAR(500),                           -- Pre-generated image URL (CDN)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(wallet_address, highlight_type)
);

-- ============================================================================
-- Historical SOL Prices (for USD conversion)
-- ============================================================================
CREATE TABLE sol_prices (
  id SERIAL PRIMARY KEY,
  date DATE UNIQUE NOT NULL,
  price_usd DECIMAL(10, 2) NOT NULL,
  source VARCHAR(50),                               -- jupiter, coingecko, etc.
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- Indexes for Performance
-- ============================================================================

-- Wallet analyses indexes
CREATE INDEX idx_wallet_analyses_address ON wallet_analyses(wallet_address);
CREATE INDEX idx_wallet_analyses_status ON wallet_analyses(analysis_status) WHERE analysis_status != 'completed';
CREATE INDEX idx_wallet_analyses_expires ON wallet_analyses(expires_at) WHERE expires_at > CURRENT_TIMESTAMP;
-- Composite index for stale analysis cleanup query
CREATE INDEX idx_wallet_analyses_status_expires ON wallet_analyses(analysis_status, expires_at) WHERE analysis_status = 'processing';

-- Token positions indexes
CREATE INDEX idx_token_positions_wallet ON token_positions(wallet_address);
CREATE INDEX idx_token_positions_wallet_mint ON token_positions(wallet_address, token_mint);
CREATE INDEX idx_token_positions_realized_pnl ON token_positions(wallet_address, realized_pnl_sol DESC);
CREATE INDEX idx_token_positions_unrealized_pnl ON token_positions(wallet_address, unrealized_pnl_sol DESC) WHERE is_active = true;
CREATE INDEX idx_active_positions ON token_positions(wallet_address) WHERE is_active = true;

-- Transactions indexes
CREATE INDEX idx_transactions_wallet ON transactions(wallet_address);
CREATE INDEX idx_transactions_signature ON transactions(signature);
CREATE INDEX idx_transactions_wallet_time ON transactions(wallet_address, block_time DESC);
CREATE INDEX idx_transactions_wallet_token ON transactions(wallet_address, token_mint, block_time DESC);
CREATE INDEX idx_transactions_type ON transactions(transaction_type) WHERE transaction_type != 'SOL_TRANSFER';
-- Composite index for P&L calculations (token_mint + block_time for FIFO sorting)
CREATE INDEX idx_transactions_token_time ON transactions(token_mint, block_time) WHERE token_mint IS NOT NULL;

-- Daily P&L indexes
CREATE INDEX idx_daily_pnl_wallet ON daily_pnl(wallet_address);
CREATE INDEX idx_daily_pnl_wallet_date ON daily_pnl(wallet_address, date DESC);
CREATE INDEX idx_daily_pnl_date ON daily_pnl(date DESC);
-- Composite index for calendar queries with year/month filtering
CREATE INDEX idx_daily_pnl_wallet_year_month ON daily_pnl(wallet_address, EXTRACT(YEAR FROM date), EXTRACT(MONTH FROM date));

-- Highlights indexes
CREATE INDEX idx_highlights_wallet ON highlights(wallet_address);
CREATE INDEX idx_highlights_wallet_type ON highlights(wallet_address, highlight_type);
CREATE INDEX idx_highlights_type_rank ON highlights(highlight_type, rank);

-- SOL prices index
CREATE INDEX idx_sol_prices_date ON sol_prices(date DESC);

-- ============================================================================
-- Functions and Triggers
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at trigger to relevant tables
CREATE TRIGGER update_wallet_analyses_updated_at BEFORE UPDATE ON wallet_analyses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_token_positions_updated_at BEFORE UPDATE ON token_positions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_daily_pnl_updated_at BEFORE UPDATE ON daily_pnl
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_highlights_updated_at BEFORE UPDATE ON highlights
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Comments for Documentation
-- ============================================================================

COMMENT ON TABLE wallet_analyses IS 'Tracks wallet analysis job status and progress';
COMMENT ON TABLE token_positions IS 'Aggregated token positions with FIFO cost basis tracking';
COMMENT ON TABLE transactions IS 'Individual wallet transactions (buys, sells, transfers)';
COMMENT ON TABLE daily_pnl IS 'Daily aggregated realized P&L for calendar view';
COMMENT ON TABLE highlights IS 'Generated highlight cards/achievements';
COMMENT ON TABLE sol_prices IS 'Historical SOL/USD prices for currency conversion';

COMMENT ON COLUMN token_positions.buy_lots IS 'JSONB array of unsold FIFO lots: [{ tokenAmount, costBasisSol, costPerToken, date }]';
COMMENT ON COLUMN token_positions.realized_pnl_sol IS 'Realized P&L from completed sells (FIFO method)';
COMMENT ON COLUMN token_positions.unrealized_pnl_sol IS 'Unrealized P&L from current holdings';
COMMENT ON COLUMN transactions.transaction_type IS 'BUY, SELL, TRANSFER_IN, TRANSFER_OUT, SOL_TRANSFER';
COMMENT ON COLUMN daily_pnl.realized_pnl_sol IS 'Only includes realized P&L, not unrealized gains';

-- ============================================================================
-- Sample Queries for Testing
-- ============================================================================

/*
-- Get active positions for a wallet
SELECT * FROM token_positions
WHERE wallet_address = 'WALLET_ADDRESS' AND is_active = true
ORDER BY unrealized_pnl_sol DESC;

-- Get top 10 biggest wins (realized)
SELECT * FROM token_positions
WHERE wallet_address = 'WALLET_ADDRESS' AND realized_pnl_sol > 0
ORDER BY realized_pnl_sol DESC
LIMIT 10;

-- Get daily P&L for calendar (last 365 days)
SELECT date, realized_pnl_sol, realized_pnl_usd, transaction_count
FROM daily_pnl
WHERE wallet_address = 'WALLET_ADDRESS'
  AND date >= CURRENT_DATE - INTERVAL '365 days'
ORDER BY date DESC;

-- Get all highlights for a wallet
SELECT * FROM highlights
WHERE wallet_address = 'WALLET_ADDRESS'
ORDER BY rank ASC;

-- Check analysis status
SELECT analysis_status, progress_percent, total_transactions, error_message
FROM wallet_analyses
WHERE wallet_address = 'WALLET_ADDRESS';
*/
