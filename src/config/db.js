import pg from 'pg';
import env from './env.js';
import { executeInMemoryQuery, InMemoryClient, memoryDb } from './inMemoryDb.js';

const { Pool } = pg;

let pool = null;
let useInMemory = false;

try {
  const poolConfig = {
    connectionString: env.DATABASE_URL,
    max: parseInt(env.DB_POOL_MAX, 10) || 20,
    idleTimeoutMillis: parseInt(env.DB_POOL_IDLE_TIMEOUT, 10) || 30000,
    connectionTimeoutMillis: parseInt(env.DB_POOL_CONN_TIMEOUT, 10) || 2000,
  };

  if (env.DATABASE_URL && (env.DATABASE_URL.includes('supabase') || env.DATABASE_URL.includes('sslmode=require'))) {
    poolConfig.ssl = {
      rejectUnauthorized: false,
    };
  }

  pool = new Pool(poolConfig);

  pool.on('error', (err) => {
    console.error('Unexpected PostgreSQL Pool Error:', err);
  });
} catch (err) {
  if (env.NODE_ENV === 'production' || env.FORCE_DB === 'true') {
    console.error('CRITICAL: PostgreSQL Pool initialization failed:', err.message);
    throw err;
  }
  console.warn('PostgreSQL Pool initialization failed, defaulting to in-memory store:', err.message);
  useInMemory = true;
}

export async function initDb() {
  if (useInMemory && (env.NODE_ENV === 'production' || env.FORCE_DB === 'true')) {
    throw new Error('Database pool is uninitialized. Running in-memory database is prohibited.');
  }
  if (useInMemory) return;
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    console.log('Successfully connected to PostgreSQL database.');
  } catch (err) {
    if (env.NODE_ENV === 'production' || env.FORCE_DB === 'true') {
      console.error('CRITICAL: PostgreSQL connection failed:', err.message);
      throw err;
    }
    console.warn(`PostgreSQL connection failed (${err.message}). Falling back to high-fidelity In-Memory Database Engine.`);
    useInMemory = true;
  }
}

export const query = async (text, params) => {
  if (useInMemory) {
    return executeInMemoryQuery(text, params);
  }
  try {
    return await pool.query(text, params);
  } catch (err) {
    console.error('PostgreSQL Query execution failed:', err);
    throw err;
  }
};

export const getClient = async () => {
  if (useInMemory) {
    return new InMemoryClient();
  }
  return await pool.connect();
};

export const setUseInMemory = (val) => {
  useInMemory = val;
};

export const isInMemory = () => useInMemory;

export default {
  query,
  getClient,
  initDb,
  memoryDb,
  setUseInMemory,
  isInMemory,
};
