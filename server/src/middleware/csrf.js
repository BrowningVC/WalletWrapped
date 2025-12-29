const crypto = require('crypto');
const redis = require('../config/redis');

/**
 * Simple CSRF Protection Middleware
 * Uses double-submit cookie pattern with Redis-backed token validation
 *
 * For production: Consider using csurf package for more robust protection
 * This implementation provides basic CSRF protection without external dependencies
 */

const CSRF_TOKEN_EXPIRY = 3600; // 1 hour
const CSRF_TOKEN_USE_LIMIT = 10; // Allow token to be used up to 10 times
const CSRF_TOKEN_USE_WINDOW = 60; // Within 60 seconds

/**
 * Generate a CSRF token
 */
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Middleware to generate and attach CSRF token
 * Call this on GET requests to provide token to client
 */
async function attachCSRFToken(req, res, next) {
  try {
    // Generate new token
    const token = generateToken();
    const tokenKey = `csrf:${token}`;

    // Store token in Redis with expiry
    await redis.setex(tokenKey, CSRF_TOKEN_EXPIRY, '1');

    // Attach to response header for client to read
    res.setHeader('X-CSRF-Token', token);

    // Also attach to res.locals for route handler to include in body
    res.locals.csrfToken = token;

    next();
  } catch (error) {
    console.error('CSRF token generation error:', error);
    next(error);
  }
}

/**
 * Middleware to validate CSRF token
 * Call this on state-changing requests (POST, PUT, DELETE)
 * SECURITY: Only skips in development with explicit flag
 */
async function validateCSRFToken(req, res, next) {
  // Only skip CSRF if BOTH conditions are met:
  // 1. NODE_ENV is explicitly 'development'
  // 2. UNSAFE_SKIP_CSRF flag is explicitly 'true'
  const skipCSRF = process.env.NODE_ENV === 'development' &&
                   process.env.UNSAFE_SKIP_CSRF === 'true';

  if (skipCSRF) {
    console.warn('⚠️  CSRF validation skipped (development mode)');
    return next();
  }

  try {
    // Get token from header
    const token = req.headers['x-csrf-token'];

    if (!token) {
      return res.status(403).json({
        error: 'CSRF token missing',
        message: 'CSRF token required for this operation'
      });
    }

    // Check if token exists in Redis
    const tokenKey = `csrf:${token}`;
    const useCountKey = `csrf:use:${token}`;

    const exists = await redis.get(tokenKey);

    if (!exists) {
      return res.status(403).json({
        error: 'Invalid CSRF token',
        message: 'CSRF token is invalid or expired'
      });
    }

    // Check and increment use count (allows multiple requests within window)
    // This prevents race conditions when client makes concurrent requests
    const useCount = await redis.redis.incr(useCountKey);

    // Set expiry on use count key if this is the first use
    if (useCount === 1) {
      await redis.redis.expire(useCountKey, CSRF_TOKEN_USE_WINDOW);
    }

    // If exceeded use limit, reject and invalidate token
    if (useCount > CSRF_TOKEN_USE_LIMIT) {
      await redis.del(tokenKey);
      await redis.del(useCountKey);
      return res.status(403).json({
        error: 'CSRF token exhausted',
        message: 'Token has been used too many times. Please refresh and try again.'
      });
    }

    next();
  } catch (error) {
    console.error('CSRF validation error:', error);
    return res.status(500).json({
      error: 'CSRF validation failed',
      message: 'Internal server error'
    });
  }
}

/**
 * Optional: Skip CSRF for development or specific routes
 */
function skipCSRF(req, res, next) {
  // Skip CSRF in development mode
  if (process.env.NODE_ENV !== 'production') {
    return next();
  }

  // Skip for API routes that use other authentication (e.g., API keys)
  // Customize as needed
  next();
}

module.exports = {
  attachCSRFToken,
  validateCSRFToken,
  skipCSRF
};
