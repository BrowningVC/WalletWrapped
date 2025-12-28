const { createClient } = require('redis');
require('dotenv').config();

// Create Redis client
const redis = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

// Error handling
redis.on('error', (err) => {
  console.error('Redis Client Error:', err);
});

redis.on('connect', () => {
  console.log('Redis connected successfully');
});

redis.on('reconnecting', () => {
  console.log('Redis reconnecting...');
});

// Connect to Redis
(async () => {
  try {
    await redis.connect();
  } catch (error) {
    console.error('Failed to connect to Redis:', error);
    process.exit(1);
  }
})();

// Helper functions for common operations
const redisHelpers = {
  // Set with TTL
  async setex(key, seconds, value) {
    return await redis.setEx(key, seconds, JSON.stringify(value));
  },

  // Get and parse JSON
  async get(key) {
    const value = await redis.get(key);
    return value ? JSON.parse(value) : null;
  },

  // Delete key(s)
  async del(...keys) {
    return await redis.del(keys);
  },

  // Check if key exists
  async exists(key) {
    return await redis.exists(key);
  },

  // Increment counter
  async incr(key) {
    return await redis.incr(key);
  },

  // Set hash field
  async hset(key, field, value) {
    return await redis.hSet(key, field, JSON.stringify(value));
  },

  // Get hash field
  async hget(key, field) {
    const value = await redis.hGet(key, field);
    return value ? JSON.parse(value) : null;
  },

  // Get all hash fields
  async hgetall(key) {
    const obj = await redis.hGetAll(key);
    const result = {};
    for (const [field, value] of Object.entries(obj)) {
      result[field] = JSON.parse(value);
    }
    return result;
  },

  // Add to sorted set
  async zadd(key, score, member) {
    return await redis.zAdd(key, { score, value: member });
  },

  // Get sorted set members
  async zrange(key, start, stop) {
    return await redis.zRange(key, start, stop);
  },

  // Store binary data (e.g., PNG images) as base64
  async setBinary(key, seconds, buffer) {
    const base64 = buffer.toString('base64');
    return await redis.setEx(key, seconds, base64);
  },

  // Get binary data (returns Buffer)
  async getBinary(key) {
    const base64 = await redis.get(key);
    return base64 ? Buffer.from(base64, 'base64') : null;
  }
};

// Clean up on shutdown
process.on('SIGINT', async () => {
  console.log('Closing Redis connection...');
  await redis.quit();
  process.exit(0);
});

// Ping function for health checks
async function ping() {
  return await redis.ping();
}

// Disconnect function
async function disconnect() {
  return await redis.quit();
}

module.exports = {
  redis,
  ping,
  disconnect,
  ...redisHelpers
};
