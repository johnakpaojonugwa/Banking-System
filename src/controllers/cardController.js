import * as cardService from '../services/cardService.js';
import * as accountService from '../services/accountService.js';
import { cardSchema } from '../validators/schemas.js';

export async function createCard(req, res, next) {
  try {
    const validatedData = cardSchema.parse(req.body);

    const account = await accountService.getAccountById(validatedData.account_id);
    if (req.user.role === 'Customer' && account.customer_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'You can only issue cards linked to your own account.',
        },
      });
    }

    const card = await cardService.issueCard(
      {
        accountId: validatedData.account_id,
        cardType: validatedData.card_type,
        dailyLimit: validatedData.daily_limit,
      },
      req.user.id,
      {
        ip: req.ip,
        userAgent: req.get('user-agent'),
      }
    );

    res.status(201).json({
      success: true,
      data: card,
    });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(422).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid card request parameters.',
          details: err.errors,
        },
      });
    }
    next(err);
  }
}

export async function toggleCardStatus(req, res, next) {
  try {
    const { status } = req.body;
    if (!['active', 'blocked'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Card status must be either active or blocked.',
        },
      });
    }

    const targetCard = await cardService.getCardById(req.params.id);
    if (req.user.role === 'Customer' && targetCard.customer_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'You are not authorized to block or unblock another customer\'s card.',
        },
      });
    }

    const card = await cardService.updateCardStatus(req.params.id, status, req.user.id, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(200).json({
      success: true,
      data: card,
    });
  } catch (err) {
    next(err);
  }
}

export async function getAccountCards(req, res, next) {
  try {
    const account = await accountService.getAccountById(req.params.accountId);
    if (req.user.role === 'Customer' && account.customer_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'You are not authorized to view cards for this account.',
        },
      });
    }

    const cards = await cardService.getAccountCards(req.params.accountId);
    res.status(200).json({
      success: true,
      data: cards,
    });
  } catch (err) {
    next(err);
  }
}

export default {
  createCard,
  toggleCardStatus,
  getAccountCards,
};
