import crypto from 'crypto';

/**
 * Generates a unique 10-digit account number.
 * Format: 10 + 8 random numeric digits.
 */
export function generateAccountNumber() {
  const prefix = '10';
  let randomDigits = '';
  for (let i = 0; i < 8; i++) {
    randomDigits += crypto.randomInt(0, 10).toString();
  }
  return prefix + randomDigits;
}

export default { generateAccountNumber };
