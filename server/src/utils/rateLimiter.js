const redis = require('../config/redis');

/**
 * Rate Limiter - Prevents abuse and ensures fair usage
 */
class RateLimiter {
  /**
   * Check if request is allowed (sliding window algorithm)
   * @param {string} identifier - User identifier (IP, wallet, etc.)
   * @param {number} maxRequests - Max requests allowed
   * @param {number} windowMs - Time window in milliseconds
   * @returns {Promise<{allowed: boolean, remaining: number, resetAt: Date}>}
   */
  static async checkLimit(identifier, maxRequests = 10, windowMs = 60000) {
    const key = `ratelimit:${identifier}`;
    const now = Date.now();
    const windowStart = now - windowMs;

    try {
      // Remove old entries outside the window
      await redis.redis.zRemRangeByScore(key, 0, windowStart);

      // Count requests in current window
      const count = await redis.redis.zCard(key);

      if (count >= maxRequests) {
        // Get oldest request timestamp for reset time
        const oldest = await redis.redis.zRange(key, 0, 0, { WITHSCORES: true });
        const resetAt = oldest.length > 0
          ? new Date(parseFloat(oldest[1]) + windowMs)
          : new Date(now + windowMs);

        return {
          allowed: false,
          remaining: 0,
          resetAt,
          retryAfter: Math.ceil((resetAt.getTime() - now) / 1000)
        };
      }

      // Add current request
      await redis.redis.zAdd(key, { score: now, value: `${now}-${Math.random()}` });

      // Set expiry on the key
      await redis.redis.expire(key, Math.ceil(windowMs / 1000));

      return {
        allowed: true,
        remaining: maxRequests - count - 1,
        resetAt: new Date(now + windowMs)
      };

    } catch (error) {
      console.error('Rate limit check error:', error);
      // Fail open - allow request if Redis is down
      return {
        allowed: true,
        remaining: maxRequests,
        resetAt: new Date(now + windowMs)
      };
    }
  }

  /**
   * Rate limit for wallet analysis (stricter limits)
   */
  static async checkAnalysisLimit(identifier) {
    // Allow 5 analyses per hour per IP/user
    return this.checkLimit(identifier, 5, 60 * 60 * 1000);
  }

  /**
   * Rate limit for API requests (general)
   */
  static async checkAPILimit(identifier) {
    // Allow 100 requests per minute
    return this.checkLimit(identifier, 100, 60 * 1000);
  }

  /**
   * Request deduplication - prevent duplicate concurrent requests
   * @param {string} key - Unique request identifier
   * @param {number} ttlSeconds - How long to block duplicates
   */
  static async acquireLock(key, ttlSeconds = 60) {
    const lockKey = `lock:${key}`;

    try {
      // Try to set the lock (NX = only if not exists)
      const acquired = await redis.redis.set(lockKey, '1', {
        NX: true,
        EX: ttlSeconds
      });

      return acquired !== null;

    } catch (error) {
      console.error('Lock acquisition error:', error);
      return true; // Fail open
    }
  }

  /**
   * Release a lock
   */
  static async releaseLock(key) {
    const lockKey = `lock:${key}`;

    try {
      await redis.redis.del(lockKey);
    } catch (error) {
      console.error('Lock release error:', error);
    }
  }

  /**
   * Prevent duplicate analysis requests
   */
  static async preventDuplicateAnalysis(walletAddress) {
    const key = `analysis:${walletAddress}`;
    return await this.acquireLock(key, 300); // 5 minute lock
  }

  /**
   * Release analysis lock
   */
  static async releaseAnalysisLock(walletAddress) {
    const key = `analysis:${walletAddress}`;
    await this.releaseLock(key);
  }

  /**
   * Check if wallet is currently being analyzed
   */
  static async isAnalyzing(walletAddress) {
    const lockKey = `lock:analysis:${walletAddress}`;

    try {
      const exists = await redis.redis.exists(lockKey);
      return exists === 1;
    } catch (error) {
      return false;
    }
  }

  /**
   * Global rate limiting stats
   */
  static async getStats() {
    try {
      const keys = await redis.redis.keys('ratelimit:*');
      const locks = await redis.redis.keys('lock:*');

      return {
        activeRateLimits: keys.length,
        activeLocks: locks.length,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Clear all rate limits (admin only)
   */
  static async clearAll() {
    try {
      const keys = await redis.redis.keys('ratelimit:*');
      if (keys.length > 0) {
        await redis.redis.del(...keys);
      }
      console.log(`Cleared ${keys.length} rate limit entries`);
    } catch (error) {
      console.error('Clear rate limits error:', error);
    }
  }
}

module.exports = RateLimiter;
