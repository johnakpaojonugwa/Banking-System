import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import fs from 'fs';
import path from 'path';
import swaggerUi from 'swagger-ui-express';
import env from './config/env.js';

import authRoutes from './routes/authRoutes.js';
import accountRoutes from './routes/accountRoutes.js';
import transactionRoutes from './routes/transactionRoutes.js';
import transferRoutes from './routes/transferRoutes.js';
import loanRoutes from './routes/loanRoutes.js';
import cardRoutes from './routes/cardRoutes.js';
import beneficiaryRoutes from './routes/beneficiaryRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import errorHandler from './middleware/errorHandler.js';
import responseEnvelope from './middleware/envelope.js';

const app = express();

// Load OpenAPI / Swagger Document
const swaggerSpecPath = path.resolve(process.cwd(), 'swagger.json');
let swaggerDocument = {};
if (fs.existsSync(swaggerSpecPath)) {
  swaggerDocument = JSON.parse(fs.readFileSync(swaggerSpecPath, 'utf8'));
}

// Security & Parsing Middlewares
app.use(helmet({ contentSecurityPolicy: false }));

const allowedOrigins = env.ALLOWED_ORIGINS === '*' ? '*' : env.ALLOWED_ORIGINS.split(',').map((o) => o.trim());
app.use(
  cors({
    origin: allowedOrigins,
    credentials: allowedOrigins !== '*',
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Standardize all JSON response envelopes
app.use(responseEnvelope);


// Interactive API Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'UP',
    timestamp: new Date().toISOString(),
    service: 'Banking Management System API',
    docs: '/api-docs',
  });
});

// API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/accounts', accountRoutes);
app.use('/api/v1/transactions', transactionRoutes);
app.use('/api/v1/transfers', transferRoutes);
app.use('/api/v1/loans', loanRoutes);
app.use('/api/v1/cards', cardRoutes);
app.use('/api/v1/beneficiaries', beneficiaryRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/reports', reportRoutes);

// Global Centralized Error Handler
app.use(errorHandler);

export default app;
