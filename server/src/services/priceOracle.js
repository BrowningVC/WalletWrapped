const redis = require('../config/redis');
const { query } = require('../config/database');
require('dotenv').config();

const JUPITER_API_URL = process.env.JUPITER_API_URL || 'https://price.jup.ag/v6';
const SOLSCAN_API_URL = 'https://pro-api.solscan.io/v2.0';
const DEXSCREENER_API_URL = 'https://api.dexscreener.com/latest/dex';
const PRICE_CACHE_TTL = 60; // 1 minute cache for current prices

/**
 * Price Oracle - Multi-source token price fetcher
 * Priority: DexScreener → Jupiter → Birdeye → Solscan → Last Known Price
 */
class PriceOracle {
  /**
   * Get current token price with multi-source fallback
   * @param {string} mint - Token mint address
   * @returns {number} Price in SOL (0 if unavailable)
   */
  static async getCurrentTokenPrice(mint) {
    // Try cache first
    const cached = await this.getCachedPrice(mint);
    if (cached !== null) {
      return cached;
    }

    // Try multiple sources in order of reliability
    // Priority: DexScreener → Jupiter → Birdeye → Solscan → Last Known Price
    const sources = [
      () => this.getDexScreenerPrice(mint),
      () => this.getJupiterPrice(mint),
      () => this.getBirdeyePrice(mint),
      () => this.getSolscanPrice(mint),
      () => this.getLastKnownPrice(mint)
    ];

    for (const source of sources) {
      try {
        const price = await source();
        if (price > 0) {
          // Cache the price
          await this.setCachedPrice(mint, price);
          return price;
        }
      } catch (err) {
        console.warn(`Price source failed for ${mint}:`, err.message);
        continue;
      }
    }

    console.warn(`No price found for token ${mint}`);
    return 0;
  }

  /**
   * Get cached price from Redis
   */
  static async getCachedPrice(mint) {
    try {
      const cached = await redis.get(`price:${mint}`);
      if (cached) {
        return parseFloat(cached);
      }
    } catch (err) {
      console.error('Redis cache error:', err);
    }
    return null;
  }

  /**
   * Set price in Redis cache
   */
  static async setCachedPrice(mint, price) {
    try {
      await redis.setex(`price:${mint}`, PRICE_CACHE_TTL, price.toString());
    } catch (err) {
      console.error('Redis cache set error:', err);
    }
  }

  /**
   * Get price from Jupiter aggregator (most accurate)
   */
  static async getJupiterPrice(mint) {
    try {
      const response = await fetch(`${JUPITER_API_URL}/price?ids=${mint}`);

      if (!response.ok) {
        throw new Error(`Jupiter API error: ${response.status}`);
      }

      const data = await response.json();

      if (data.data && data.data[mint]) {
        const priceData = data.data[mint];
        // Jupiter returns price in USD, need to convert to SOL
        const solPrice = await this.getSolPriceUSD();
        if (solPrice > 0 && priceData.price) {
          return priceData.price / solPrice; // Convert USD to SOL
        }
      }

      return 0;
    } catch (error) {
      console.error('Jupiter price fetch error:', error.message);
      return 0;
    }
  }

  /**
   * Get price from Solscan API
   */
  static async getSolscanPrice(mint) {
    const apiKey = process.env.SOLSCAN_API_KEY;
    if (!apiKey) {
      return 0;
    }

    try {
      const response = await fetch(
        `${SOLSCAN_API_URL}/token/meta?address=${mint}`,
        {
          headers: {
            'token': apiKey
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Solscan API error: ${response.status}`);
      }

      const data = await response.json();

      if (data.success && data.data && data.data.price) {
        // Solscan returns price in USD, convert to SOL
        const solPrice = await this.getSolPriceUSD();
        if (solPrice > 0) {
          return data.data.price / solPrice;
        }
      }

      return 0;
    } catch (error) {
      console.error('Solscan price fetch error:', error.message);
      return 0;
    }
  }

  /**
   * Get price from Birdeye API
   */
  static async getBirdeyePrice(mint) {
    const apiKey = process.env.BIRDEYE_API_KEY;
    if (!apiKey) {
      return 0;
    }

    try {
      const response = await fetch(
        `https://public-api.birdeye.so/defi/price?address=${mint}`,
        {
          headers: {
            'X-API-KEY': apiKey
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Birdeye API error: ${response.status}`);
      }

      const data = await response.json();

      if (data.data && data.data.value) {
        // Birdeye returns price in USD, convert to SOL
        const solPrice = await this.getSolPriceUSD();
        if (solPrice > 0) {
          return data.data.value / solPrice;
        }
      }

      return 0;
    } catch (error) {
      console.error('Birdeye price fetch error:', error.message);
      return 0;
    }
  }

  /**
   * Get price from DexScreener API (free, no API key required)
   */
  static async getDexScreenerPrice(mint) {
    try {
      const response = await fetch(`${DEXSCREENER_API_URL}/tokens/${mint}`);

      if (!response.ok) {
        throw new Error(`DexScreener API error: ${response.status}`);
      }

      const data = await response.json();

      if (data.pairs && data.pairs.length > 0) {
        // Get the pair with highest liquidity
        const bestPair = data.pairs.sort((a, b) =>
          (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
        )[0];

        if (bestPair.priceUsd) {
          // Convert USD price to SOL
          const solPrice = await this.getSolPriceUSD();
          if (solPrice > 0) {
            return parseFloat(bestPair.priceUsd) / solPrice;
          }
        }
      }

      return 0;
    } catch (error) {
      console.error('DexScreener price fetch error:', error.message);
      return 0;
    }
  }

  /**
   * Get last known price from transaction history
   */
  static async getLastKnownPrice(mint) {
    try {
      const result = await query(
        `SELECT price_sol
         FROM transactions
         WHERE token_mint = $1
           AND price_sol > 0
           AND transaction_type IN ('BUY', 'SELL')
         ORDER BY block_time DESC
         LIMIT 1`,
        [mint]
      );

      if (result.rows.length > 0) {
        return parseFloat(result.rows[0].price_sol);
      }

      return 0;
    } catch (error) {
      console.error('Database price lookup error:', error.message);
      return 0;
    }
  }

  /**
   * Get current SOL price in USD
   */
  static async getSolPriceUSD() {
    // Check cache
    const cached = await redis.get('sol:price:usd');
    if (cached) {
      return parseFloat(cached);
    }

    // Try multiple sources
    // Priority: DexScreener → Jupiter → CoinGecko → Solscan → Database
    const sources = [
      () => this.getSolPriceFromDexScreener(),
      () => this.getSolPriceFromJupiter(),
      () => this.getSolPriceFromCoinGecko(),
      () => this.getSolPriceFromSolscan(),
      () => this.getSolPriceFromDatabase()
    ];

    for (const source of sources) {
      try {
        const price = await source();
        if (price > 0) {
          // Cache for 1 minute
          await redis.setex('sol:price:usd', 60, price.toString());
          return price;
        }
      } catch (error) {
        console.error('SOL price source error:', error.message);
        continue;
      }
    }

    // Default fallback
    console.warn('All SOL price sources failed, using fallback of $120');
    return 120;
  }

  /**
   * Get SOL price from Jupiter
   */
  static async getSolPriceFromJupiter() {
    const SOL_MINT = 'So11111111111111111111111111111111111111112';
    const response = await fetch(`${JUPITER_API_URL}/price?ids=${SOL_MINT}`);

    if (!response.ok) {
      throw new Error(`Jupiter API error: ${response.status}`);
    }

    const data = await response.json();

    if (data.data && data.data[SOL_MINT]) {
      return data.data[SOL_MINT].price;
    }

    return 0;
  }

  /**
   * Get SOL price from DexScreener
   */
  static async getSolPriceFromDexScreener() {
    const SOL_MINT = 'So11111111111111111111111111111111111111112';
    const response = await fetch(`${DEXSCREENER_API_URL}/tokens/${SOL_MINT}`);

    if (!response.ok) {
      throw new Error(`DexScreener API error: ${response.status}`);
    }

    const data = await response.json();

    if (data.pairs && data.pairs.length > 0) {
      // Get price from highest liquidity pair
      const bestPair = data.pairs.sort((a, b) =>
        (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
      )[0];

      if (bestPair.priceUsd) {
        return parseFloat(bestPair.priceUsd);
      }
    }

    return 0;
  }

  /**
   * Get SOL price from Solscan
   */
  static async getSolPriceFromSolscan() {
    const apiKey = process.env.SOLSCAN_API_KEY;
    if (!apiKey) {
      return 0;
    }

    const SOL_MINT = 'So11111111111111111111111111111111111111112';
    const response = await fetch(
      `${SOLSCAN_API_URL}/token/meta?address=${SOL_MINT}`,
      {
        headers: {
          'token': apiKey
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Solscan API error: ${response.status}`);
    }

    const data = await response.json();

    if (data.success && data.data && data.data.price) {
      return data.data.price;
    }

    return 0;
  }

  /**
   * Get SOL price from CoinGecko (fallback)
   */
  static async getSolPriceFromCoinGecko() {
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');

    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status}`);
    }

    const data = await response.json();

    if (data.solana && data.solana.usd) {
      return data.solana.usd;
    }

    return 0;
  }

  /**
   * Get SOL price from database
   */
  static async getSolPriceFromDatabase() {
    const result = await query(
      `SELECT price_usd FROM sol_prices ORDER BY date DESC LIMIT 1`
    );

    if (result.rows.length > 0) {
      return parseFloat(result.rows[0].price_usd);
    }

    return 0;
  }

  /**
   * Save historical SOL price to database
   */
  static async saveSolPrice(date, priceUSD) {
    try {
      await query(
        `INSERT INTO sol_prices (date, price_usd, source)
         VALUES ($1, $2, $3)
         ON CONFLICT (date) DO UPDATE
         SET price_usd = $2, source = $3`,
        [date, priceUSD, 'jupiter']
      );
    } catch (error) {
      console.error('Error saving SOL price:', error.message);
    }
  }

  /**
   * Get historical SOL price for a specific date
   */
  static async getHistoricalSolPrice(date) {
    try {
      const result = await query(
        `SELECT price_usd FROM sol_prices WHERE date = $1`,
        [date]
      );

      if (result.rows.length > 0) {
        return parseFloat(result.rows[0].price_usd);
      }

      // If not found, get closest price
      const closestResult = await query(
        `SELECT price_usd FROM sol_prices
         ORDER BY ABS(EXTRACT(EPOCH FROM (date - $1::date)))
         LIMIT 1`,
        [date]
      );

      if (closestResult.rows.length > 0) {
        return parseFloat(closestResult.rows[0].price_usd);
      }

      // Fallback to current price
      return await this.getSolPriceUSD();

    } catch (error) {
      console.error('Error fetching historical SOL price:', error.message);
      return await this.getSolPriceUSD();
    }
  }

  /**
   * Batch fetch prices for multiple tokens
   */
  static async getBatchPrices(mints) {
    const prices = {};

    // Try to get all from Jupiter in one request
    try {
      const mintsQuery = mints.join(',');
      const response = await fetch(`${JUPITER_API_URL}/price?ids=${mintsQuery}`);

      if (response.ok) {
        const data = await response.json();
        const solPrice = await this.getSolPriceUSD();

        for (const mint of mints) {
          if (data.data && data.data[mint]) {
            prices[mint] = data.data[mint].price / solPrice;
            // Cache each price
            await this.setCachedPrice(mint, prices[mint]);
          }
        }
      }
    } catch (error) {
      console.error('Batch price fetch error:', error.message);
    }

    // Fill in missing prices individually
    for (const mint of mints) {
      if (!prices[mint]) {
        prices[mint] = await this.getCurrentTokenPrice(mint);
      }
    }

    return prices;
  }
}

module.exports = PriceOracle;
