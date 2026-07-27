/**
 * setup-db.js
 * Initialize the SQLite database with all tables and indexes.
 * Run once before starting the server for the first time:
 *
 *   node scripts/setup-db.js
 *
 * Safe to run multiple times — uses IF NOT EXISTS throughout.
 */

import { initializeDatabase, closeDatabase, getDatabase } from '../src/config/database.js';

async function setup() {
  console.log('🔧 Setting up database...\n');

  try {
    await initializeDatabase();

    const db = await getDatabase();

    // List all created tables
    const tables = await db.all(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    );

    console.log('\n📊 Tables created:');
    tables.forEach((t) => console.log(`   ✅ ${t.name}`));

    // List all indexes
    const indexes = await db.all(
      "SELECT name, tbl_name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY tbl_name"
    );

    console.log('\n🔍 Indexes created:');
    indexes.forEach((i) => console.log(`   ✅ ${i.name} (on ${i.tbl_name})`));

    console.log('\n✅ Database setup complete!\n');
    await closeDatabase();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Database setup failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

setup();
