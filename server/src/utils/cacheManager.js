const redis = require('../config/redis');

/**
 * Cache Manager - Centralized caching strategy
 * Implements multi-tier caching with Redis
 */
class CacheManager {
  /**
   * Cache tiers and TTLs (in seconds)
   */
  static TTL = {
    PRICE_CURRENT: 60,           // 1 minute for current prices
    PRICE_BATCH: 300,             // 5 minutes for batch prices
    TOKEN_METADATA: 604800,       // 7 days for token metadata
    ANALYSIS_PROGRESS: 3600,      // 1 hour for active analysis
    ANALYSIS_RESULT: 86400,       // 24 hours for completed analysis
    WALLET_SUMMARY: 86400,        // 24 hours for wallet summary
    HIGHLIGHTS: 86400,            // 24 hours for highlights
    DAILY_PNL: 86400,            // 24 hours for daily P&L
    CARD_IMAGE: 86400            // 24 hours for card images
  };

  /**
   * ============================================================================
   * ANALYSIS CACHING
   * ============================================================================
   */

  static async getAnalysisProgress(walletAddress) {
    return await redis.get(`progress:${walletAddress}`);
  }

  static async setAnalysisProgress(walletAddress, progress) {
    await redis.setex(
      `progress:${walletAddress}`,
      this.TTL.ANALYSIS_PROGRESS,
      progress
    );
  }

  static async clearAnalysisProgress(walletAddress) {
    await redis.del(`progress:${walletAddress}`);
  }

  /**
   * Cache wallet summary (positions + PNL totals)
   */
  static async cacheWalletSummary(walletAddress, summary) {
    await redis.setex(
      `wallet:${walletAddress}:summary`,
      this.TTL.WALLET_SUMMARY,
      summary
    );
  }

  static async getWalletSummary(walletAddress) {
    return await redis.get(`wallet:${walletAddress}:summary`);
  }

  /**
   * ============================================================================
   * HIGHLIGHTS CACHING
   * ============================================================================
   */

  static async cacheHighlights(walletAddress, highlights) {
    await redis.setex(
      `highlights:${walletAddress}`,
      this.TTL.HIGHLIGHTS,
      highlights
    );
  }

  static async getHighlights(walletAddress) {
    return await redis.get(`highlights:${walletAddress}`);
  }

  /**
   * ============================================================================
   * DAILY PNL CACHING
   * ============================================================================
   */

  static async cacheDailyPNL(walletAddress, year, month, data) {
    const key = month
      ? `daily_pnl:${walletAddress}:${year}:${month}`
      : `daily_pnl:${walletAddress}:${year}`;

    await redis.setex(key, this.TTL.DAILY_PNL, data);
  }

  static async getDailyPNL(walletAddress, year, month) {
    const key = month
      ? `daily_pnl:${walletAddress}:${year}:${month}`
      : `daily_pnl:${walletAddress}:${year}`;

    return await redis.get(key);
  }

  /**
   * ============================================================================
   * PRICE CACHING
   * ============================================================================
   */

  static async cachePrice(mint, price) {
    await redis.setex(
      `price:${mint}`,
      this.TTL.PRICE_CURRENT,
      price.toString()
    );
  }

  static async getPrice(mint) {
    const cached = await redis.get(`price:${mint}`);
    return cached ? parseFloat(cached) : null;
  }

  static async cacheBatchPrices(prices) {
    const promises = Object.entries(prices).map(([mint, price]) =>
      redis.setex(`price:${mint}`, this.TTL.PRICE_BATCH, price.toString())
    );
    await Promise.all(promises);
  }

  /**
   * ============================================================================
   * TOKEN METADATA CACHING
   * ============================================================================
   */

  static async cacheTokenMetadata(mint, metadata) {
    await redis.setex(
      `token:${mint}:metadata`,
      this.TTL.TOKEN_METADATA,
      metadata
    );
  }

  static async getTokenMetadata(mint) {
    return await redis.get(`token:${mint}:metadata`);
  }

  /**
   * ============================================================================
   * CARD IMAGE CACHING
   * ============================================================================
   */

  /**
   * Cache a pre-generated card image (PNG as base64)
   * @param {string} walletAddress - Wallet address
   * @param {number} cardIndex - Card index (0-5) or 'summary'
   * @param {Buffer} imageBuffer - PNG image buffer
   */
  static async cacheCardImage(walletAddress, cardIndex, imageBuffer) {
    const key = `card:${walletAddress}:${cardIndex}`;
    await redis.setBinary(key, this.TTL.CARD_IMAGE, imageBuffer);
  }

  /**
   * Get cached card image
   * @param {string} walletAddress - Wallet address
   * @param {number} cardIndex - Card index (0-5) or 'summary'
   * @returns {Promise<Buffer|null>} PNG image buffer or null if not cached
   */
  static async getCardImage(walletAddress, cardIndex) {
    const key = `card:${walletAddress}:${cardIndex}`;
    return await redis.getBinary(key);
  }

  /**
   * Check if all card images are cached for a wallet
   * @param {string} walletAddress - Wallet address
   * @returns {Promise<boolean>}
   */
  static async hasAllCardImages(walletAddress) {
    const keys = [0, 1, 2, 3, 4, 5].map(i => `card:${walletAddress}:${i}`);
    const results = await Promise.all(keys.map(key => redis.exists(key)));
    return results.every(exists => exists === 1);
  }

  /**
   * ============================================================================
   * INVALIDATION
   * ============================================================================
   */

  static async invalidateWallet(walletAddress) {
    const keys = [
      `wallet:${walletAddress}:summary`,
      `highlights:${walletAddress}`,
      `progress:${walletAddress}`,
      // Card images (0-5 and summary)
      `card:${walletAddress}:0`,
      `card:${walletAddress}:1`,
      `card:${walletAddress}:2`,
      `card:${walletAddress}:3`,
      `card:${walletAddress}:4`,
      `card:${walletAddress}:5`,
      `card:${walletAddress}:summary`
    ];

    // Also invalidate all daily PNL keys for this wallet (using SCAN)
    const dailyPNLKeys = await this.scanKeys(`daily_pnl:${walletAddress}:*`);
    keys.push(...dailyPNLKeys);

    // Use pipeline to batch all deletions into single round-trip
    // This is much faster than individual delete commands (especially with 10+ keys)
    if (keys.length > 0) {
      const pipeline = redis.redis.pipeline();
      keys.forEach(key => pipeline.del(key));
      await pipeline.exec();
      console.log(`Invalidated ${keys.length} cache keys for wallet: ${walletAddress}`);
    }
  }

  /**
   * Scan Redis keys using SCAN command (production-safe, non-blocking)
   * @param {string} pattern - Key pattern to match
   * @returns {Promise<string[]>} Array of matching keys
   */
  static async scanKeys(pattern) {
    const keys = [];
    let cursor = '0';

    do {
      const result = await redis.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = result[0];
      keys.push(...result[1]);
    } while (cursor !== '0');

    return keys;
  }

  /**
   * Clear all caches (use with caution)
   */
  static async flushAll() {
    await redis.redis.flushAll();
    console.log('All caches cleared');
  }

  /**
   * ============================================================================
   * CACHE WARMING
   * ============================================================================
   */

  /**
   * Pre-warm cache for a wallet (after analysis completes)
   */
  static async warmWalletCache(walletAddress, data) {
    const { summary, highlights, dailyPNL } = data;

    const promises = [];

    if (summary) {
      promises.push(this.cacheWalletSummary(walletAddress, summary));
    }

    if (highlights) {
      promises.push(this.cacheHighlights(walletAddress, highlights));
    }

    if (dailyPNL) {
      // Cache by year
      const byYear = this.groupDailyPNLByYear(dailyPNL);
      for (const [year, data] of Object.entries(byYear)) {
        promises.push(this.cacheDailyPNL(walletAddress, year, null, data));
      }
    }

    await Promise.all(promises);
    console.log(`Warmed cache for wallet: ${walletAddress}`);
  }

  /**
   * Group daily PNL by year
   */
  static groupDailyPNLByYear(dailyPNL) {
    const byYear = {};

    for (const [date, data] of Object.entries(dailyPNL)) {
      const year = date.split('-')[0];
      if (!byYear[year]) {
        byYear[year] = {};
      }
      byYear[year][date] = data;
    }

    return byYear;
  }

  /**
   * ============================================================================
   * CACHE STATISTICS
   * ============================================================================
   */

  static async getCacheStats() {
    const info = await redis.redis.info('stats');
    const keyspace = await redis.redis.info('keyspace');

    return {
      info,
      keyspace,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get cache hit rate for monitoring
   */
  static async getCacheHitRate() {
    try {
      const info = await redis.redis.info('stats');
      const lines = info.split('\r\n');

      let hits = 0;
      let misses = 0;

      for (const line of lines) {
        if (line.startsWith('keyspace_hits:')) {
          hits = parseInt(line.split(':')[1]);
        }
        if (line.startsWith('keyspace_misses:')) {
          misses = parseInt(line.split(':')[1]);
        }
      }

      const total = hits + misses;
      const hitRate = total > 0 ? (hits / total) * 100 : 0;

      return {
        hits,
        misses,
        total,
        hitRate: Math.round(hitRate * 100) / 100
      };
    } catch (error) {
      console.error('Error getting cache hit rate:', error);
      return { hits: 0, misses: 0, total: 0, hitRate: 0 };
    }
  }
}

module.exports = CacheManager;
