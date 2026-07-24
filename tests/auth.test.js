import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import db from '../src/config/db.js';

describe('Authentication & Authorization API', () => {
  beforeEach(() => {
    db.setUseInMemory(true);
    db.memoryDb.users = [];
    db.memoryDb.audit_logs = [];
  });

  it('should register a new user successfully with hashed password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'testuser@example.com',
        password: 'Password123!',
        full_name: 'Test User',
        id_number: 'ID-999',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data.email).toBe('testuser@example.com');
    expect(res.body.data).not.toHaveProperty('password_hash');
  });

  it('should reject registration with duplicate email', async () => {
    await request(app).post('/api/v1/auth/register').send({
      email: 'duplicate@example.com',
      password: 'Password123!',
      full_name: 'User One',
    });

    const res = await request(app).post('/api/v1/auth/register').send({
      email: 'duplicate@example.com',
      password: 'Password123!',
      full_name: 'User Two',
    });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_ALREADY_EXISTS');
  });

  it('should log in successfully and return JWT token', async () => {
    await request(app).post('/api/v1/auth/register').send({
      email: 'loginuser@example.com',
      password: 'SecretPassword123',
      full_name: 'Login Test',
    });

    const res = await request(app).post('/api/v1/auth/login').send({
      email: 'loginuser@example.com',
      password: 'SecretPassword123',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('token');
    expect(res.body.data.user.email).toBe('loginuser@example.com');
  });

  it('should reject login with wrong password', async () => {
    await request(app).post('/api/v1/auth/register').send({
      email: 'wrongpass@example.com',
      password: 'CorrectPassword123',
      full_name: 'Wrong Pass',
    });

    const res = await request(app).post('/api/v1/auth/login').send({
      email: 'wrongpass@example.com',
      password: 'WrongPassword123',
    });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });
});
