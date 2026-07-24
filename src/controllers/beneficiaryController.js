import * as beneficiaryService from '../services/beneficiaryService.js';
import { beneficiarySchema } from '../validators/schemas.js';

export async function addBeneficiary(req, res, next) {
  try {
    const validatedData = beneficiarySchema.parse(req.body);

    const beneficiary = await beneficiaryService.addBeneficiary(
      {
        customerId: req.user.id,
        nickname: validatedData.nickname,
        accountNumber: validatedData.account_number,
        bankName: validatedData.bank_name,
        routingNumber: validatedData.routing_number,
        isExternal: validatedData.is_external,
      },
      {
        ip: req.ip,
        userAgent: req.get('user-agent'),
      }
    );

    res.status(201).json({
      success: true,
      data: beneficiary,
    });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(422).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid beneficiary parameter(s).',
          details: err.errors,
        },
      });
    }
    next(err);
  }
}

export async function getMyBeneficiaries(req, res, next) {
  try {
    const beneficiaries = await beneficiaryService.getBeneficiaries(req.user.id);
    res.status(200).json({
      success: true,
      data: beneficiaries,
    });
  } catch (err) {
    next(err);
  }
}

export default {
  addBeneficiary,
  getMyBeneficiaries,
};
