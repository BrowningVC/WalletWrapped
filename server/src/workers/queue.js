const Queue = require('bull');
const redis = require('../config/redis');

/**
 * Bull Queue Configuration
 * Handles background wallet analysis jobs
 */

// Extract Redis connection details from URL
const redisUrl = new URL(process.env.REDIS_URL || 'redis://localhost:6379');
const redisConfig = {
  host: redisUrl.hostname,
  port: redisUrl.port || 6379,
  password: redisUrl.password || undefined,
  db: 0,
  maxRetriesPerRequest: null,
  enableReadyCheck: false
};

/**
 * Analysis Queue
 * - Processes wallet analysis jobs
 * - Timeout: 10 minutes per job
 * - Retries: 3 attempts with exponential backoff
 */
const analysisQueue = new Queue('wallet-analysis', {
  redis: redisConfig,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000 // Start with 2s, then 4s, then 8s
    },
    timeout: 600000, // 10 minutes
    removeOnComplete: 100, // Keep last 100 completed jobs
    removeOnFail: 500 // Keep last 500 failed jobs for debugging
  },
  settings: {
    stalledInterval: 30000, // Check for stalled jobs every 30s
    maxStalledCount: 3, // Mark job as failed after 3 stalls
    lockDuration: 300000 // 5 minute lock duration
  }
});

/**
 * Priority levels for queue
 */
const PRIORITY = {
  HIGH: 1, // Premium users, repeated analyses
  NORMAL: 5, // First-time users
  LOW: 10 // Background refreshes
};

/**
 * Add analysis job to queue
 * @param {string} walletAddress - Solana wallet address
 * @param {Object} options - Job options
 * @returns {Promise<Job>}
 */
async function queueAnalysis(walletAddress, options = {}) {
  const priority = options.priority || 'normal';
  const isIncremental = options.incremental || false;

  const job = await analysisQueue.add(
    'analyzeWallet',
    {
      walletAddress,
      incremental: isIncremental,
      requestedAt: new Date().toISOString()
    },
    {
      priority: PRIORITY[priority.toUpperCase()] || PRIORITY.NORMAL,
      jobId: `analysis:${walletAddress}:${Date.now()}`, // Unique job ID
      removeOnComplete: true,
      removeOnFail: false
    }
  );

  console.log(`Queued analysis for ${walletAddress} (Job ID: ${job.id}, Priority: ${priority})`);
  return job;
}

/**
 * Get job status by wallet address
 * @param {string} walletAddress
 * @returns {Promise<Object|null>}
 */
async function getAnalysisJob(walletAddress) {
  const jobs = await analysisQueue.getJobs(['active', 'waiting', 'delayed']);
  const job = jobs.find(j => j.data.walletAddress === walletAddress);

  if (!job) return null;

  return {
    id: job.id,
    status: await job.getState(),
    progress: job.progress(),
    data: job.data,
    attempts: job.attemptsMade,
    failedReason: job.failedReason
  };
}

/**
 * Cancel analysis job
 * @param {string} walletAddress
 * @returns {Promise<boolean>}
 */
async function cancelAnalysis(walletAddress) {
  const job = await getAnalysisJob(walletAddress);
  if (!job) return false;

  const bullJob = await analysisQueue.getJob(job.id);
  if (bullJob) {
    await bullJob.remove();
    console.log(`Cancelled analysis for ${walletAddress}`);
    return true;
  }

  return false;
}

/**
 * Get queue statistics
 * @returns {Promise<Object>}
 */
async function getQueueStats() {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    analysisQueue.getWaitingCount(),
    analysisQueue.getActiveCount(),
    analysisQueue.getCompletedCount(),
    analysisQueue.getFailedCount(),
    analysisQueue.getDelayedCount()
  ]);

  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
    total: waiting + active + delayed
  };
}

/**
 * Clean old completed and failed jobs
 * Run this periodically to prevent memory buildup
 */
async function cleanOldJobs() {
  const grace = 24 * 60 * 60 * 1000; // 24 hours

  await analysisQueue.clean(grace, 'completed');
  await analysisQueue.clean(grace * 7, 'failed'); // Keep failed jobs for 7 days

  console.log('Cleaned old jobs from queue');
}

/**
 * Pause queue (for maintenance)
 */
async function pauseQueue() {
  await analysisQueue.pause();
  console.log('Queue paused');
}

/**
 * Resume queue
 */
async function resumeQueue() {
  await analysisQueue.resume();
  console.log('Queue resumed');
}

// Event handlers for monitoring
analysisQueue.on('error', (error) => {
  console.error('Queue error:', error);
});

analysisQueue.on('waiting', (jobId) => {
  console.log(`Job ${jobId} is waiting`);
});

analysisQueue.on('active', (job) => {
  console.log(`Job ${job.id} started processing (${job.data.walletAddress})`);
});

analysisQueue.on('stalled', (job) => {
  console.warn(`Job ${job.id} stalled (${job.data.walletAddress})`);
});

analysisQueue.on('completed', (job, result) => {
  console.log(`Job ${job.id} completed for ${job.data.walletAddress}:`, result);
});

analysisQueue.on('failed', (job, err) => {
  console.error(`Job ${job.id} failed for ${job.data.walletAddress}:`, err.message);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing queue...');
  await analysisQueue.close();
});

module.exports = {
  analysisQueue,
  queueAnalysis,
  getAnalysisJob,
  cancelAnalysis,
  getQueueStats,
  cleanOldJobs,
  pauseQueue,
  resumeQueue,
  PRIORITY
};
