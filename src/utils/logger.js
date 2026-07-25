import env from '../config/env.js';

function formatLog(level, args) {
  const timestamp = new Date().toISOString();
  if (env.NODE_ENV === 'production') {
    let message = '';
    let metadata = {};

    if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null) {
      if (args[0].message) {
        message = args[0].message;
        metadata = { ...args[0] };
        delete metadata.message;
      } else {
        metadata = args[0];
      }
    } else {
      message = args.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : arg)).join(' ');
    }

    return JSON.stringify({
      level,
      timestamp,
      message,
      ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
    });
  } else {
    const joinedArgs = args.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : arg)).join(' ');
    return `[${level}] [${timestamp}] ${joinedArgs}`;
  }
}

export const logger = {
  info: (...args) => console.log(formatLog('INFO', args)),
  warn: (...args) => console.warn(formatLog('WARN', args)),
  error: (...args) => console.error(formatLog('ERROR', args)),
};

export default logger;
