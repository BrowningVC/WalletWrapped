const { Pool } = require('pg');
require('dotenv').config();

// Optimized connection pool configuration
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,                      // Maximum connections
  min: 5,                       // Minimum idle connections
  idleTimeoutMillis: 30000,     // Close idle connections after 30s
  connectionTimeoutMillis: 5000, // Fail fast if can't connect
  statement_timeout: 10000,     // 10s max per query
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
async function batchInsert(table, columns, values, batchSize = 500) {
  const batches = [];
  for (let i = 0; i < values.length; i += batchSize) {
    batches.push(values.slice(i, i + batchSize));
  }

  const results = [];
  for (const batch of batches) {
    const placeholders = batch.map((_, i) => {
      const offset = i * columns.length;
      return `(${columns.map((_, j) => `$${offset + j + 1}`).join(', ')})`;
    }).join(', ');

    const query = `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${placeholders}`;
    const flatValues = batch.flat();

    const res = await pool.query(query, flatValues);
    results.push(res);
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
