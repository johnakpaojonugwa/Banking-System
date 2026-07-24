import * as accountService from '../services/accountService.js';
import * as statementService from '../services/statementService.js';
import { openAccountSchema, accountStatusSchema } from '../validators/schemas.js';

export async function openAccount(req, res, next) {
  try {
    const validatedData = openAccountSchema.parse(req.body);
    
    // If Teller or Admin, they can pass customer_id. Otherwise, defaults to authenticated user's ID
    let targetCustomerId = req.user.id;
    if (['Teller', 'Admin'].includes(req.user.role) && validatedData.customer_id) {
      targetCustomerId = validatedData.customer_id;
    }

    const account = await accountService.openAccount(
      {
        customerId: targetCustomerId,
        type: validatedData.type,
        currency: validatedData.currency,
      },
      {
        ip: req.ip,
        userAgent: req.get('user-agent'),
      }
    );

    res.status(201).json({
      success: true,
      data: account,
    });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(422).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid parameters for account creation.',
          details: err.errors,
        },
      });
    }
    next(err);
  }
}

export async function getMyAccounts(req, res, next) {
  try {
    const accounts = await accountService.getCustomerAccounts(req.user.id);
    res.status(200).json({
      success: true,
      data: accounts,
    });
  } catch (err) {
    next(err);
  }
}

export async function getAccountDetails(req, res, next) {
  try {
    const account = await accountService.getAccountById(req.params.id);

    // Customer can only view their own account details
    if (req.user.role === 'Customer' && account.customer_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'You are not authorized to view another customer\'s account.',
        },
      });
    }

    res.status(200).json({
      success: true,
      data: account,
    });
  } catch (err) {
    next(err);
  }
}

export async function changeAccountStatus(req, res, next) {
  try {
    const { status } = accountStatusSchema.parse(req.body);
    const updatedAccount = await accountService.updateAccountStatus(req.params.id, status, req.user.id, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(200).json({
      success: true,
      data: updatedAccount,
    });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(422).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid status specified.',
          details: err.errors,
        },
      });
    }
    next(err);
  }
}

export async function getStatement(req, res, next) {
  try {
    const account = await accountService.getAccountById(req.params.id);

    if (req.user.role === 'Customer' && account.customer_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'You are not authorized to access statements for this account.',
        },
      });
    }

    const { startDate, endDate, format } = req.query;
    const result = await statementService.getAccountStatement(req.params.id, { startDate, endDate, format }, req.user.id);

    if (result.format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
      return res.send(result.pdfBuffer);
    }

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

export default {
  openAccount,
  getMyAccounts,
  getAccountDetails,
  changeAccountStatus,
  getStatement,
};
