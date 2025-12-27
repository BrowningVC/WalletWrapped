#!/usr/bin/env node
/**
 * Batch Highlights Refresh Script
 *
 * Regenerates highlights for all completed wallet analyses.
 * Run this after pushing code updates to apply changes to existing wallets.
 *
 * Usage:
 *   node scripts/refresh-all-highlights.js           # Refresh all wallets
 *   node scripts/refresh-all-highlights.js --dry-run # Preview without saving
 *   node scripts/refresh-all-highlights.js <address> # Refresh specific wallet
 */

require('dotenv').config();

const { query, pool } = require('../src/config/database');
const PNLCalculator = require('../src/services/pnl');
const HighlightsGenerator = require('../src/services/highlights');
const CacheManager = require('../src/utils/cacheManager');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const specificWallet = args.find(a => !a.startsWith('--'));

async function getWalletsToRefresh() {
  if (specificWallet) {
    return [{ wallet_address: specificWallet }];
  }

  // Get all completed analyses
  const result = await query(`
    SELECT wallet_address, total_transactions, updated_at
    FROM wallet_analyses
    WHERE analysis_status = 'completed'
    ORDER BY updated_at DESC
  `);

  return result.rows;
}

async function refreshWalletHighlights(walletAddress) {
  // Get all transactions for this wallet
  const txResult = await query(`
    SELECT signature, block_time, transaction_type, token_mint, token_symbol,
           sol_amount, token_amount, price_sol, fee_sol, is_estimated, raw_data
    FROM transactions
    WHERE wallet_address = $1
    ORDER BY block_time ASC
  `, [walletAddress]);

  if (txResult.rows.length === 0) {
    return { success: false, error: 'No transactions found' };
  }

  // Convert to the format PNLCalculator expects
  const transactions = txResult.rows.map(row => ({
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

  // Recalculate P&L
  const { positions, dailyPNL, summary } = await PNLCalculator.calculate(transactions, walletAddress);

  // Generate new highlights
  const highlights = await HighlightsGenerator.generate(positions, transactions, dailyPNL, summary);

  if (dryRun) {
    return {
      success: true,
      highlightCount: highlights.length,
      highlights: highlights.map(h => ({ type: h.type, value: h.valuePrimary })),
      dryRun: true
    };
  }

  // Delete old highlights
  await query('DELETE FROM highlights WHERE wallet_address = $1', [walletAddress]);

  // Save new highlights
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

  // Clear cache for this wallet
  try {
    await CacheManager.invalidateWallet(walletAddress);
  } catch (e) {
    // Cache clear failed, not critical
  }

  return { success: true, highlightCount: highlights.length };
}

async function main() {
  console.log('===========================================');
  console.log('  Batch Highlights Refresh');
  console.log('===========================================');

  if (dryRun) {
    console.log('  Mode: DRY RUN (no changes will be saved)');
  }
  console.log('');

  const wallets = await getWalletsToRefresh();
  console.log(`Found ${wallets.length} wallet(s) to refresh\n`);

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < wallets.length; i++) {
    const wallet = wallets[i];
    const shortAddr = `${wallet.wallet_address.slice(0, 4)}...${wallet.wallet_address.slice(-4)}`;

    process.stdout.write(`[${i + 1}/${wallets.length}] ${shortAddr}: `);

    try {
      const result = await refreshWalletHighlights(wallet.wallet_address);

      if (result.success) {
        successCount++;
        console.log(`✓ ${result.highlightCount} highlights${result.dryRun ? ' (dry run)' : ''}`);

        if (dryRun && result.highlights) {
          result.highlights.forEach(h => {
            console.log(`    - ${h.type}: ${h.value}`);
          });
        }
      } else {
        failCount++;
        console.log(`✗ ${result.error}`);
      }
    } catch (error) {
      failCount++;
      console.log(`✗ Error: ${error.message}`);
    }
  }

  console.log('\n===========================================');
  console.log(`  Complete: ${successCount} success, ${failCount} failed`);
  console.log('===========================================');

  pool.end();
}

main().catch(e => {
  console.error('Fatal error:', e);
  pool.end();
  process.exit(1);
});
