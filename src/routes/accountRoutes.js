import { Router } from 'express';
import * as accountController from '../controllers/accountController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { requireRoles } from '../middleware/rbacMiddleware.js';
import { ROLES } from '../constants/roles.js';

const router = Router();

router.use(authenticateToken);

router.post('/', requireRoles(ROLES.CUSTOMER, ROLES.TELLER, ROLES.ADMIN), accountController.openAccount);
router.get('/my-accounts', requireRoles(ROLES.CUSTOMER, ROLES.ADMIN), accountController.getMyAccounts);
router.get('/:id', requireRoles(ROLES.CUSTOMER, ROLES.TELLER, ROLES.BANK_MANAGER, ROLES.ADMIN), accountController.getAccountDetails);
router.patch('/:id/status', requireRoles(ROLES.BANK_MANAGER, ROLES.ADMIN), accountController.changeAccountStatus);
router.get('/:id/statement', requireRoles(ROLES.CUSTOMER, ROLES.TELLER, ROLES.BANK_MANAGER, ROLES.ADMIN), accountController.getStatement);

export default router;
