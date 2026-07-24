import app from './app.js';
import env from './config/env.js';
import { initDb } from './config/db.js';
import logger from './utils/logger.js';

const PORT = env.PORT || 3000;

async function startServer() {
  await initDb();
  app.listen(PORT, () => {
    logger.info(`Banking Management System API listening on port ${PORT} [${env.NODE_ENV}]`);
  });
}

startServer().catch((err) => {
  logger.error('Failed to start server:', err);
  process.exit(1);
});
