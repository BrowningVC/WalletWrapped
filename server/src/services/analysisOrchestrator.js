const WalletAnalyzer = require('./analyzer');
const HighlightsGenerator = require('./highlights');
const DatabaseQueries = require('../database/queries');
const CacheManager = require('../utils/cacheManager');
const RateLimiter = require('../utils/rateLimiter');

/**
 * Analysis Orchestrator - Manages concurrent wallet analyses without queuing
 *
 * Key features:
 * - Direct async execution (no Bull queue)
 * - Cancellation support via AbortController
 * - Progress tracking via Socket.io and Redis
 * - Automatic cleanup on completion/failure
 */

// Track active analyses for cancellation support
// walletAddress -> { abortController, startTime, cleanedUp }
const activeAnalyses = new Map();

// Constants for cleanup
// With 30k tx limit: ~40 minutes max + 5 minute buffer = 45 minutes
const MAX_ANALYSIS_DURATION = parseInt(process.env.MAX_ANALYSIS_DURATION) || 45 * 60 * 1000; // 45 minutes max
const CLEANUP_INTERVAL = 10 * 60 * 1000; // Check for stale entries every 10 minutes

// Socket.io instance (set by server)
let io = null;

// Periodic cleanup of stale entries - marks as cleaned to prevent double-cleanup
setInterval(() => {
  const now = Date.now();
  let cleanedCount = 0;

  for (const [address, data] of activeAnalyses.entries()) {
    // Skip if already cleaned up by another process
    if (data.cleanedUp) continue;

    const age = now - data.startTime;
    if (age > MAX_ANALYSIS_DURATION) {
      console.warn(`Cleaning up stale analysis entry: ${address} (age: ${Math.round(age / 1000 / 60)}min)`);
      // Mark as cleaned up first to prevent race conditions
      data.cleanedUp = true;
      data.abortController.abort();
      activeAnalyses.delete(address);
      // Release lock without awaiting to prevent blocking
      RateLimiter.releaseDuplicateLock(address).catch(err =>
        console.error(`Failed to release lock for ${address}:`, err)
      );
      cleanedCount++;
    }
  }

  if (cleanedCount > 0) {
    console.log(`Cleaned up ${cleanedCount} stale analysis entries`);
  }
}, CLEANUP_INTERVAL);

/**
 * Set Socket.io instance for progress updates
 */
function setSocketIO(socketIoInstance) {
  io = socketIoInstance;
  console.log('Socket.io connected to analysis orchestrator');
}

/**
 * Get stage info from progress percentage
 */
function getStageFromPercent(percent) {
  if (percent < 5) return { stage: 'initializing', step: 1, label: 'Initializing' };
  if (percent < 40) return { stage: 'fetching', step: 2, label: 'Fetching Transactions' };
  if (percent < 50) return { stage: 'parsing', step: 3, label: 'Parsing Transactions' };
  if (percent < 70) return { stage: 'calculating', step: 4, label: 'Calculating P&L' };
  if (percent < 85) return { stage: 'saving', step: 5, label: 'Saving Results' };
  if (percent < 95) return { stage: 'highlights', step: 6, label: 'Generating Highlights' };
  return { stage: 'completing', step: 6, label: 'Completing' };
}

/**
 * Emit progress update via Socket.io and Redis
 * @param {string} walletAddress - Wallet being analyzed
 * @param {number} percent - Progress percentage (0-100)
 * @param {string} message - Status message
 * @param {object} details - Optional detailed progress info
 */
async function emitProgress(walletAddress, percent, message, details = {}) {
  const stageInfo = getStageFromPercent(percent);

  const data = {
    percent: Math.round(percent * 100) / 100,
    message,
    timestamp: new Date().toISOString(),
    // Stage information
    stage: stageInfo.stage,
    stageLabel: stageInfo.label,
    currentStep: stageInfo.step,
    totalSteps: 6,
    // Transaction counts (if provided)
    transactionsFetched: details.fetched || null,
    transactionsTotal: details.total || null,
    transactionsProcessed: details.processed || null,
    // Start time for duration calculation on client
    startTime: activeAnalyses.get(walletAddress)?.startTime || null,
  };

  if (io) {
    io.to(`analysis:${walletAddress}`).emit('progress', data);
  }

  await CacheManager.setAnalysisProgress(walletAddress, JSON.stringify(data));
  console.log(`[${walletAddress}] ${percent.toFixed(1)}% - ${message}`);
}

/**
 * Emit completion event
 */
async function emitComplete(walletAddress, result) {
  const data = {
    status: 'completed',
    result,
    timestamp: new Date().toISOString()
  };

  if (io) {
    io.to(`analysis:${walletAddress}`).emit('complete', data);
  }

  await CacheManager.clearAnalysisProgress(walletAddress);
  console.log(`[${walletAddress}] Analysis complete!`);
}

/**
 * Emit error event
 */
async function emitError(walletAddress, error) {
  const data = {
    status: 'failed',
    error: error.message,
    timestamp: new Date().toISOString()
  };

  if (io) {
    io.to(`analysis:${walletAddress}`).emit('error', data);
  }

  await CacheManager.clearAnalysisProgress(walletAddress);
  console.error(`[${walletAddress}] Analysis failed:`, error);
}

/**
 * Run wallet analysis - executes directly without queuing
 * Multiple analyses run truly concurrently
 *
 * @param {string} walletAddress - Solana wallet address
 * @param {boolean} incremental - Use incremental mode if true
 */
async function runAnalysis(walletAddress, incremental = false) {
  const startTime = Date.now();
  const abortController = new AbortController();

  // Track this analysis for cancellation support
  const analysisState = { abortController, startTime, cleanedUp: false };
  activeAnalyses.set(walletAddress, analysisState);

  // Safety timeout - force cleanup after max duration
  const cleanupTimeout = setTimeout(() => {
    // Check if already cleaned up to prevent double-cleanup
    if (analysisState.cleanedUp) return;

    console.error(`Analysis timeout for ${walletAddress}, forcing cleanup`);
    analysisState.cleanedUp = true;
    abortController.abort();
    activeAnalyses.delete(walletAddress);
    RateLimiter.releaseDuplicateLock(walletAddress).catch(err =>
      console.error(`Timeout cleanup lock release failed:`, err)
    );
  }, MAX_ANALYSIS_DURATION);

  try {
    console.log(`\n========================================`);
    console.log(`Starting analysis: ${walletAddress}`);
    console.log(`Mode: ${incremental ? 'Incremental' : 'Full'}`);
    console.log(`Active analyses: ${activeAnalyses.size}`);
    console.log(`========================================\n`);

    // Update database status
    await DatabaseQueries.createAnalysis(walletAddress);
    await DatabaseQueries.updateAnalysisProgress(walletAddress, 'processing', 0);

    await emitProgress(walletAddress, 0, 'Initializing analysis...');

    // Check for cancellation
    if (abortController.signal.aborted) {
      throw new Error('Analysis cancelled');
    }

    // Run the analysis
    const analyzer = incremental
      ? WalletAnalyzer.analyzeWalletIncremental
      : WalletAnalyzer.analyzeWallet;

    // Track transaction count from progress updates
    let lastTransactionCount = null;

    const analysisResult = await analyzer.call(
      WalletAnalyzer,
      walletAddress,
      (percent, message, details = {}) => {
        // Check for cancellation on each progress update
        if (abortController.signal.aborted) {
          throw new Error('Analysis cancelled');
        }
        // Track transaction count for later progress updates
        if (details.fetched) {
          lastTransactionCount = details.fetched;
        }
        emitProgress(walletAddress, percent, message, details);
        DatabaseQueries.updateAnalysisProgress(
          walletAddress,
          'processing',
          Math.round(percent)
        ).catch(err => console.error('Failed to update DB progress:', err));
      }
    );

    // Helper to include transaction count in progress updates
    const txDetails = lastTransactionCount ? { fetched: lastTransactionCount, total: lastTransactionCount, processed: lastTransactionCount } : {};

    // If cached result, return early
    if (analysisResult.cached) {
      await emitProgress(walletAddress, 100, 'Using cached results', txDetails);
      await emitComplete(walletAddress, analysisResult);
      return analysisResult;
    }

    // Generate highlights (85-95%)
    await emitProgress(walletAddress, 85, 'Generating highlights...', txDetails);

    if (abortController.signal.aborted) {
      throw new Error('Analysis cancelled');
    }

    // Use positions from analysis result if available (includes trades array for highlight calculations)
    // Fall back to fetching from database with trades for incremental updates
    let positionsMap = analysisResult.positions;
    let summary = analysisResult.summary;

    // If positions not in result (shouldn't happen but be safe), fetch from DB with trades
    if (!positionsMap) {
      positionsMap = await WalletAnalyzer.getPositionsWithTrades(walletAddress);
      summary = await WalletAnalyzer.getAnalysisSummary(walletAddress);
    }

    // Get daily P&L for current year
    const currentYear = new Date().getFullYear();
    const dailyPNLRows = await DatabaseQueries.getDailyPNL(walletAddress, currentYear);
    const dailyPNL = dailyPNLRows.reduce((acc, row) => {
      acc[row.date.toISOString().split('T')[0]] = {
        realizedPNLSol: parseFloat(row.realized_pnl_sol),
        realizedPNLUsd: parseFloat(row.realized_pnl_usd),
        transactionCount: row.transaction_count,
        tokensTraded: new Set()
      };
      return acc;
    }, {});

    const highlights = await HighlightsGenerator.generate(
      positionsMap,
      [],
      dailyPNL,
      summary
    );

    await emitProgress(walletAddress, 90, 'Saving highlights...', txDetails);

    // Save highlights to database
    for (const highlight of highlights) {
      if (abortController.signal.aborted) {
        throw new Error('Analysis cancelled');
      }
      await DatabaseQueries.upsertHighlight(walletAddress, highlight);
    }

    await emitProgress(walletAddress, 95, 'Warming cache...', txDetails);

    // Warm cache for fast subsequent requests
    await CacheManager.warmWalletCache(walletAddress, {
      summary: JSON.stringify(summary),
      highlights: JSON.stringify(highlights),
      dailyPNL: JSON.stringify(dailyPNL)
    });

    await emitProgress(walletAddress, 96, 'Generating your year into PNL cards...', txDetails);

    // Pre-generate and cache all card images for instant loading
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';

    // Generate all 6 cards + summary in parallel, fetch PNG and cache in Redis
    const cardPromises = [0, 1, 2, 3, 4, 5, 'summary'].map(async (cardIndex) => {
      try {
        const url = cardIndex === 'summary'
          ? `${clientUrl}/api/card/${walletAddress}/summary`
          : `${clientUrl}/api/card/${walletAddress}/${cardIndex}`;

        const response = await fetch(url);
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          await CacheManager.cacheCardImage(walletAddress, cardIndex, buffer);
          return { cardIndex, success: true };
        }
        return { cardIndex, success: false, error: `HTTP ${response.status}` };
      } catch (err) {
        return { cardIndex, success: false, error: err.message };
      }
    });

    const cardResults = await Promise.all(cardPromises);
    const successCount = cardResults.filter(r => r.success).length;
    const failedCards = cardResults.filter(r => !r.success);

    if (failedCards.length > 0) {
      console.warn(`Some cards failed to pre-generate for ${walletAddress}:`, failedCards);
    }
    console.log(`Pre-generated ${successCount}/7 card images for ${walletAddress}`);

    await emitProgress(walletAddress, 100, 'Analysis complete!', txDetails);

    // Update database status to completed
    await DatabaseQueries.updateAnalysisProgress(walletAddress, 'completed', 100, 'Analysis complete!');

    const duration = Date.now() - startTime;

    const result = {
      walletAddress,
      status: 'completed',
      transactionCount: analysisResult.transactionCount,
      positionCount: analysisResult.positionCount,
      highlightCount: highlights.length,
      duration,
      summary
    };

    await emitComplete(walletAddress, result);

    console.log(`\n========================================`);
    console.log(`Analysis completed: ${walletAddress}`);
    console.log(`Duration: ${duration}ms`);
    console.log(`Transactions: ${result.transactionCount}`);
    console.log(`Positions: ${result.positionCount}`);
    console.log(`Highlights: ${result.highlightCount}`);
    console.log(`Active analyses remaining: ${activeAnalyses.size - 1}`);
    console.log(`========================================\n`);

    return result;

  } catch (error) {
    console.error(`Analysis failed for ${walletAddress}:`, error);

    await DatabaseQueries.updateAnalysisProgress(
      walletAddress,
      'failed',
      0,
      error.message
    );

    await emitError(walletAddress, error);
    throw error;

  } finally {
    // Always clear the timeout
    clearTimeout(cleanupTimeout);

    // Only clean up if not already done by timeout or interval cleanup
    if (!analysisState.cleanedUp) {
      analysisState.cleanedUp = true;
      activeAnalyses.delete(walletAddress);
      await RateLimiter.releaseDuplicateLock(walletAddress).catch(err =>
        console.error(`Finally block lock release failed for ${walletAddress}:`, err)
      );
    }
  }
}

/**
 * Cancel a running analysis
 * @param {string} walletAddress
 * @returns {boolean} - true if analysis was cancelled
 */
function cancelAnalysis(walletAddress) {
  const analysis = activeAnalyses.get(walletAddress);
  if (!analysis) {
    return false;
  }

  analysis.abortController.abort();
  console.log(`Cancelled analysis for ${walletAddress}`);
  return true;
}

/**
 * Get count of active analyses
 */
function getActiveCount() {
  return activeAnalyses.size;
}

/**
 * Get list of active wallet addresses being analyzed
 */
function getActiveWallets() {
  return Array.from(activeAnalyses.keys());
}

module.exports = {
  runAnalysis,
  cancelAnalysis,
  setSocketIO,
  getActiveCount,
  getActiveWallets
};
