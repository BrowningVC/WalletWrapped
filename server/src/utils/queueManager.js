const Queue = require('bull');
const redis = require('../config/redis');

/**
 * Queue Manager - Handles analysis request queuing when capacity is exceeded
 *
 * Features:
 * - Automatic queue management based on concurrent analysis count
 * - Position tracking for users
 * - Configurable concurrency limits
 * - Real-time queue status updates
 */

// Max concurrent analyses based on Helius plan
// Developer (50 RPS): ~20 concurrent
// Business (200 RPS): ~80 concurrent
const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT_ANALYSES) || 20;

// Create Bull queue for analysis requests
const analysisQueue = new Queue('wallet-analysis', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  },
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: false,
    attempts: 1, // Don't retry failed analyses
    timeout: 30 * 60 * 1000, // 30 minute timeout
  }
});

class QueueManager {
  /**
   * Get current queue statistics
   */
  static async getQueueStats() {
    try {
      const [waiting, active, completed, failed] = await Promise.all([
        analysisQueue.getWaitingCount(),
        analysisQueue.getActiveCount(),
        analysisQueue.getCompletedCount(),
        analysisQueue.getFailedCount(),
      ]);

      return {
        waiting,
        active,
        completed,
        failed,
        maxConcurrent: MAX_CONCURRENT,
        hasCapacity: active < MAX_CONCURRENT,
        estimatedWaitTime: this.calculateEstimatedWaitTime(waiting, active),
      };
    } catch (error) {
      console.error('Error getting queue stats:', error);
      return {
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        maxConcurrent: MAX_CONCURRENT,
        hasCapacity: true,
        estimatedWaitTime: 0,
        error: error.message,
      };
    }
  }

  /**
   * Check if we should queue the request or process immediately
   */
  static async shouldQueue() {
    try {
      const activeCount = await analysisQueue.getActiveCount();
      return activeCount >= MAX_CONCURRENT;
    } catch (error) {
      console.error('Error checking queue status:', error);
      return false; // Fail open - allow request if Redis is down
    }
  }

  /**
   * Add analysis job to queue
   * Returns job ID and position in queue
   */
  static async addToQueue(walletAddress, userId = null) {
    try {
      const job = await analysisQueue.add(
        {
          walletAddress,
          userId,
          requestedAt: new Date().toISOString(),
        },
        {
          jobId: `analysis:${walletAddress}:${Date.now()}`,
          priority: 1, // FIFO by default
        }
      );

      const position = await this.getQueuePosition(job.id);

      return {
        jobId: job.id,
        position,
        estimatedWaitTime: this.calculateEstimatedWaitTime(position, 0),
      };
    } catch (error) {
      console.error('Error adding to queue:', error);
      throw new Error('Failed to queue analysis request');
    }
  }

  /**
   * Get position of a job in the queue
   */
  static async getQueuePosition(jobId) {
    try {
      const job = await analysisQueue.getJob(jobId);
      if (!job) return -1;

      const waiting = await analysisQueue.getWaiting();
      const position = waiting.findIndex(j => j.id === jobId);

      return position === -1 ? -1 : position + 1; // 1-indexed
    } catch (error) {
      console.error('Error getting queue position:', error);
      return -1;
    }
  }

  /**
   * Get job status
   */
  static async getJobStatus(jobId) {
    try {
      const job = await analysisQueue.getJob(jobId);
      if (!job) {
        return { status: 'not_found' };
      }

      const state = await job.getState();
      const position = state === 'waiting' ? await this.getQueuePosition(jobId) : 0;

      return {
        status: state,
        position,
        progress: job.progress(),
        data: job.data,
        estimatedWaitTime: this.calculateEstimatedWaitTime(position, 0),
      };
    } catch (error) {
      console.error('Error getting job status:', error);
      return { status: 'error', error: error.message };
    }
  }

  /**
   * Remove job from queue (user cancellation)
   */
  static async removeJob(jobId) {
    try {
      const job = await analysisQueue.getJob(jobId);
      if (job) {
        await job.remove();
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error removing job:', error);
      return false;
    }
  }

  /**
   * Calculate estimated wait time based on queue position
   * Assumes average analysis takes 30 seconds
   */
  static calculateEstimatedWaitTime(queuePosition, activeCount) {
    if (queuePosition <= 0) return 0;

    const avgAnalysisTime = 30; // seconds
    const spotsAvailable = Math.max(MAX_CONCURRENT - activeCount, 1);
    const roundsToWait = Math.ceil(queuePosition / spotsAvailable);

    return roundsToWait * avgAnalysisTime;
  }

  /**
   * Clean up old completed/failed jobs
   */
  static async cleanup() {
    try {
      await analysisQueue.clean(3600 * 1000, 'completed'); // Remove completed jobs older than 1 hour
      await analysisQueue.clean(24 * 3600 * 1000, 'failed'); // Remove failed jobs older than 24 hours
      console.log('Queue cleanup completed');
    } catch (error) {
      console.error('Error cleaning queue:', error);
    }
  }

  /**
   * Get the queue instance (for processing)
   */
  static getQueue() {
    return analysisQueue;
  }
}

// Periodic cleanup every hour
setInterval(() => {
  QueueManager.cleanup();
}, 3600 * 1000);

module.exports = QueueManager;
