import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db, { initDb } from './config/db.js';
import logger from './utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations() {
  await initDb();
  const sqlPath = path.resolve(__dirname, '../migrations/001_initial_schema.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  logger.info('Executing database migrations...');
  if (db.isInMemory()) {
    logger.info('Running against in-memory database engine. Schema structure is ready.');
  } else {
    await db.query(sql);
    logger.info('PostgreSQL Migration completed successfully.');
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error('Migration failed:', err);
      process.exit(1);
    });
}

export default runMigrations;
