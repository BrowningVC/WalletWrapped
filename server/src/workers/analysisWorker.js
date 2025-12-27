const { analysisQueue } = require('./queue');
const WalletAnalyzer = require('../services/analyzer');
const HighlightsGenerator = require('../services/highlights');
const DatabaseQueries = require('../database/queries');
const CacheManager = require('../utils/cacheManager');

/**
 * Analysis Worker - Processes wallet analysis jobs in background
 * Emits real-time progress via Socket.io
 */

let io = null; // Socket.io instance (set by server)

/**
 * Set Socket.io instance for progress updates
 * @param {SocketIO.Server} socketIoInstance
 */
function setSocketIO(socketIoInstance) {
  io = socketIoInstance;
  console.log('Socket.io connected to analysis worker');
}

/**
 * Emit progress update via Socket.io and Redis
 * @param {string} walletAddress
 * @param {number} percent - Progress percentage (0-100)
 * @param {string} message - Status message
 */
async function emitProgress(walletAddress, percent, message) {
  const data = {
    percent: Math.round(percent * 100) / 100, // Round to 2 decimals
    message,
    timestamp: new Date().toISOString()
  };

  // Emit via Socket.io
  if (io) {
    io.to(`analysis:${walletAddress}`).emit('progress', data);
  }

  // Store in Redis for reconnection
  await CacheManager.setAnalysisProgress(walletAddress, JSON.stringify(data));

  console.log(`[${walletAddress}] ${percent.toFixed(1)}% - ${message}`);
}

/**
 * Emit completion event
 * @param {string} walletAddress
 * @param {Object} result
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
 * @param {string} walletAddress
 * @param {Error} error
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
 * Main wallet analysis job processor
 */
analysisQueue.process('analyzeWallet', async (job) => {
  const { walletAddress, incremental } = job.data;
  const startTime = Date.now();

  try {
    console.log(`\n========================================`);
    console.log(`Starting analysis: ${walletAddress}`);
    console.log(`Mode: ${incremental ? 'Incremental' : 'Full'}`);
    console.log(`========================================\n`);

    // Update database status
    await DatabaseQueries.createAnalysis(walletAddress);
    await DatabaseQueries.updateAnalysisProgress(walletAddress, 'processing', 0);

    // Step 1: Check cache and decide analysis strategy
    await emitProgress(walletAddress, 0, 'Initializing analysis...');

    const analyzer = incremental
      ? WalletAnalyzer.analyzeWalletIncremental
      : WalletAnalyzer.analyzeWallet;

    // Step 2: Run analysis with progress callbacks
    const analysisResult = await analyzer.call(
      WalletAnalyzer,
      walletAddress,
      (percent, message) => {
        // Update job progress (for Bull dashboard)
        job.progress(percent);

        // Emit to frontend
        emitProgress(walletAddress, percent, message);

        // Update database
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

    // Step 3: Generate highlights (85-95%)
    await emitProgress(walletAddress, 85, 'Generating highlights...');

    const positions = await DatabaseQueries.getPositions(walletAddress);
    const positionsMap = WalletAnalyzer.convertPositionsToMap(positions);

    const summary = await WalletAnalyzer.getAnalysisSummary(walletAddress);

    // Get daily P&L for current year
    const currentYear = new Date().getFullYear();
    const dailyPNLRows = await DatabaseQueries.getDailyPNL(walletAddress, currentYear);
    const dailyPNL = dailyPNLRows.reduce((acc, row) => {
      acc[row.date.toISOString().split('T')[0]] = {
        realizedPNLSol: parseFloat(row.realized_pnl_sol),
        realizedPNLUsd: parseFloat(row.realized_pnl_usd),
        transactionCount: row.transaction_count,
        tokensTraded: new Set() // Can't reconstruct from DB
      };
      return acc;
    }, {});

    const highlights = await HighlightsGenerator.generate(
      positionsMap,
      [], // Don't need raw transactions for highlights
      dailyPNL,
      summary
    );

    await emitProgress(walletAddress, 90, 'Saving highlights...');

    // Step 4: Save highlights to database
    for (const highlight of highlights) {
      await DatabaseQueries.upsertHighlight(walletAddress, highlight);
    }

    await emitProgress(walletAddress, 95, 'Warming cache...');

    // Step 5: Warm cache for fast subsequent requests
    await CacheManager.warmWalletCache(walletAddress, {
      summary: JSON.stringify(summary),
      highlights: JSON.stringify(highlights),
      dailyPNL: JSON.stringify(dailyPNL)
    });

    await emitProgress(walletAddress, 100, 'Analysis complete!');

    // Update database status to completed
    await DatabaseQueries.updateAnalysisProgress(walletAddress, 'completed', 100, 'Analysis complete!');

    // Calculate final duration
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

    // Emit completion
    await emitComplete(walletAddress, result);

    console.log(`\n========================================`);
    console.log(`Analysis completed: ${walletAddress}`);
    console.log(`Duration: ${duration}ms`);
    console.log(`Transactions: ${result.transactionCount}`);
    console.log(`Positions: ${result.positionCount}`);
    console.log(`Highlights: ${result.highlightCount}`);
    console.log(`========================================\n`);

    return result;

  } catch (error) {
    console.error(`Analysis failed for ${walletAddress}:`, error);

    // Update database status
    await DatabaseQueries.updateAnalysisProgress(
      walletAddress,
      'failed',
      0,
      error.message
    );

    // Emit error to frontend
    await emitError(walletAddress, error);

    // Re-throw for Bull to handle retry logic
    throw error;
  }
});

/**
 * Handle job completion
 */
analysisQueue.on('completed', async (job, result) => {
  console.log(`✓ Job ${job.id} completed successfully`);
});

/**
 * Handle job failure (after all retries exhausted)
 */
analysisQueue.on('failed', async (job, err) => {
  console.error(`✗ Job ${job.id} failed after ${job.attemptsMade} attempts:`, err.message);

  // Ensure database and frontend are notified
  const { walletAddress } = job.data;
  await DatabaseQueries.updateAnalysisProgress(
    walletAddress,
    'failed',
    0,
    err.message
  );
  await emitError(walletAddress, err);
});

/**
 * Handle job retry
 */
analysisQueue.on('retrying', (job, err) => {
  console.warn(`⟳ Job ${job.id} retrying (attempt ${job.attemptsMade + 1}):`, err.message);
});

/**
 * Start worker
 */
function startWorker() {
  console.log('🚀 Analysis worker started');
  console.log('Waiting for jobs...\n');
}

module.exports = {
  startWorker,
  setSocketIO
};
