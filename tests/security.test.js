import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import db from '../src/config/db.js';
import * as authService from '../src/services/authService.js';
import * as accountService from '../src/services/accountService.js';
import * as loanService from '../src/services/loanService.js';
import * as cardService from '../src/services/cardService.js';

describe('Security & IDOR Hardening Test Suite', () => {
  let customerA, customerB, tokenA, tokenB, accountA, accountB, loanB, cardB;

  beforeEach(async () => {
    db.setUseInMemory(true);
    db.memoryDb.users = [];
    db.memoryDb.accounts = [];
    db.memoryDb.transactions = [];
    db.memoryDb.loans = [];
    db.memoryDb.cards = [];
    db.memoryDb.audit_logs = [];

    customerA = await authService.registerUser({
      email: 'customerA@sec.com',
      password: 'Password123!',
      full_name: 'Customer A',
    });
    const loginA = await authService.loginUser({ email: 'customerA@sec.com', password: 'Password123!' });
    tokenA = loginA.token;

    customerB = await authService.registerUser({
      email: 'customerB@sec.com',
      password: 'Password123!',
      full_name: 'Customer B',
    });
    const loginB = await authService.loginUser({ email: 'customerB@sec.com', password: 'Password123!' });
    tokenB = loginB.token;

    accountA = await accountService.openAccount({ customerId: customerA.id });
    accountB = await accountService.openAccount({ customerId: customerB.id });

    // Customer B applies for loan and has a card
    loanB = await loanService.applyLoan({ customerId: customerB.id, accountId: accountB.id, principalAmount: 50000, termMonths: 12 });
    // Manually disburse loan for B to test repayment
    db.memoryDb.loans.find((l) => l.id === loanB.id).status = 'disbursed';

    cardB = await cardService.issueCard({ accountId: accountB.id }, customerB.id);
  });

  it('should prevent Customer A from repaying Customer B loan (IDOR Protection)', async () => {
    const res = await request(app)
      .post(`/api/v1/loans/${loanB.id}/repay`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ amount: 1000 });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('should prevent Customer A from toggling Customer B card status (IDOR Protection)', async () => {
    const res = await request(app)
      .patch(`/api/v1/cards/${cardB.id}/status`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ status: 'blocked' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('should reject transaction amounts exceeding maximum safe limit', async () => {
    const res = await request(app)
      .post('/api/v1/transactions/deposit')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        account_id: accountA.id,
        amount: 999999999999999, // Exceeds 1 billion limit
      });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should ignore role parameter on public registration and default to Customer', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'maliciousadmin@sec.com',
        password: 'Password123!',
        full_name: 'Fake Admin',
        role: 'Admin', // Attempt privilege escalation
      });

    expect(res.status).toBe(201);
    expect(res.body.data.role).toBe('Customer');

    // Double check database record
    const userInDb = db.memoryDb.users.find((u) => u.email === 'maliciousadmin@sec.com');
    expect(userInDb.role).toBe('Customer');
  });

  it('should allow adding internal beneficiary with a valid account number', async () => {
    const res = await request(app)
      .post('/api/v1/beneficiaries')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        nickname: 'My Account B',
        account_number: accountB.account_number,
        is_external: false,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('should reject adding internal beneficiary with a non-existent account number', async () => {
    const res = await request(app)
      .post('/api/v1/beneficiaries')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        nickname: 'Typo Account',
        account_number: '1099999999', // Random non-existent number
        is_external: false,
      });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ACCOUNT_NOT_FOUND');
  });

  it('should allocate loan repayments to installments and check payoff against total liability (interest + principal)', async () => {
    // Principal is 50000. Under 7.5% annual interest for 12 months:
    // monthlyRate = 0.075 / 12 = 0.00625
    // monthlyRepayment = Math.round((50000 * 0.00625) / (1 - Math.pow(1.00625, -12))) = 4338
    // Total Liability = 4338 * 12 = 52056
    // Let's verify the first repayment allocates to schedule and doesn't mark loan as paid off if amount matches principal but not interest
    
    // Deposit 60000 to accountB first to support repayment
    await request(app)
      .post('/api/v1/transactions/deposit')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ account_id: accountB.id, amount: 60000 });

    // Customer B makes a repayment of 50000 (which equals principal, but less than 52056 total liability)
    const repay1 = await request(app)
      .post(`/api/v1/loans/${loanB.id}/repay`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ amount: 50000 });

    expect(repay1.status).toBe(200);
    expect(repay1.body.data.status).toBe('disbursed'); // Still disbursed, not paid_off because interest is unpaid!
    
    // Check that schedule installments were updated
    const loanRecord = db.memoryDb.loans.find((l) => l.id === loanB.id);
    const schedule = loanRecord.repayment_schedule;
    
    // Installment amount is 4338. 50000 / 4338 = 11 installments fully paid, 1 partially paid.
    const paidInstallments = schedule.filter((inst) => inst.status === 'paid');
    const partiallyPaidInstallments = schedule.filter((inst) => inst.status === 'partially_paid');
    
    expect(paidInstallments.length).toBe(11);
    expect(partiallyPaidInstallments.length).toBe(1);
    expect(partiallyPaidInstallments[0].amount_paid).toBe(50000 - (11 * 4338)); // 2282 cents

    // Repay the rest (2056 cents)
    const repay2 = await request(app)
      .post(`/api/v1/loans/${loanB.id}/repay`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ amount: 2056 });

    expect(repay2.status).toBe(200);
    expect(repay2.body.data.status).toBe('paid_off'); // Now fully paid off!
  });
});
