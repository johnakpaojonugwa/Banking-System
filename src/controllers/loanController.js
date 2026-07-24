import * as loanService from '../services/loanService.js';
import { loanApplySchema, loanApproveSchema, loanRepaySchema } from '../validators/schemas.js';

export async function applyForLoan(req, res, next) {
  try {
    const validatedData = loanApplySchema.parse(req.body);
    const loan = await loanService.applyLoan(
      {
        customerId: req.user.id,
        accountId: validatedData.account_id,
        principalAmount: validatedData.principal_amount,
        termMonths: validatedData.term_months,
      },
      {
        ip: req.ip,
        userAgent: req.get('user-agent'),
      }
    );

    res.status(201).json({
      success: true,
      data: loan,
    });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(422).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid loan application parameters.',
          details: err.errors,
        },
      });
    }
    next(err);
  }
}

export async function approveLoan(req, res, next) {
  try {
    const { status } = loanApproveSchema.parse(req.body);
    const loan = await loanService.approveOrRejectLoan(req.params.id, { status }, req.user.id, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(200).json({
      success: true,
      data: loan,
    });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(422).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid loan approval status.',
          details: err.errors,
        },
      });
    }
    next(err);
  }
}

export async function repayLoan(req, res, next) {
  try {
    const { amount } = loanRepaySchema.parse(req.body);

    const targetLoan = await loanService.getLoanById(req.params.id);
    if (req.user.role === 'Customer' && targetLoan.customer_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'You are not authorized to make repayments on another customer\'s loan.',
        },
      });
    }

    const updatedLoan = await loanService.repayLoan(req.params.id, { amount }, req.user.id, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(200).json({
      success: true,
      data: updatedLoan,
    });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(422).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid loan repayment parameters.',
          details: err.errors,
        },
      });
    }
    next(err);
  }
}

export async function getMyLoans(req, res, next) {
  try {
    const loans = await loanService.getCustomerLoans(req.user.id);
    res.status(200).json({
      success: true,
      data: loans,
    });
  } catch (err) {
    next(err);
  }
}

export default {
  applyForLoan,
  approveLoan,
  repayLoan,
  getMyLoans,
};
