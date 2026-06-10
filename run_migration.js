const fs = require('fs');
const path = require('path');
const { pool } = require('./backend/src/config/database');

async function runMigration() {
  try {
    console.log('Connecting to database...');
    const client = await pool.connect();
    
    try {
      const sqlPath = path.join(__dirname, 'backend', 'src', 'db', 'migrations', '002_add_fts_hybrid_search.sql');
      const sql = fs.readFileSync(sqlPath, 'utf8');
      
      console.log('Executing migration 002_add_fts_hybrid_search.sql...');
      await client.query(sql);
      
      console.log('✅ Migration applied successfully.');
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await pool.end();
  }
}

runMigration();
