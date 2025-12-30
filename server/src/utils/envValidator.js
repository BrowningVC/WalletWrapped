/**
 * Environment Variable Validation
 * Validates all required environment variables on startup
 * Prevents runtime failures due to missing configuration
 */

const requiredEnvVars = [
  // API Keys
  { name: 'HELIUS_API_KEY', description: 'Helius API key for Solana RPC' },

  // Server Configuration
  { name: 'PORT', description: 'Server port', type: 'number', default: 3002 },
  { name: 'NODE_ENV', description: 'Environment (development/production)', default: 'development' },
];

// Database can be configured via DATABASE_URL (Railway) or individual vars (local)
const databaseEnvVars = [
  { name: 'DATABASE_URL', description: 'PostgreSQL connection string (Railway)' },
  // OR individual vars:
  { name: 'POSTGRES_HOST', description: 'PostgreSQL host' },
  { name: 'POSTGRES_PORT', description: 'PostgreSQL port', type: 'number' },
  { name: 'POSTGRES_DB', description: 'PostgreSQL database name' },
  { name: 'POSTGRES_USER', description: 'PostgreSQL username' },
  { name: 'POSTGRES_PASSWORD', description: 'PostgreSQL password', allowEmpty: true },
];

// Redis can be configured via REDIS_URL (Railway) or individual vars (local)
const redisEnvVars = [
  { name: 'REDIS_URL', description: 'Redis connection string (Railway)' },
  // OR individual vars:
  { name: 'REDIS_HOST', description: 'Redis host' },
  { name: 'REDIS_PORT', description: 'Redis port', type: 'number' },
];

const optionalEnvVars = [
  { name: 'CLIENT_URL', description: 'Frontend URL for CORS', default: 'http://localhost:3000' },
  { name: 'HELIUS_RPS_LIMIT', description: 'Helius API rate limit (RPS)', type: 'number', default: 200 },
  { name: 'MAX_CONCURRENT_ANALYSES', description: 'Max concurrent wallet analyses', type: 'number', default: 80 },
  { name: 'REDIS_PASSWORD', description: 'Redis password (if required)' },
];

/**
 * Validate environment variables on startup
 * @throws {Error} If required variables are missing or invalid
 */
function validateEnv() {
  const errors = [];
  const warnings = [];

  console.log('\n=== Environment Variable Validation ===\n');

  // Check required variables
  for (const envVar of requiredEnvVars) {
    const value = process.env[envVar.name];

    if (!value && !envVar.default && !envVar.allowEmpty) {
      errors.push(`Missing required environment variable: ${envVar.name} (${envVar.description})`);
      continue;
    }

    // Use default if not set
    if (!value && envVar.default) {
      process.env[envVar.name] = String(envVar.default);
      warnings.push(`Using default for ${envVar.name}: ${envVar.default}`);
    }

    // Type validation
    if (value && envVar.type === 'number') {
      const num = parseInt(value);
      if (isNaN(num)) {
        errors.push(`Invalid type for ${envVar.name}: expected number, got "${value}"`);
      }
    }

    if (value || envVar.default || envVar.allowEmpty) {
      console.log(`✓ ${envVar.name}: ${value ? '***' : envVar.default ? `${envVar.default} (default)` : '(empty)'}`);
    }
  }

  // Check database configuration (DATABASE_URL or individual vars)
  console.log('\n--- Database Configuration ---\n');
  const hasDbUrl = !!process.env.DATABASE_URL;
  const hasDbVars = process.env.POSTGRES_HOST && process.env.POSTGRES_DB && process.env.POSTGRES_USER;

  if (hasDbUrl) {
    console.log(`✓ DATABASE_URL: *** (connection string)`);
  } else if (hasDbVars) {
    console.log(`✓ POSTGRES_HOST: ${process.env.POSTGRES_HOST}`);
    console.log(`✓ POSTGRES_PORT: ${process.env.POSTGRES_PORT || 5432}`);
    console.log(`✓ POSTGRES_DB: ${process.env.POSTGRES_DB}`);
    console.log(`✓ POSTGRES_USER: ***`);
    console.log(`✓ POSTGRES_PASSWORD: ***`);
  } else {
    errors.push('Missing database configuration: Set DATABASE_URL or POSTGRES_HOST/DB/USER/PASSWORD');
  }

  // Check Redis configuration (REDIS_URL or individual vars)
  console.log('\n--- Redis Configuration ---\n');
  const hasRedisUrl = !!process.env.REDIS_URL;
  const hasRedisVars = !!process.env.REDIS_HOST;

  if (hasRedisUrl) {
    console.log(`✓ REDIS_URL: *** (connection string)`);
  } else if (hasRedisVars) {
    console.log(`✓ REDIS_HOST: ${process.env.REDIS_HOST}`);
    console.log(`✓ REDIS_PORT: ${process.env.REDIS_PORT || 6379}`);
  } else {
    errors.push('Missing Redis configuration: Set REDIS_URL or REDIS_HOST/PORT');
  }

  // Check optional variables
  console.log('\n--- Optional Variables ---\n');
  for (const envVar of optionalEnvVars) {
    const value = process.env[envVar.name];

    if (!value && envVar.default) {
      process.env[envVar.name] = String(envVar.default);
      console.log(`○ ${envVar.name}: ${envVar.default} (default)`);
    } else if (value) {
      console.log(`○ ${envVar.name}: ***`);
    } else {
      console.log(`○ ${envVar.name}: not set`);
    }
  }

  // Print warnings
  if (warnings.length > 0) {
    console.log('\n--- Warnings ---\n');
    warnings.forEach(warning => console.warn(`⚠  ${warning}`));
  }

  // Print errors and exit if any
  if (errors.length > 0) {
    console.error('\n--- ERRORS ---\n');
    errors.forEach(error => console.error(`✗ ${error}`));
    console.error('\n=== Environment validation failed ===\n');
    console.error('Please check your .env file and ensure all required variables are set.\n');
    process.exit(1);
  }

  console.log('\n=== Environment validation passed ===\n');
}

/**
 * Get validated environment variable with type coercion
 * @param {string} name - Environment variable name
 * @param {*} defaultValue - Default value if not set
 * @returns {string|number} Typed environment variable value
 */
function getEnv(name, defaultValue = undefined) {
  const value = process.env[name];

  if (!value) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Environment variable ${name} is not set`);
  }

  // Auto-detect number type
  if (!isNaN(Number(value)) && value.trim() !== '') {
    return Number(value);
  }

  return value;
}

module.exports = {
  validateEnv,
  getEnv
};
