require('dotenv').config();

const { query, pool } = require('../src/config/database');
const PNLCalculator = require('../src/services/pnl');
const HighlightsGenerator = require('../src/services/highlights');

const walletAddress = '5xY5tp2bgbcejpNFryr5evcwEBBaQGutnbndhm4rRcv4';

async function recalculate() {
  console.log('Fetching transactions from database...');

  // Get all transactions for this wallet
  const result = await query(`
    SELECT signature, block_time, transaction_type, token_mint, token_symbol,
           sol_amount, token_amount, price_sol, fee_sol, is_estimated, raw_data
    FROM transactions
    WHERE wallet_address = $1
    ORDER BY block_time ASC
  `, [walletAddress]);

  console.log(`Found ${result.rows.length} transactions`);

  // Convert to the format PNLCalculator expects
  const transactions = result.rows.map(row => ({
    signature: row.signature,
    blockTime: row.block_time,
    type: row.transaction_type,
    tokenMint: row.token_mint,
    tokenSymbol: row.token_symbol,
    solAmount: parseFloat(row.sol_amount) || 0,
    tokenAmount: parseFloat(row.token_amount) || 0,
    priceSol: parseFloat(row.price_sol) || 0,
    feeSol: parseFloat(row.fee_sol) || 0,
    isEstimated: row.is_estimated,
    rawData: row.raw_data
  }));

  console.log('Calculating P&L...');
  const { positions, dailyPNL, summary } = await PNLCalculator.calculate(transactions, walletAddress);

  console.log('\n=== Summary ===');
  console.log('Total Realized P&L:', summary.totalRealizedPNL.toFixed(4), 'SOL');
  console.log('Total Unrealized P&L:', summary.totalUnrealizedPNL.toFixed(4), 'SOL');
  console.log('Total P&L:', summary.totalPNL.toFixed(4), 'SOL');
  console.log('Win Rate:', summary.winRate, '%');
  console.log('Closed Positions:', summary.closedPositions);
  console.log('Active Positions:', summary.activePositions);

  // Find biggest loss
  const biggestLoss = Object.values(positions)
    .filter(p => p.realizedPNL < 0)
    .sort((a, b) => a.realizedPNL - b.realizedPNL)[0];

  if (biggestLoss) {
    console.log('\nBiggest Loss:', biggestLoss.tokenSymbol, biggestLoss.realizedPNL.toFixed(4), 'SOL');
  }

  // Save positions to database
  console.log('\nSaving positions to database...');
  for (const [mint, pos] of Object.entries(positions)) {
    await query(`
      INSERT INTO token_positions (
        wallet_address, token_mint, token_symbol, sol_spent, sol_received,
        tokens_bought, tokens_sold, current_balance, realized_pnl_sol,
        unrealized_pnl_sol, current_value_sol, current_price_sol,
        avg_buy_price, avg_sell_price, buy_lots, first_trade_date,
        last_trade_date, is_active, trade_count
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      ON CONFLICT (wallet_address, token_mint) DO UPDATE SET
        token_symbol = $3, sol_spent = $4, sol_received = $5,
        tokens_bought = $6, tokens_sold = $7, current_balance = $8,
        realized_pnl_sol = $9, unrealized_pnl_sol = $10, current_value_sol = $11,
        current_price_sol = $12, avg_buy_price = $13, avg_sell_price = $14,
        buy_lots = $15, first_trade_date = $16, last_trade_date = $17,
        is_active = $18, trade_count = $19, updated_at = NOW()
    `, [
      walletAddress, mint, pos.tokenSymbol, pos.solSpent, pos.solReceived,
      pos.tokensBought, pos.tokensSold, pos.currentBalance, pos.realizedPNL,
      pos.unrealizedPNL, pos.currentValueSol, pos.currentPriceSol,
      pos.avgBuyPrice, pos.avgSellPrice, JSON.stringify(pos.buyLots),
      pos.firstTradeDate, pos.lastTradeDate, pos.isActive, pos.trades?.length || 0
    ]);
  }

  console.log('Generating highlights...');
  const highlights = await HighlightsGenerator.generate(positions, transactions, dailyPNL, summary);

  console.log('\n=== Highlights ===');
  for (const h of highlights) {
    console.log(`${h.title}: ${h.valuePrimary} (${h.type})`);
  }

  // Save highlights
  console.log('\nSaving highlights...');
  await query('DELETE FROM highlights WHERE wallet_address = $1', [walletAddress]);

  for (const h of highlights) {
    await query(`
      INSERT INTO highlights (
        wallet_address, highlight_type, title, description,
        value_primary, value_secondary, metadata, rank
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      walletAddress, h.type, h.title, h.description,
      h.valuePrimary, h.valueSecondary, JSON.stringify(h.metadata), h.rank
    ]);
  }

  console.log('\nDone! Recalculation complete.');

  // Verify the fix
  const verifyResult = await query(`
    SELECT highlight_type, title, value_primary
    FROM highlights
    WHERE wallet_address = $1
    AND highlight_type IN ('biggest_realized_loss', 'total_realized_pnl')
  `, [walletAddress]);

  console.log('\n=== Verification ===');
  for (const row of verifyResult.rows) {
    console.log(`${row.highlight_type}: ${row.value_primary}`);
  }

  pool.end();
}

recalculate().catch(e => {
  console.error('Error:', e);
  pool.end();
  process.exit(1);
});
