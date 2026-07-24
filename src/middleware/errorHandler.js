import ERROR_CODES from '../constants/errorCodes.js';

export function errorHandler(err, req, res, next) {
  console.error('[GLOBAL ERROR HANDLER]:', err);

  const statusCode = err.statusCode || 500;
  const errorCode = err.code || ERROR_CODES.INTERNAL_ERROR;
  const message = err.message || 'An unexpected internal server error occurred.';

  res.status(statusCode).json({
    success: false,
    error: {
      code: errorCode,
      message,
      details: err.details || null,
    },
  });
}

export default errorHandler;
