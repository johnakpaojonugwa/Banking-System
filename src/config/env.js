import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const envSchema = z.object({
  PORT: z.string().default('3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().default('postgres://postgres:postgres@localhost:5432/banking_db'),
  JWT_SECRET: z.string().default('super_secret_banking_jwt_key_2026_change_in_production'),
  JWT_EXPIRES_IN: z.string().default('1d'),
  RATE_LIMIT_WINDOW_MS: z.string().default('900000'),
  RATE_LIMIT_MAX: z.string().default('100'),
  UPLOAD_DIR: z.string().default('uploads'),
  ALLOWED_ORIGINS: z.string().default('*'),
  DB_POOL_MAX: z.string().default('20'),
  DB_POOL_IDLE_TIMEOUT: z.string().default('30000'),
  DB_POOL_CONN_TIMEOUT: z.string().default('10000'),
  FORCE_DB: z.string().default('false'),
}).refine((data) => {
  if (data.NODE_ENV === 'production') {
    return data.JWT_SECRET !== 'super_secret_banking_jwt_key_2026_change_in_production' && data.JWT_SECRET.length >= 32;
  }
  return true;
}, {
  message: 'JWT_SECRET must be at least 32 characters long and cannot be the default placeholder string in production.',
  path: ['JWT_SECRET'],
});

const parseEnv = () => {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid environment variables:', result.error.format());
    process.exit(1);
  }
  return result.data;
};

export default parseEnv();
