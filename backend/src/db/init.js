/**
 * Database initialization script
 *
 * Runs the initial migration to set up all tables.
 * Safe to run multiple times (idempotent).
 *
 * Usage:
 *   node src/db/init.js
 *   npm run db:init
 */

const fs = require('fs');
const path = require('path');
const { pool, testConnection } = require('../config/database');
const logger = require('../utils/logger');

const runMigrations = async () => {
  logger.info('🔄 Starting database initialization...');

  try {
    // Test connection first
    await testConnection();

    const client = await pool.connect();

    try {
      // Read and execute migration file
      const migrationPath = path.join(__dirname, 'migrations', '001_initial_schema.sql');
      const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

      await client.query(migrationSQL);
      logger.info('✅ Database schema initialized successfully');
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('❌ Database initialization failed:', error);
    throw error;
  }
};

// Run if called directly (not imported)
// Only close the pool when running as a standalone CLI script
if (require.main === module) {
  runMigrations()
    .then(async () => {
      console.log('✅ Database initialized. Exiting.');
      await pool.end();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('❌ Failed:', err.message);
      await pool.end();
      process.exit(1);
    });
}

module.exports = { runMigrations };
