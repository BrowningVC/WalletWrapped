const express = require('express');
const router = express.Router();
const SystemMonitor = require('../utils/monitor');
const QueueManager = require('../utils/queueManager');
const RateLimiter = require('../utils/rateLimiter');

/**
 * Monitoring Routes - Real-time system metrics and status
 */

/**
 * GET /api/monitor/status
 * Get comprehensive system status
 */
router.get('/status', async (req, res) => {
  try {
    const status = await SystemMonitor.getSystemStatus();
    res.json(status);
  } catch (error) {
    console.error('Error getting system status:', error);
    res.status(500).json({ error: 'Failed to get system status' });
  }
});

/**
 * GET /api/monitor/queue
 * Get queue statistics
 */
router.get('/queue', async (req, res) => {
  try {
    const queueStats = await QueueManager.getQueueStats();
    res.json(queueStats);
  } catch (error) {
    console.error('Error getting queue stats:', error);
    res.status(500).json({ error: 'Failed to get queue stats' });
  }
});

/**
 * GET /api/monitor/queue/:jobId
 * Get specific job status
 */
router.get('/queue/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const jobStatus = await QueueManager.getJobStatus(jobId);
    res.json(jobStatus);
  } catch (error) {
    console.error('Error getting job status:', error);
    res.status(500).json({ error: 'Failed to get job status' });
  }
});

/**
 * DELETE /api/monitor/queue/:jobId
 * Cancel queued job
 */
router.delete('/queue/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const removed = await QueueManager.removeJob(jobId);

    if (removed) {
      res.json({ success: true, message: 'Job cancelled' });
    } else {
      res.status(404).json({ error: 'Job not found' });
    }
  } catch (error) {
    console.error('Error cancelling job:', error);
    res.status(500).json({ error: 'Failed to cancel job' });
  }
});

/**
 * GET /api/monitor/active
 * Get all active analyses
 */
router.get('/active', async (req, res) => {
  try {
    const active = await SystemMonitor.getActiveAnalyses();
    res.json({
      count: active.length,
      analyses: active,
    });
  } catch (error) {
    console.error('Error getting active analyses:', error);
    res.status(500).json({ error: 'Failed to get active analyses' });
  }
});

/**
 * GET /api/monitor/api-stats
 * Get API endpoint statistics
 */
router.get('/api-stats', async (req, res) => {
  try {
    const stats = await SystemMonitor.getAPIStats();
    res.json(stats);
  } catch (error) {
    console.error('Error getting API stats:', error);
    res.status(500).json({ error: 'Failed to get API stats' });
  }
});

/**
 * GET /api/monitor/rate-limits
 * Get rate limiter statistics
 */
router.get('/rate-limits', async (req, res) => {
  try {
    const stats = await RateLimiter.getStats();
    res.json(stats);
  } catch (error) {
    console.error('Error getting rate limit stats:', error);
    res.status(500).json({ error: 'Failed to get rate limit stats' });
  }
});

/**
 * GET /api/monitor/health
 * Simple health check endpoint
 */
router.get('/health', async (req, res) => {
  try {
    const [activeCount, queueStats] = await Promise.all([
      SystemMonitor.getActiveAnalysesCount(),
      QueueManager.getQueueStats(),
    ]);

    const maxConcurrent = parseInt(process.env.MAX_CONCURRENT_ANALYSES) || 20;
    const isHealthy = activeCount < maxConcurrent * 1.5; // Alert if 50% over capacity

    res.json({
      status: isHealthy ? 'healthy' : 'degraded',
      active: activeCount,
      max: maxConcurrent,
      queued: queueStats.waiting,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error checking health:', error);
    res.status(500).json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * POST /api/monitor/reset
 * Reset statistics (admin only - add auth in production)
 */
router.post('/reset', async (req, res) => {
  try {
    await SystemMonitor.resetStats();
    res.json({ success: true, message: 'Statistics reset' });
  } catch (error) {
    console.error('Error resetting stats:', error);
    res.status(500).json({ error: 'Failed to reset statistics' });
  }
});

/**
 * DELETE /api/monitor/locks/:walletAddress
 * Clear stale analysis lock for a wallet (admin only)
 */
router.delete('/locks/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params;
    await RateLimiter.releaseAnalysisLock(walletAddress);
    res.json({ success: true, message: `Lock released for ${walletAddress}` });
  } catch (error) {
    console.error('Error releasing lock:', error);
    res.status(500).json({ error: 'Failed to release lock' });
  }
});

/**
 * DELETE /api/monitor/locks
 * Clear all analysis locks (admin only - use with caution)
 */
router.delete('/locks', async (req, res) => {
  try {
    const lockKeys = await RateLimiter.scanKeys('lock:analysis:*');
    const redis = require('../config/redis');

    if (lockKeys.length > 0) {
      await redis.redis.del(...lockKeys);
    }

    res.json({
      success: true,
      message: `Cleared ${lockKeys.length} analysis locks`,
      cleared: lockKeys.length
    });
  } catch (error) {
    console.error('Error clearing locks:', error);
    res.status(500).json({ error: 'Failed to clear locks' });
  }
});

module.exports = router;
