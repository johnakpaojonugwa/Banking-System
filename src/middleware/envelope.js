export function responseEnvelope(req, res, next) {
  const originalJson = res.json;

  res.json = function (body) {
    if (body && typeof body === 'object') {
      const isAlreadyEnvelope = ('success' in body) && ('data' in body || 'error' in body);
      
      if (isAlreadyEnvelope) {
        const success = body.success !== undefined ? body.success : !body.error;
        const normalized = {
          success,
          data: body.data !== undefined ? body.data : null,
          meta: body.meta !== undefined ? body.meta : null,
          error: body.error !== undefined ? body.error : null,
        };
        return originalJson.call(this, normalized);
      } else {
        const isSwaggerSpec = 'openapi' in body || 'swagger' in body;
        if (!isSwaggerSpec) {
          const normalized = {
            success: true,
            data: body,
            meta: null,
            error: null,
          };
          return originalJson.call(this, normalized);
        }
      }
    }
    return originalJson.call(this, body);
  };

  next();
}

export default responseEnvelope;
