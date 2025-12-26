require('dotenv').config();
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

// Routes
const analyzeRoutes = require('./routes/analyze');
const walletRoutes = require('./routes/wallet');

// Socket.io handlers
const { initializeSocketHandlers } = require('./socket/handlers');

// Worker
const { startWorker, setSocketIO } = require('./workers/analysisWorker');
const { cleanOldJobs, getQueueStats } = require('./workers/queue');

// Constants
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';

/**
 * Express App Setup
 */
const app = express();
const server = http.createServer(app);

// Socket.io setup with CORS
const io = new Server(server, {
  cors: {
    origin: NODE_ENV === 'production'
      ? [CLIENT_URL, 'https://walletwrapped.com', 'https://www.walletwrapped.com']
      : '*',
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

/**
 * Middleware
 */

// Security headers
app.use(helmet({
  contentSecurityPolicy: false, // Allow embedding images
  crossOriginEmbedderPolicy: false
}));

// CORS
app.use(cors({
  origin: NODE_ENV === 'production'
    ? [CLIENT_URL, 'https://walletwrapped.com', 'https://www.walletwrapped.com']
    : '*',
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

    // Get queue stats
    const queueStats = await getQueueStats();

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'connected',
        redis: 'connected',
        queue: queueStats
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

// API info
app.get('/api', (req, res) => {
  res.json({
    name: 'WalletWrapped API',
    version: '1.0.0',
    description: 'Solana wallet analytics and trading highlights',
    endpoints: {
      analyze: {
        'POST /api/analyze': 'Start wallet analysis',
        'GET /api/analyze/:address/status': 'Get analysis status',
        'DELETE /api/analyze/:address': 'Cancel analysis'
      },
      wallet: {
        'GET /api/wallet/:address/summary': 'Get wallet summary',
        'GET /api/wallet/:address/positions': 'Get token positions',
        'GET /api/wallet/:address/highlights': 'Get highlight cards',
        'GET /api/wallet/:address/calendar': 'Get daily P&L calendar',
        'POST /api/wallet/:address/refresh': 'Refresh analysis'
      }
    },
    socketEvents: {
      client: ['subscribe', 'unsubscribe', 'ping'],
      server: ['progress', 'complete', 'error', 'status', 'pong']
    }
  });
});

// Mount API routes
app.use('/api', analyzeRoutes);
app.use('/api', walletRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Route ${req.method} ${req.path} not found`
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Express error:', err);

  const status = err.status || 500;
  const message = NODE_ENV === 'production'
    ? 'Internal server error'
    : err.message;

  res.status(status).json({
    error: err.name || 'Error',
    message,
    ...(NODE_ENV === 'development' && { stack: err.stack })
  });
});

/**
 * Initialize Services
 */

async function initializeServices() {
  console.log('\n========================================');
  console.log('WalletWrapped Server Starting...');
  console.log('========================================\n');

  try {
    // Test database connection
    console.log('📊 Testing database connection...');
    await query('SELECT NOW()');
    console.log('✓ Database connected\n');

    // Test Redis connection
    console.log('🔴 Testing Redis connection...');
    await redis.ping();
    console.log('✓ Redis connected\n');

    // Initialize Socket.io
    console.log('🔌 Initializing Socket.io...');
    initializeSocketHandlers(io);
    setSocketIO(io); // Connect worker to Socket.io
    console.log('✓ Socket.io initialized\n');

    // Start worker
    console.log('⚙️  Starting analysis worker...');
    startWorker();
    console.log('✓ Worker started\n');

    // Schedule cleanup job (every 6 hours)
    setInterval(async () => {
      console.log('🧹 Cleaning old jobs...');
      await cleanOldJobs();
    }, 6 * 60 * 60 * 1000);

    console.log('========================================');
    console.log('✓ All services initialized successfully');
    console.log('========================================\n');

  } catch (error) {
    console.error('\n❌ Service initialization failed:', error);
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
  });
}

/**
 * Graceful Shutdown
 */

async function gracefulShutdown(signal) {
  console.log(`\n${signal} received, shutting down gracefully...`);

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
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  gracefulShutdown('UNHANDLED_REJECTION');
});

// Start the server
if (require.main === module) {
  startServer().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}

module.exports = { app, server, io };
