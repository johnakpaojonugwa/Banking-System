import { Router } from 'express';
import * as transactionController from '../controllers/transactionController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { requireRoles } from '../middleware/rbacMiddleware.js';
import { financialRateLimiter } from '../middleware/rateLimiter.js';
import { ROLES } from '../constants/roles.js';

const router = Router();

router.use(authenticateToken);

router.post('/', financialRateLimiter, requireRoles(ROLES.CUSTOMER, ROLES.TELLER, ROLES.ADMIN), transactionController.processTransfer);

export default router;
