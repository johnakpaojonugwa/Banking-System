import db from '../src/config/db.js';
import { runMigrations } from '../src/migrate.js';

/**
 * Truncates and cleans all tables in the database before running tests.
 */
export async function setupTestDb() {
  if (db.isInMemory()) return;

  // Run migrations to ensure schema is ready
  await runMigrations();

  // Truncate tables in dependency order
  await db.query(`
    TRUNCATE TABLE 
      transactions, 
      audit_logs, 
      loans, 
      cards, 
      beneficiaries, 
      accounts, 
      users 
    RESTART IDENTITY CASCADE;
  `);
}

export default { setupTestDb };
