import { Router } from 'express';
import * as transactionController from '../controllers/transactionController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { requireRoles } from '../middleware/rbacMiddleware.js';
import { financialRateLimiter } from '../middleware/rateLimiter.js';
import { ROLES } from '../constants/roles.js';

const router = Router();

router.use(authenticateToken);

router.post('/deposit', financialRateLimiter, requireRoles(ROLES.CUSTOMER, ROLES.TELLER, ROLES.ADMIN), transactionController.processDeposit);
router.post('/withdraw', financialRateLimiter, requireRoles(ROLES.CUSTOMER, ROLES.TELLER, ROLES.ADMIN), transactionController.processWithdrawal);
router.get('/accounts/:id', requireRoles(ROLES.CUSTOMER, ROLES.TELLER, ROLES.BANK_MANAGER, ROLES.ADMIN), transactionController.getTransactions);

export default router;
