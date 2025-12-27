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
const activeAnalyses = new Map(); // walletAddress -> { abortController, startTime }

// Socket.io instance (set by server)
let io = null;

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
  activeAnalyses.set(walletAddress, { abortController, startTime });

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

    const analysisResult = await analyzer.call(
      WalletAnalyzer,
      walletAddress,
      (percent, message, details = {}) => {
        // Check for cancellation on each progress update
        if (abortController.signal.aborted) {
          throw new Error('Analysis cancelled');
        }
        emitProgress(walletAddress, percent, message, details);
        DatabaseQueries.updateAnalysisProgress(
          walletAddress,
          'processing',
          Math.round(percent)
        ).catch(err => console.error('Failed to update DB progress:', err));
      }
    );

    // If cached result, return early
    if (analysisResult.cached) {
      await emitProgress(walletAddress, 100, 'Using cached results');
      await emitComplete(walletAddress, analysisResult);
      return analysisResult;
    }

    // Generate highlights (85-95%)
    await emitProgress(walletAddress, 85, 'Generating highlights...');

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

    await emitProgress(walletAddress, 90, 'Saving highlights...');

    // Save highlights to database
    for (const highlight of highlights) {
      if (abortController.signal.aborted) {
        throw new Error('Analysis cancelled');
      }
      await DatabaseQueries.upsertHighlight(walletAddress, highlight);
    }

    await emitProgress(walletAddress, 95, 'Warming cache...');

    // Warm cache for fast subsequent requests
    await CacheManager.warmWalletCache(walletAddress, {
      summary: JSON.stringify(summary),
      highlights: JSON.stringify(highlights),
      dailyPNL: JSON.stringify(dailyPNL)
    });

    await emitProgress(walletAddress, 100, 'Analysis complete!');

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
    // Always clean up
    activeAnalyses.delete(walletAddress);
    await RateLimiter.releaseDuplicateLock(walletAddress);
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
