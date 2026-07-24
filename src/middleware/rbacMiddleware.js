import ERROR_CODES from '../constants/errorCodes.js';

/**
 * Role-Based Access Control middleware.
 * @param  {...string} allowedRoles Roles permitted to access the endpoint
 */
export function requireRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          code: ERROR_CODES.UNAUTHORIZED,
          message: 'User authentication required.',
        },
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: {
          code: ERROR_CODES.FORBIDDEN,
          message: `Access denied. Requires one of the following roles: ${allowedRoles.join(', ')}`,
        },
      });
    }

    next();
  };
}

export default { requireRoles };
