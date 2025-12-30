const redis = require('../config/redis');
const QueueManager = require('./queueManager');

/**
 * System Monitor - Tracks real-time system metrics and concurrent usage
 *
 * Features:
 * - Active analysis tracking
 * - API usage monitoring
 * - Queue statistics
 * - Performance metrics
 */

class SystemMonitor {
  /**
   * Record analysis start
   */
  static async recordAnalysisStart(walletAddress, userId = null) {
    const key = `monitor:analysis:${walletAddress}`;
    const data = {
      walletAddress,
      userId,
      startTime: Date.now(),
      status: 'active',
    };

    try {
      await redis.redis.setEx(key, 1800, JSON.stringify(data)); // 30 min TTL
      await redis.redis.incr('monitor:stats:total_analyses');
    } catch (error) {
      console.error('Error recording analysis start:', error);
    }
  }

  /**
   * Record analysis completion
   */
  static async recordAnalysisComplete(walletAddress, duration, success = true) {
    const key = `monitor:analysis:${walletAddress}`;

    try {
      await redis.redis.del(key);

      // Track metrics
      if (success) {
        await redis.redis.incr('monitor:stats:completed_analyses');
        await this.recordMetric('analysis_duration', duration);
      } else {
        await redis.redis.incr('monitor:stats:failed_analyses');
      }
    } catch (error) {
      console.error('Error recording analysis completion:', error);
    }
  }

  /**
   * Get current active analyses count
   */
  static async getActiveAnalysesCount() {
    try {
      const keys = await redis.redis.keys('monitor:analysis:*');
      return keys.length;
    } catch (error) {
      console.error('Error getting active analyses:', error);
      return 0;
    }
  }

  /**
   * Get all active analyses
   */
  static async getActiveAnalyses() {
    try {
      const keys = await redis.redis.keys('monitor:analysis:*');
      const analyses = [];

      for (const key of keys) {
        const data = await redis.redis.get(key);
        if (data) {
          const analysis = JSON.parse(data);
          analysis.duration = Date.now() - analysis.startTime;
          analyses.push(analysis);
        }
      }

      return analyses.sort((a, b) => a.startTime - b.startTime);
    } catch (error) {
      console.error('Error getting active analyses:', error);
      return [];
    }
  }

  /**
   * Record a metric value (for averaging)
   */
  static async recordMetric(metricName, value) {
    const key = `monitor:metric:${metricName}`;

    try {
      await redis.redis.lPush(key, value.toString());
      await redis.redis.lTrim(key, 0, 99); // Keep last 100 values
      await redis.redis.expire(key, 3600); // 1 hour TTL
    } catch (error) {
      console.error(`Error recording metric ${metricName}:`, error);
    }
  }

  /**
   * Get metric statistics
   */
  static async getMetricStats(metricName) {
    const key = `monitor:metric:${metricName}`;

    try {
      const values = await redis.redis.lRange(key, 0, -1);
      if (values.length === 0) {
        return { count: 0, avg: 0, min: 0, max: 0 };
      }

      const numbers = values.map(v => parseFloat(v));
      const sum = numbers.reduce((a, b) => a + b, 0);
      const avg = sum / numbers.length;
      const min = Math.min(...numbers);
      const max = Math.max(...numbers);

      return {
        count: numbers.length,
        avg: Math.round(avg),
        min: Math.round(min),
        max: Math.round(max),
      };
    } catch (error) {
      console.error(`Error getting metric stats ${metricName}:`, error);
      return { count: 0, avg: 0, min: 0, max: 0 };
    }
  }

  /**
   * Get comprehensive system status
   */
  static async getSystemStatus() {
    try {
      const [
        activeCount,
        activeAnalyses,
        queueStats,
        analysisDurationStats,
        totalAnalyses,
        completedAnalyses,
        failedAnalyses,
      ] = await Promise.all([
        this.getActiveAnalysesCount(),
        this.getActiveAnalyses(),
        QueueManager.getQueueStats(),
        this.getMetricStats('analysis_duration'),
        redis.redis.get('monitor:stats:total_analyses'),
        redis.redis.get('monitor:stats:completed_analyses'),
        redis.redis.get('monitor:stats:failed_analyses'),
      ]);

      const maxConcurrent = parseInt(process.env.MAX_CONCURRENT_ANALYSES) || 80;
      const utilizationPercent = Math.round((activeCount / maxConcurrent) * 100);

      return {
        timestamp: new Date().toISOString(),
        concurrent: {
          active: activeCount,
          max: maxConcurrent,
          available: Math.max(0, maxConcurrent - activeCount),
          utilizationPercent,
        },
        queue: queueStats,
        performance: {
          analysisDuration: analysisDurationStats,
        },
        stats: {
          total: parseInt(totalAnalyses) || 0,
          completed: parseInt(completedAnalyses) || 0,
          failed: parseInt(failedAnalyses) || 0,
          successRate: totalAnalyses > 0
            ? Math.round((parseInt(completedAnalyses) || 0) / parseInt(totalAnalyses) * 100)
            : 0,
        },
        activeAnalyses: activeAnalyses.map(a => ({
          walletAddress: a.walletAddress.slice(0, 8) + '...',
          duration: Math.round(a.duration / 1000) + 's',
          startTime: new Date(a.startTime).toISOString(),
        })),
      };
    } catch (error) {
      console.error('Error getting system status:', error);
      return {
        timestamp: new Date().toISOString(),
        error: error.message,
      };
    }
  }

  /**
   * Record API request
   */
  static async recordAPIRequest(endpoint, duration, statusCode) {
    try {
      await redis.redis.incr(`monitor:api:${endpoint}:count`);
      await this.recordMetric(`api:${endpoint}:duration`, duration);

      if (statusCode >= 400) {
        await redis.redis.incr(`monitor:api:${endpoint}:errors`);
      }
    } catch (error) {
      console.error('Error recording API request:', error);
    }
  }

  /**
   * Get API statistics
   */
  static async getAPIStats() {
    try {
      const endpoints = ['analyze', 'wallet', 'stats'];
      const stats = {};

      for (const endpoint of endpoints) {
        const [count, errors, durationStats] = await Promise.all([
          redis.redis.get(`monitor:api:${endpoint}:count`),
          redis.redis.get(`monitor:api:${endpoint}:errors`),
          this.getMetricStats(`api:${endpoint}:duration`),
        ]);

        stats[endpoint] = {
          totalRequests: parseInt(count) || 0,
          errors: parseInt(errors) || 0,
          avgDuration: durationStats.avg,
          successRate: count > 0
            ? Math.round(((parseInt(count) - (parseInt(errors) || 0)) / parseInt(count)) * 100)
            : 100,
        };
      }

      return stats;
    } catch (error) {
      console.error('Error getting API stats:', error);
      return {};
    }
  }

  /**
   * Reset all statistics
   */
  static async resetStats() {
    try {
      const keys = await redis.redis.keys('monitor:stats:*');
      if (keys.length > 0) {
        await redis.redis.del(...keys);
      }
      console.log('Monitor stats reset');
    } catch (error) {
      console.error('Error resetting stats:', error);
    }
  }
}

module.exports = SystemMonitor;
