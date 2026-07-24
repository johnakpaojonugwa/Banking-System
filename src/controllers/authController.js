import * as authService from '../services/authService.js';
import { registerSchema, loginSchema } from '../validators/schemas.js';

export async function register(req, res, next) {
  try {
    const validatedData = registerSchema.parse(req.body);
    const user = await authService.registerUser(validatedData, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    res.status(201).json({
      success: true,
      data: user,
    });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(422).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body parameter(s).',
          details: err.errors,
        },
      });
    }
    next(err);
  }
}

export async function login(req, res, next) {
  try {
    const validatedData = loginSchema.parse(req.body);
    const result = await authService.loginUser(validatedData, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(422).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid email or password parameter format.',
          details: err.errors,
        },
      });
    }
    next(err);
  }
}

export async function uploadKycDocuments(req, res, next) {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'At least one KYC document file must be uploaded.',
        },
      });
    }

    const result = await authService.submitKyc(req.user.id, req.files, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

export default { register, login, uploadKycDocuments };
