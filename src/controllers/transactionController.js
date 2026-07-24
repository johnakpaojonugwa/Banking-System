import * as ledgerService from '../services/ledgerService.js';
import * as accountService from '../services/accountService.js';
import { depositSchema, withdrawSchema, transferSchema } from '../validators/schemas.js';

export async function processDeposit(req, res, next) {
  try {
    const validatedData = depositSchema.parse(req.body);

    const account = await accountService.getAccountById(validatedData.account_id);
    if (req.user.role === 'Customer' && account.customer_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'You are not authorized to deposit into another customer\'s account directly.',
        },
      });
    }

    const transaction = await ledgerService.deposit(
      {
        accountId: validatedData.account_id,
        amount: validatedData.amount,
        reference: validatedData.reference || 'Deposit',
        userId: req.user.id,
      },
      {
        ip: req.ip,
        userAgent: req.get('user-agent'),
      }
    );

    res.status(201).json({
      success: true,
      data: transaction,
    });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(422).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid deposit request parameters.',
          details: err.errors,
        },
      });
    }
    next(err);
  }
}

export async function processWithdrawal(req, res, next) {
  try {
    const validatedData = withdrawSchema.parse(req.body);

    const account = await accountService.getAccountById(validatedData.account_id);
    if (req.user.role === 'Customer' && account.customer_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'You are not authorized to withdraw from another customer\'s account.',
        },
      });
    }

    const transaction = await ledgerService.withdraw(
      {
        accountId: validatedData.account_id,
        amount: validatedData.amount,
        reference: validatedData.reference || 'Withdrawal',
        userId: req.user.id,
      },
      {
        ip: req.ip,
        userAgent: req.get('user-agent'),
      }
    );

    res.status(201).json({
      success: true,
      data: transaction,
    });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(422).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid withdrawal request parameters.',
          details: err.errors,
        },
      });
    }
    next(err);
  }
}

export async function processTransfer(req, res, next) {
  try {
    const validatedData = transferSchema.parse(req.body);

    const sourceAccount = await accountService.getAccountById(validatedData.source_account_id);
    if (req.user.role === 'Customer' && sourceAccount.customer_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'You can only initiate transfers from your own account.',
        },
      });
    }

    const result = await ledgerService.transfer(
      {
        sourceAccountId: validatedData.source_account_id,
        destAccountNumber: validatedData.destination_account_number,
        amount: validatedData.amount,
        reference: validatedData.reference || 'Transfer',
        userId: req.user.id,
      },
      {
        ip: req.ip,
        userAgent: req.get('user-agent'),
      }
    );

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(422).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid transfer request parameters.',
          details: err.errors,
        },
      });
    }
    next(err);
  }
}

export async function getTransactions(req, res, next) {
  try {
    const account = await accountService.getAccountById(req.params.id);

    if (req.user.role === 'Customer' && account.customer_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'You are not authorized to view transactions for this account.',
        },
      });
    }

    const limit = parseInt(req.query.limit, 10) || 50;
    const transactions = await ledgerService.getAccountTransactions(req.params.id, limit);

    res.status(200).json({
      success: true,
      data: transactions,
    });
  } catch (err) {
    next(err);
  }
}

export default {
  processDeposit,
  processWithdrawal,
  processTransfer,
  getTransactions,
};
