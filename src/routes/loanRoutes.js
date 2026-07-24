import { Router } from 'express';
import * as loanController from '../controllers/loanController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { requireRoles } from '../middleware/rbacMiddleware.js';
import { ROLES } from '../constants/roles.js';

const router = Router();

router.use(authenticateToken);

router.post('/apply', requireRoles(ROLES.CUSTOMER, ROLES.ADMIN), loanController.applyForLoan);
router.patch('/:id/status', requireRoles(ROLES.BANK_MANAGER, ROLES.ADMIN), loanController.approveLoan);
router.post('/:id/repay', requireRoles(ROLES.CUSTOMER, ROLES.TELLER, ROLES.ADMIN), loanController.repayLoan);
router.get('/my-loans', requireRoles(ROLES.CUSTOMER, ROLES.ADMIN), loanController.getMyLoans);

export default router;
