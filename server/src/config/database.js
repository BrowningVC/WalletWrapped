const { Pool } = require('pg');
require('dotenv').config();

// Log database URL (masked) for debugging Railway connections
const dbUrl = process.env.DATABASE_URL;
if (dbUrl) {
  try {
    const url = new URL(dbUrl);
    console.log(`Database URL configured: ${url.protocol}//${url.username}:***@${url.hostname}:${url.port}${url.pathname}`);
  } catch (e) {
    console.log('Database URL configured (could not parse for logging)');
  }
} else {
  console.error('WARNING: DATABASE_URL is not set!');
}

// Connection pool configuration - Railway shared Postgres has limited connections
// With cluster mode disabled, we can use more connections safely
const isProduction = process.env.NODE_ENV === 'production';
const maxConnections = parseInt(process.env.DB_POOL_MAX) || (isProduction ? 20 : 20);
const minConnections = parseInt(process.env.DB_POOL_MIN) || (isProduction ? 5 : 5);

console.log(`Database pool config: max=${maxConnections}, min=${minConnections}`);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: maxConnections,           // Configurable via DB_POOL_MAX env var
  min: minConnections,           // Configurable via DB_POOL_MIN env var
  idleTimeoutMillis: 30000,      // Close idle connections after 30s
  connectionTimeoutMillis: 5000, // 5s to acquire connection
  statement_timeout: 120000,     // 2 minutes for large batch inserts
  application_name: 'walletwrapped',
  ssl: isProduction ? { rejectUnauthorized: false } : false
});

// Handle pool errors - log but don't crash immediately
pool.on('error', (err) => {
  console.error('Database pool error:', err.message);
  // Don't exit - let the app try to recover
});

// Track database connection status
let isDatabaseConnected = false;
let connectionError = null;

/**
 * Test database connection with timeout
 * Returns true if connected, false otherwise
 */
async function testConnection(timeout = 10000) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const result = await Promise.race([
      pool.query('SELECT NOW()'),
      new Promise((_, reject) => {
        controller.signal.addEventListener('abort', () => {
          reject(new Error('Database connection timeout'));
        });
      })
    ]);

    clearTimeout(timeoutId);
    isDatabaseConnected = true;
    connectionError = null;
    console.log('Database connected successfully at', result.rows[0].now);
    return true;
  } catch (err) {
    isDatabaseConnected = false;
    connectionError = err.message;
    console.error('Database connection failed:', err.message);
    return false;
  }
}

/**
 * Check if database is currently connected
 */
function isConnected() {
  return isDatabaseConnected;
}

/**
 * Get last connection error
 */
function getConnectionError() {
  return connectionError;
}

// Test connection on startup (non-blocking)
testConnection().then(connected => {
  if (!connected) {
    console.error('WARNING: Server started without database connection!');
    console.error('Database operations will fail until connection is restored.');
  }
});

// Helper function to execute queries
async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;

    // Log slow queries
    if (duration > 1000) {
      console.warn('Slow query detected:', { text, duration, rows: res.rowCount });
    }

    return res;
  } catch (error) {
    console.error('Database query error:', { text, error: error.message });
    throw error;
  }
}

// Helper function to execute queries with a transaction
async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Batch insert helper (for performance)
async function batchInsert(table, columns, values, batchSize = 500) {
  const batches = [];
  for (let i = 0; i < values.length; i += batchSize) {
    batches.push(values.slice(i, i + batchSize));
  }

  // Process batches in parallel - can use more with single process
  const PARALLEL_BATCHES = isProduction ? 5 : 8;
  const results = [];

  for (let i = 0; i < batches.length; i += PARALLEL_BATCHES) {
    const batchGroup = batches.slice(i, i + PARALLEL_BATCHES);

    const groupResults = await Promise.all(
      batchGroup.map(batch => {
        const placeholders = batch.map((_, idx) => {
          const offset = idx * columns.length;
          return `(${columns.map((_, j) => `$${offset + j + 1}`).join(', ')})`;
        }).join(', ');

        const queryText = `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${placeholders}`;
        const flatValues = batch.flat();

        return pool.query(queryText, flatValues);
      })
    );

    results.push(...groupResults);
  }

  return results;
}

/**
 * Batch upsert helper - inserts or updates multiple rows in a single query
 * Uses UNNEST for efficient bulk operations (much faster than individual upserts)
 * @param {string} table - Table name
 * @param {string[]} columns - Column names
 * @param {any[][]} values - Array of value arrays
 * @param {string[]} conflictColumns - Columns for ON CONFLICT
 * @param {string[]} updateColumns - Columns to update on conflict (if omitted, updates all non-conflict columns)
 * @param {string[]} columnTypes - PostgreSQL types for UNNEST (e.g., 'text', 'numeric', 'jsonb')
 */
async function batchUpsert(table, columns, values, conflictColumns, updateColumns = null, columnTypes = null) {
  if (!values || values.length === 0) return { rowCount: 0 };

  // Default: update all columns except conflict columns
  const colsToUpdate = updateColumns || columns.filter(c => !conflictColumns.includes(c));

  // Build UNNEST query for bulk upsert
  // This is much faster than individual INSERT...ON CONFLICT for large batches
  const types = columnTypes || columns.map(() => 'text');
  const unnestParts = columns.map((col, i) => `UNNEST($${i + 1}::${types[i]}[]) AS ${col}`);

  const updateSet = colsToUpdate.map(col => `${col} = EXCLUDED.${col}`).join(', ');

  const queryText = `
    INSERT INTO ${table} (${columns.join(', ')})
    SELECT ${columns.join(', ')} FROM (SELECT ${unnestParts.join(', ')}) AS data
    ON CONFLICT (${conflictColumns.join(', ')}) DO UPDATE SET
      ${updateSet},
      updated_at = CURRENT_TIMESTAMP
  `;

  // Transpose values: from array of rows to array of columns
  const columnArrays = columns.map((_, colIdx) => values.map(row => row[colIdx]));

  return pool.query(queryText, columnArrays);
}

// Clean up on application shutdown
process.on('SIGINT', async () => {
  console.log('Closing database pool...');
  await pool.end();
  process.exit(0);
});

module.exports = {
  pool,
  query,
  transaction,
  batchInsert,
  batchUpsert,
  testConnection,
  isConnected,
  getConnectionError
};
