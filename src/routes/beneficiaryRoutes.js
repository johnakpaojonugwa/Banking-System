import { Router } from 'express';
import * as beneficiaryController from '../controllers/beneficiaryController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { requireRoles } from '../middleware/rbacMiddleware.js';
import { ROLES } from '../constants/roles.js';

const router = Router();

router.use(authenticateToken);

router.post('/', requireRoles(ROLES.CUSTOMER, ROLES.ADMIN), beneficiaryController.addBeneficiary);
router.get('/', requireRoles(ROLES.CUSTOMER, ROLES.ADMIN), beneficiaryController.getMyBeneficiaries);

export default router;
