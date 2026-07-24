import { Router } from 'express';
import * as cardController from '../controllers/cardController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { requireRoles } from '../middleware/rbacMiddleware.js';
import { ROLES } from '../constants/roles.js';

const router = Router();

router.use(authenticateToken);

router.post('/', requireRoles(ROLES.CUSTOMER, ROLES.ADMIN), cardController.createCard);
router.patch('/:id/status', requireRoles(ROLES.CUSTOMER, ROLES.BANK_MANAGER, ROLES.ADMIN), cardController.toggleCardStatus);
router.get('/account/:accountId', requireRoles(ROLES.CUSTOMER, ROLES.TELLER, ROLES.BANK_MANAGER, ROLES.ADMIN), cardController.getAccountCards);

export default router;
