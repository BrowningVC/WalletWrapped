const express = require('express');
const router = express.Router();
const { PublicKey } = require('@solana/web3.js');
const DatabaseQueries = require('../database/queries');
const CacheManager = require('../utils/cacheManager');
const RateLimiter = require('../utils/rateLimiter');
const AnalysisOrchestrator = require('../services/analysisOrchestrator');
const { validateCSRFToken } = require('../middleware/csrf');
const QueueManager = require('../utils/queueManager');
const SystemMonitor = require('../utils/monitor');

/**
 * Validate Solana wallet address
 * @param {string} address
 * @returns {boolean}
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
 * POST /api/analyze
 * Start new wallet analysis or return existing status
 *
 * Body: { walletAddress: string }
 * Headers: { X-CSRF-Token: string } (required in production)
 *
 * Returns:
 * - 200: Analysis queued/in-progress/completed
 * - 400: Invalid wallet address
 * - 403: CSRF token invalid/missing
 * - 429: Rate limit exceeded
 * - 500: Server error
 */
router.post('/analyze', validateCSRFToken, async (req, res) => {
  try {
    const { walletAddress } = req.body;

    // Validate address format
    if (!walletAddress || typeof walletAddress !== 'string') {
      return res.status(400).json({
        error: 'Missing wallet address',
        message: 'Please provide a valid Solana wallet address'
      });
    }

    const trimmedAddress = walletAddress.trim();

    if (!isValidSolanaAddress(trimmedAddress)) {
      return res.status(400).json({
        error: 'Invalid wallet address',
        message: 'The provided address is not a valid Solana wallet address'
      });
    }

    // Check rate limit (10 requests per minute per IP)
    const clientIp = req.ip || req.connection.remoteAddress;
    const rateLimit = await RateLimiter.checkLimit(`analyze:${clientIp}`, 10, 60000);

    if (!rateLimit.allowed) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: `Too many requests. Please try again in ${Math.ceil(rateLimit.retryAfter / 1000)} seconds`,
        retryAfter: rateLimit.retryAfter
      });
    }

    // Check for existing analysis
    const existing = await DatabaseQueries.getAnalysis(trimmedAddress);

    if (existing) {
      const age = Date.now() - new Date(existing.completed_at || existing.started_at).getTime();
      const isStale = age > 24 * 60 * 60 * 1000; // 24 hours

      // If recent and completed, return cached result
      if (existing.analysis_status === 'completed' && !isStale) {
        return res.json({
          status: 'completed',
          cached: true,
          progress: 100,
          message: 'Analysis already completed',
          completedAt: existing.completed_at,
          transactionCount: existing.total_transactions
        });
      }

      // If currently processing, return status
      if (existing.analysis_status === 'processing') {
        // Get progress from cache
        const progress = await CacheManager.getAnalysisProgress(trimmedAddress);
        const progressData = progress ? JSON.parse(progress) : null;

        return res.json({
          status: 'processing',
          progress: existing.progress_percent || 0,
          message: progressData?.message || 'Analysis in progress...',
          startedAt: existing.started_at
        });
      }

      // If failed, allow retry
      if (existing.analysis_status === 'failed') {
        console.log(`Retrying failed analysis for ${trimmedAddress}`);
      }
    }

    // Prevent duplicate concurrent analyses
    const hasLock = await RateLimiter.preventDuplicateAnalysis(trimmedAddress);
    if (!hasLock) {
      // Analysis already in progress (from another request)
      return res.json({
        status: 'processing',
        progress: 0,
        message: 'Analysis already in progress'
      });
    }

    // Check if we should queue the request due to capacity
    const shouldQueue = await QueueManager.shouldQueue();
    const isIncremental = existing && existing.analysis_status === 'completed';

    if (shouldQueue) {
      // Queue is at capacity - add to queue
      const queueInfo = await QueueManager.addToQueue(trimmedAddress, clientIp);

      return res.json({
        status: 'queued',
        progress: 0,
        message: `Queued - Position ${queueInfo.position} in line`,
        jobId: queueInfo.jobId,
        queuePosition: queueInfo.position,
        estimatedWaitTime: queueInfo.estimatedWaitTime,
        walletAddress: trimmedAddress
      });
    }

    // Record analysis start for monitoring
    await SystemMonitor.recordAnalysisStart(trimmedAddress, clientIp);

    // Fire and forget - analysis runs in background, client polls for status
    const startTime = Date.now();
    AnalysisOrchestrator.runAnalysis(trimmedAddress, isIncremental)
      .then(() => {
        const duration = Date.now() - startTime;
        SystemMonitor.recordAnalysisComplete(trimmedAddress, duration, true);
      })
      .catch(err => {
        console.error(`Analysis failed for ${trimmedAddress}:`, err);
        const duration = Date.now() - startTime;
        SystemMonitor.recordAnalysisComplete(trimmedAddress, duration, false);
      });

    res.json({
      status: 'processing',
      progress: 0,
      message: 'Analysis started',
      walletAddress: trimmedAddress
    });

  } catch (error) {
    console.error('Analyze endpoint error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to start wallet analysis'
    });
  }
});

/**
 * GET /api/analyze/:address/status
 * Get current analysis status and progress
 *
 * Returns:
 * - 200: Current status
 * - 400: Invalid address
 * - 404: Analysis not found
 */
router.get('/analyze/:address/status', async (req, res) => {
  try {
    const { address } = req.params;

    if (!isValidSolanaAddress(address)) {
      return res.status(400).json({
        error: 'Invalid wallet address'
      });
    }

    // Check database for analysis record
    const analysis = await DatabaseQueries.getAnalysis(address);

    if (!analysis) {
      return res.status(404).json({
        error: 'Analysis not found',
        message: 'No analysis found for this wallet address'
      });
    }

    // Get real-time progress from cache if processing
    let progressData = null;
    if (analysis.analysis_status === 'processing') {
      const progress = await CacheManager.getAnalysisProgress(address);
      if (progress) {
        progressData = JSON.parse(progress);
      }
    }

    res.json({
      status: analysis.analysis_status,
      progress: progressData?.percent || analysis.progress_percent || 0,
      message: progressData?.message || getStatusMessage(analysis.analysis_status),
      startedAt: analysis.started_at,
      completedAt: analysis.completed_at,
      transactionCount: analysis.total_transactions,
      error: analysis.error_message
    });

  } catch (error) {
    console.error('Status endpoint error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get analysis status'
    });
  }
});

/**
 * DELETE /api/analyze/:address
 * Cancel ongoing analysis
 *
 * Headers: { X-CSRF-Token: string } (required in production)
 *
 * Returns:
 * - 200: Analysis cancelled
 * - 400: Invalid address or analysis not cancellable
 * - 403: CSRF token invalid/missing
 * - 404: Analysis not found
 */
router.delete('/analyze/:address', validateCSRFToken, async (req, res) => {
  try {
    const { address } = req.params;

    if (!isValidSolanaAddress(address)) {
      return res.status(400).json({
        error: 'Invalid wallet address'
      });
    }

    // Cancel running analysis
    const cancelled = AnalysisOrchestrator.cancelAnalysis(address);

    if (!cancelled) {
      return res.status(400).json({
        error: 'Cannot cancel analysis',
        message: 'Analysis is not currently running or already completed'
      });
    }

    // Update database
    await DatabaseQueries.updateAnalysisProgress(address, 'cancelled', 0);

    // Release the lock
    await RateLimiter.releaseDuplicateLock(address);

    res.json({
      success: true,
      message: 'Analysis cancelled'
    });

  } catch (error) {
    console.error('Cancel endpoint error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to cancel analysis'
    });
  }
});

/**
 * Helper: Get human-readable status message
 */
function getStatusMessage(status) {
  const messages = {
    'pending': 'Analysis queued',
    'processing': 'Analyzing wallet...',
    'completed': 'Analysis complete',
    'failed': 'Analysis failed',
    'cancelled': 'Analysis cancelled'
  };
  return messages[status] || 'Unknown status';
}

module.exports = router;
