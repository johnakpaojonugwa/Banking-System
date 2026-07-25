import ERROR_CODES from '../constants/errorCodes.js';
import env from '../config/env.js';

export function errorHandler(err, req, res, next) {
  console.error('[GLOBAL ERROR HANDLER]:', err);

  const statusCode = err.statusCode || 500;
  const errorCode = err.code || ERROR_CODES.INTERNAL_ERROR;

  let message = err.message || 'An unexpected internal server error occurred.';
  let details = err.details || null;

  if (env.NODE_ENV === 'production' && statusCode === 500) {
    message = 'An unexpected internal server error occurred.';
    details = null;
  }

  res.status(statusCode).json({
    success: false,
    error: {
      code: errorCode,
      message,
      details,
    },
  });
}

export default errorHandler;
