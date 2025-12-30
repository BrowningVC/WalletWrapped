require('dotenv').config();

// Validate environment variables before anything else
const { validateEnv } = require('./utils/envValidator');
validateEnv();

const cluster = require('cluster');
const os = require('os');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

// Database initialization
const { query } = require('./config/database');
const redis = require('./config/redis');
const DatabaseQueries = require('./database/queries');

// Routes
const analyzeRoutes = require('./routes/analyze');
const walletRoutes = require('./routes/wallet');
const monitorRoutes = require('./routes/monitor');
const adminRoutes = require('./routes/admin');

// Services
const PriceOracle = require('./services/priceOracle');

// Middleware
const { attachCSRFToken } = require('./middleware/csrf');

// Socket.io handlers
const { initializeSocketHandlers } = require('./socket/handlers');

// Analysis Orchestrator (replaces old queue-based worker)
const AnalysisOrchestrator = require('./services/analysisOrchestrator');

// Card Generator - pre-load fonts at startup
const CardGenerator = require('./services/cardGenerator');

// Number of CPU cores to use (leave 1 for system)
const NUM_WORKERS = Math.max(1, os.cpus().length - 1);

// Constants
const PORT = process.env.PORT || 3002;
const NODE_ENV = process.env.NODE_ENV || 'development';
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';

// All allowed client origins for CORS
const ALLOWED_ORIGINS = [
  CLIENT_URL,
  'https://walletwrapped.io',
  'https://www.walletwrapped.io',
  'https://wallet-wrapped-client-production.up.railway.app',  // Railway client
];

/**
 * Express App Setup
 */
const app = express();
const server = http.createServer(app);

// Socket.io setup with CORS
const io = new Server(server, {
  cors: {
    origin: NODE_ENV === 'production' ? ALLOWED_ORIGINS : '*',
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

/**
 * Middleware
 */

// Security headers with proper CSP
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // unsafe-inline needed for Next.js
      styleSrc: ["'self'", "'unsafe-inline'"], // unsafe-inline needed for Tailwind
      imgSrc: ["'self'", "data:", "https:", "blob:"], // Allow external images
      fontSrc: ["'self'", "data:"],
      connectSrc: ["'self'", ...ALLOWED_ORIGINS, "https://mainnet.helius-rpc.com", "https://api.helius.xyz"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: NODE_ENV === 'production' ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false, // Keep disabled for external images
  crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow cross-origin resources
}));

// CORS - must specify explicit origins when using credentials
app.use(cors({
  origin: NODE_ENV === 'production'
    ? ALLOWED_ORIGINS
    : ['http://localhost:3000', 'http://127.0.0.1:3000', CLIENT_URL],
  credentials: true
}));

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Compression
app.use(compression());

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} ${res.statusCode} - ${duration}ms`);
  });
  next();
});

// Global rate limiting (100 requests per minute per IP)
const globalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  message: {
    error: 'Too many requests',
    message: 'Please slow down and try again later'
  },
  standardHeaders: true,
  legacyHeaders: false
});

app.use(globalLimiter);

/**
 * Routes
 */

// Health check
app.get('/health', async (req, res) => {
  try {
    // Check database
    await query('SELECT 1');

    // Check Redis
    await redis.ping();

    // Get active analyses count
    const activeAnalyses = AnalysisOrchestrator.getActiveCount();
    const activeWallets = AnalysisOrchestrator.getActiveWallets();

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'connected',
        redis: 'connected',
        analyses: {
          active: activeAnalyses,
          wallets: activeWallets
        }
      },
      cluster: {
        workers: NUM_WORKERS,
        pid: process.pid
      },
      version: process.env.npm_package_version || '1.0.0'
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

// CSRF token endpoint - provides token for state-changing requests
app.get('/api/csrf-token', attachCSRFToken, (req, res) => {
  res.json({
    csrfToken: res.locals.csrfToken,
    expiresIn: 3600 // seconds
  });
});

// API info
app.get('/api', (req, res) => {
  res.json({
    name: 'WalletWrapped API',
    version: '1.0.0',
    description: 'Solana wallet analytics and trading highlights',
    endpoints: {
      security: {
        'GET /api/csrf-token': 'Get CSRF token for protected requests'
      },
      analyze: {
        'POST /api/analyze': 'Start wallet analysis (requires CSRF token)',
        'GET /api/analyze/:address/status': 'Get analysis status',
        'DELETE /api/analyze/:address': 'Cancel analysis (requires CSRF token)'
      },
      wallet: {
        'GET /api/wallet/:address/summary': 'Get wallet summary',
        'GET /api/wallet/:address/positions': 'Get token positions',
        'GET /api/wallet/:address/highlights': 'Get highlight cards',
        'GET /api/wallet/:address/calendar': 'Get daily P&L calendar',
        'POST /api/wallet/:address/refresh': 'Refresh analysis'
      },
      stats: {
        'GET /api/stats': 'Get platform statistics (wallet count, etc.)'
      }
    },
    socketEvents: {
      client: ['subscribe', 'unsubscribe', 'ping'],
      server: ['progress', 'complete', 'error', 'status', 'pong']
    }
  });
});

// Platform stats endpoint - returns wallet count and platform-wide stats for ticker
app.get('/api/stats', async (req, res) => {
  // Cache for 30 seconds to reduce DB load while keeping stats relatively fresh
  res.set('Cache-Control', 'public, max-age=30');

  try {
    // Get wallet counts (all wallets ever analyzed) and transaction totals (from completed only)
    const analysisStats = await query(`
      SELECT
        COUNT(DISTINCT wallet_address) as wallets_analyzed,
        COUNT(*) as total_analyses,
        COALESCE(SUM(CASE WHEN analysis_status = 'completed' THEN total_transactions ELSE 0 END), 0) as total_transactions
      FROM wallet_analyses
    `);

    // Get total volume (sum of all SOL spent + received across all positions)
    const volumeStats = await query(`
      SELECT
        COALESCE(SUM(sol_spent + sol_received), 0) as total_volume_sol
      FROM token_positions
    `);

    // Get highest overall P&L (from highlights table)
    const highestPnl = await query(`
      SELECT value_primary, metadata
      FROM highlights
      WHERE highlight_type = 'overall_pnl'
      ORDER BY value_primary DESC
      LIMIT 1
    `);

    // Get biggest single trade win
    const biggestWin = await query(`
      SELECT value_primary, metadata
      FROM highlights
      WHERE highlight_type = 'biggest_win'
      ORDER BY value_primary DESC
      LIMIT 1
    `);

    // Get biggest single trade loss
    const biggestLoss = await query(`
      SELECT value_primary, metadata
      FROM highlights
      WHERE highlight_type = 'biggest_loss'
      ORDER BY value_primary ASC
      LIMIT 1
    `);

    const stats = analysisStats.rows[0];
    const volume = volumeStats.rows[0];
    const activeAnalyses = AnalysisOrchestrator.getActiveCount();

    // Get current SOL price for USD conversion
    let solPriceUsd = 0;
    try {
      solPriceUsd = await PriceOracle.getSolPriceUSD();
    } catch (e) {
      console.error('Failed to get SOL price:', e.message);
    }

    res.json({
      walletsAnalyzed: parseInt(stats.wallets_analyzed) || 0,
      totalAnalyses: parseInt(stats.total_analyses) || 0,
      totalTransactions: parseInt(stats.total_transactions) || 0,
      totalVolumeSol: parseFloat(volume.total_volume_sol) || 0,
      solPriceUsd: solPriceUsd,
      activeAnalyses: activeAnalyses,
      // Leaderboard stats
      highestPnl: highestPnl.rows[0] ? {
        valueSol: parseFloat(highestPnl.rows[0].value_primary) || 0,
        wallet: highestPnl.rows[0].metadata?.wallet_short || null
      } : null,
      biggestWin: biggestWin.rows[0] ? {
        valueSol: parseFloat(biggestWin.rows[0].value_primary) || 0,
        ticker: biggestWin.rows[0].metadata?.token_symbol || null
      } : null,
      biggestLoss: biggestLoss.rows[0] ? {
        valueSol: parseFloat(biggestLoss.rows[0].value_primary) || 0,
        ticker: biggestLoss.rows[0].metadata?.token_symbol || null
      } : null,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Stats endpoint error:', error);
    res.status(500).json({
      error: 'Failed to fetch stats',
      walletsAnalyzed: 0,
      totalAnalyses: 0,
      totalTransactions: 0,
      totalVolumeSol: 0,
      solPriceUsd: 0,
      activeAnalyses: 0,
      highestPnl: null,
      biggestWin: null,
      biggestLoss: null
    });
  }
});

// Mount API routes
app.use('/api', analyzeRoutes);
app.use('/api', walletRoutes);
app.use('/api/monitor', monitorRoutes);
app.use('/api/admin', adminRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Route ${req.method} ${req.path} not found`
  });
});

// Error handler - NEVER leak internal details
app.use((err, req, res, next) => {
  // Log full error server-side for debugging
  console.error('Express error:', err);

  const status = err.status || 500;

  // SECURITY: Only expose error messages for client errors (4xx)
  // NEVER expose internal server errors (5xx) or stack traces
  const isClientError = status >= 400 && status < 500;
  const message = isClientError ? err.message : 'Internal server error';

  res.status(status).json({
    error: isClientError ? (err.name || 'Error') : 'Error',
    message
    // NEVER include stack traces in any response
  });
});

/**
 * Initialize Services
 */

async function initializeServices() {
  console.log('\n========================================');
  console.log('WalletWrapped Server Starting...');
  console.log(`Worker PID: ${process.pid}`);
  console.log('========================================\n');

  try {
    // Test database connection
    console.log('Testing database connection...');
    await query('SELECT NOW()');
    console.log('Database connected\n');

    // Test Redis connection
    console.log('Testing Redis connection...');
    await redis.ping();
    console.log('Redis connected\n');

    // Initialize Socket.io
    console.log('Initializing Socket.io...');
    initializeSocketHandlers(io);
    AnalysisOrchestrator.setSocketIO(io); // Connect orchestrator to Socket.io
    console.log('Socket.io initialized\n');

    // Pre-load fonts for card generation (non-blocking, but ensures fonts are ready)
    console.log('Pre-loading fonts for card generation...');
    CardGenerator.loadFonts().then(success => {
      if (success) {
        console.log('Card generation fonts ready');
      } else {
        console.error('WARNING: Card generation fonts failed to load - cards will fallback to client generation');
      }
    });

    // Clear orphaned analysis locks on startup (from previous crashes)
    console.log('Clearing orphaned analysis locks...');
    const RateLimiter = require('./utils/rateLimiter');
    const lockKeys = await RateLimiter.scanKeys('lock:analysis:*');
    if (lockKeys.length > 0) {
      await redis.redis.del(...lockKeys);
      console.log(`Cleared ${lockKeys.length} orphaned analysis locks`);
    } else {
      console.log('No orphaned locks found');
    }

    console.log('\n========================================');
    console.log('All services initialized successfully');
    console.log('Ready for concurrent wallet analyses!');
    console.log('========================================\n');

  } catch (error) {
    console.error('\nService initialization failed:', error);
    process.exit(1);
  }
}

/**
 * Start Server
 */

async function startServer() {
  await initializeServices();

  server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📍 Environment: ${NODE_ENV}`);
    console.log(`🌐 Client URL: ${CLIENT_URL}`);
    console.log(`\n📡 Endpoints:`);
    console.log(`   - Health: http://localhost:${PORT}/health`);
    console.log(`   - API Info: http://localhost:${PORT}/api`);
    console.log(`   - Socket.io: ws://localhost:${PORT}`);
    console.log(`\n✨ Ready to analyze wallets!\n`);

    // Run cleanup of stale processing analyses every 2 minutes
    // IMPORTANT: Store interval ID for cleanup on shutdown
    global.cleanupInterval = setInterval(async () => {
      try {
        await DatabaseQueries.cleanupStaleProcessing();
      } catch (error) {
        console.error('Cleanup stale processing error:', error.message);
      }
    }, 2 * 60 * 1000);

    // Run initial cleanup on startup
    DatabaseQueries.cleanupStaleProcessing().catch(err =>
      console.error('Initial stale cleanup error:', err.message)
    );
  });
}

/**
 * Graceful Shutdown
 */

async function gracefulShutdown(signal) {
  console.log(`\n${signal} received, shutting down gracefully...`);

  // Clear cleanup interval FIRST to prevent new cleanup tasks
  if (global.cleanupInterval) {
    clearInterval(global.cleanupInterval);
    global.cleanupInterval = null;
    console.log('✓ Cleanup interval stopped');
  }

  // Stop accepting new connections
  server.close(async () => {
    console.log('HTTP server closed');

    try {
      // Close Socket.io
      io.close(() => {
        console.log('Socket.io closed');
      });

      // Close database pool
      const { pool } = require('./config/database');
      await pool.end();
      console.log('Database pool closed');

      // Close Redis
      await redis.disconnect();
      console.log('Redis connection closed');

      console.log('✓ Graceful shutdown complete');
      process.exit(0);

    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  });

  // Force shutdown after 30 seconds
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
}

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
// Uncaught exceptions are fatal - they indicate corrupted state
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

// Unhandled rejections are logged but don't crash the process
// This prevents a single failed promise from taking down the entire server
let unhandledRejectionCount = 0;
const MAX_UNHANDLED_REJECTIONS = 100; // Crash if too many rejections indicate systemic issue

process.on('unhandledRejection', (reason, promise) => {
  unhandledRejectionCount++;
  console.error(`Unhandled rejection #${unhandledRejectionCount}:`, reason);

  // If we hit too many unhandled rejections, something is systematically wrong
  if (unhandledRejectionCount >= MAX_UNHANDLED_REJECTIONS) {
    console.error(`Too many unhandled rejections (${unhandledRejectionCount}), shutting down...`);
    gracefulShutdown('TOO_MANY_UNHANDLED_REJECTIONS');
  }
});

// Start the server - cluster mode disabled by default for Railway (limited DB connections)
if (require.main === module) {
  const USE_CLUSTER = process.env.USE_CLUSTER === 'true'; // Must explicitly enable

  if (USE_CLUSTER && cluster.isPrimary) {
    console.log(`\n========================================`);
    console.log(`Primary process ${process.pid} starting`);
    console.log(`Spawning ${NUM_WORKERS} worker processes...`);
    console.log(`========================================\n`);

    // Fork workers
    for (let i = 0; i < NUM_WORKERS; i++) {
      cluster.fork();
    }

    // Handle worker exit
    cluster.on('exit', (worker, code, signal) => {
      console.log(`Worker ${worker.process.pid} died (${signal || code}). Restarting...`);
      cluster.fork();
    });

    // Log when workers come online
    cluster.on('online', (worker) => {
      console.log(`Worker ${worker.process.pid} is online`);
    });

  } else {
    // Single process mode (development) or worker process (production)
    startServer().catch((error) => {
      console.error('Failed to start server:', error);
      process.exit(1);
    });
  }
}

module.exports = { app, server, io };

