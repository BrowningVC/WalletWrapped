const { Pool } = require('pg');
require('dotenv').config();

// Optimized connection pool configuration for 50+ concurrent analyses
// Phase 2 optimization: Increased warm connections and query timeout
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 100,                     // Maximum connections (increased for concurrency)
  min: 20,                      // Keep more connections warm (2x increase)
  idleTimeoutMillis: 30000,     // Close idle connections after 30s
  connectionTimeoutMillis: 10000, // 10s to acquire connection
  statement_timeout: 120000,    // 2 minutes for large batch inserts (30k txs)
  application_name: 'walletwrapped'
});

// Handle pool errors
pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
  process.exit(-1);
});

// Test connection on startup
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Database connection failed:', err);
  } else {
    console.log('Database connected successfully at', res.rows[0].now);
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
// Phase 2 optimization: Larger batches with more parallelism
async function batchInsert(table, columns, values, batchSize = 1000) {
  const batches = [];
  for (let i = 0; i < values.length; i += batchSize) {
    batches.push(values.slice(i, i + batchSize));
  }

  // Process batches in parallel (pool handles connection management)
  const PARALLEL_BATCHES = 10; // Insert 10 batches concurrently (2x increase)
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
  batchInsert
};
