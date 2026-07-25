import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../config/db.js';
import env from '../config/env.js';
import ERROR_CODES from '../constants/errorCodes.js';
import { logAudit } from '../utils/auditLogger.js';

export async function registerUser({ email, password, full_name, id_number, address, role = 'Customer' }, reqMeta = {}) {
  // Check if email already exists
  const existingUserRes = await db.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existingUserRes.rows.length > 0) {
    const err = new Error('A user with this email already exists.');
    err.statusCode = 409;
    err.code = ERROR_CODES.EMAIL_ALREADY_EXISTS;
    throw err;
  }

  if (id_number) {
    const existingIdRes = await db.query('SELECT id FROM users WHERE id_number = $1', [id_number]);
    if (existingIdRes.rows.length > 0) {
      const err = new Error('A user with this ID number already exists.');
      err.statusCode = 409;
      err.code = ERROR_CODES.ID_NUMBER_EXISTS;
      throw err;
    }
  }

  const salt = await bcrypt.genSalt(10);
  const password_hash = await bcrypt.hash(password, salt);

  const insertRes = await db.query(
    `INSERT INTO users (email, password_hash, role, full_name, id_number, address, kyc_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, email, role, full_name, id_number, address, kyc_status, created_at`,
    [email, password_hash, role, full_name, id_number || null, address || null, 'unverified']
  );

  const newUser = { ...insertRes.rows[0] };
  delete newUser.password_hash;

  await logAudit({
    userId: newUser.id,
    action: 'USER_REGISTER',
    entityType: 'user',
    entityId: newUser.id,
    ipAddress: reqMeta.ip,
    userAgent: reqMeta.userAgent,
    details: { email, role },
  });

  return newUser;
}

export async function loginUser({ email, password }, reqMeta = {}) {
  const userRes = await db.query('SELECT * FROM users WHERE email = $1', [email]);
  if (userRes.rows.length === 0) {
    const err = new Error('Invalid email or password.');
    err.statusCode = 401;
    err.code = ERROR_CODES.INVALID_CREDENTIALS;
    throw err;
  }

  const user = userRes.rows[0];

  // Check if account is temporarily locked
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const timeRemaining = Math.ceil((new Date(user.locked_until) - new Date()) / 1000 / 60);
    const err = new Error(`Account is temporarily locked due to repeated failed login attempts. Try again in ${timeRemaining} minutes.`);
    err.statusCode = 403;
    err.code = 'ACCOUNT_LOCKED';
    throw err;
  }

  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    const newFailedAttempts = (user.failed_attempts || 0) + 1;
    let lockedUntil = null;
    if (newFailedAttempts >= 5) {
      lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    }

    if (db.isInMemory()) {
      const memUser = db.memoryDb.users.find((u) => u.id === user.id);
      if (memUser) {
        memUser.failed_attempts = newFailedAttempts;
        memUser.locked_until = lockedUntil;
      }
    } else {
      await db.query(
        'UPDATE users SET failed_attempts = $1, locked_until = $2, updated_at = NOW() WHERE id = $3',
        [newFailedAttempts, lockedUntil, user.id]
      );
    }

    const err = new Error('Invalid email or password.');
    err.statusCode = 401;
    err.code = ERROR_CODES.INVALID_CREDENTIALS;
    throw err;
  }

  // Reset failed attempts upon successful login
  if (user.failed_attempts > 0 || user.locked_until) {
    if (db.isInMemory()) {
      const memUser = db.memoryDb.users.find((u) => u.id === user.id);
      if (memUser) {
        memUser.failed_attempts = 0;
        memUser.locked_until = null;
      }
    } else {
      await db.query(
        'UPDATE users SET failed_attempts = 0, locked_until = NULL, updated_at = NOW() WHERE id = $1',
        [user.id]
      );
    }
  }

  const payload = {
    id: user.id,
    email: user.email,
    role: user.role,
    full_name: user.full_name,
  };

  const token = jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });

  await logAudit({
    userId: user.id,
    action: 'USER_LOGIN',
    entityType: 'user',
    entityId: user.id,
    ipAddress: reqMeta.ip,
    userAgent: reqMeta.userAgent,
  });

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      full_name: user.full_name,
      kyc_status: user.kyc_status,
    },
  };
}

export async function submitKyc(userId, files, reqMeta = {}) {
  const fileDetails = files.map((f) => ({
    filename: f.filename,
    originalName: f.originalname,
    mimetype: f.mimetype,
    path: f.path,
    size: f.size,
  }));

  const res = await db.query(
    `UPDATE users SET kyc_status = 'pending', kyc_documents = $1 WHERE id = $2 RETURNING id, email, kyc_status, kyc_documents`,
    [JSON.stringify(fileDetails), userId]
  );

  if (res.rows.length === 0) {
    const err = new Error('User not found.');
    err.statusCode = 404;
    err.code = ERROR_CODES.USER_NOT_FOUND;
    throw err;
  }

  await logAudit({
    userId,
    action: 'KYC_SUBMITTED',
    entityType: 'user',
    entityId: userId,
    ipAddress: reqMeta.ip,
    userAgent: reqMeta.userAgent,
    details: { fileCount: files.length },
  });

  return res.rows[0];
}

export default { registerUser, loginUser, submitKyc };
