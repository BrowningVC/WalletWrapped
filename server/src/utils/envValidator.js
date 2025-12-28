/**
 * Environment Variable Validation
 * Validates all required environment variables on startup
 * Prevents runtime failures due to missing configuration
 */

const requiredEnvVars = [
  // Database
  { name: 'POSTGRES_HOST', description: 'PostgreSQL host' },
  { name: 'POSTGRES_PORT', description: 'PostgreSQL port', type: 'number' },
  { name: 'POSTGRES_DB', description: 'PostgreSQL database name' },
  { name: 'POSTGRES_USER', description: 'PostgreSQL username' },
  { name: 'POSTGRES_PASSWORD', description: 'PostgreSQL password' },

  // Redis
  { name: 'REDIS_HOST', description: 'Redis host' },
  { name: 'REDIS_PORT', description: 'Redis port', type: 'number' },

  // API Keys
  { name: 'HELIUS_API_KEY', description: 'Helius API key for Solana RPC' },

  // Server Configuration
  { name: 'PORT', description: 'Server port', type: 'number', default: 3002 },
  { name: 'NODE_ENV', description: 'Environment (development/production)', default: 'development' },
];

const optionalEnvVars = [
  { name: 'CLIENT_URL', description: 'Frontend URL for CORS', default: 'http://localhost:3000' },
  { name: 'HELIUS_RPS_LIMIT', description: 'Helius API rate limit (RPS)', type: 'number', default: 10 },
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

    if (!value && !envVar.default) {
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

    if (value || envVar.default) {
      console.log(`✓ ${envVar.name}: ${value ? '***' : `${envVar.default} (default)`}`);
    }
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
