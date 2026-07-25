import { describe, it, expect, beforeEach, vi } from 'vitest';
import db from '../src/config/db.js';
import * as authService from '../src/services/authService.js';
import * as accountService from '../src/services/accountService.js';
import * as ledgerService from '../src/services/ledgerService.js';
import * as generator from '../src/utils/accountNumberGenerator.js';
import { setupTestDb } from './databaseHelper.js';

describe('Financial Integrity & Concurrency Test Suite', () => {
  let user1, user2, acc1, acc2;

  beforeEach(async () => {
    if (process.env.FORCE_DB === 'true') {
      db.setUseInMemory(false);
      await setupTestDb();
    } else {
      db.setUseInMemory(true);
      db.memoryDb.users = [];
      db.memoryDb.accounts = [];
      db.memoryDb.transactions = [];
      db.memoryDb.audit_logs = [];
    }

    user1 = await authService.registerUser({
      email: 'user1@example.com',
      password: 'Password123!',
      full_name: 'User One',
    });

    user2 = await authService.registerUser({
      email: 'user2@example.com',
      password: 'Password123!',
      full_name: 'User Two',
    });

    acc1 = await accountService.openAccount({
      customerId: user1.id,
      type: 'Savings',
      initialBalance: 0,
      overdraftLimit: 0,
    });

    acc2 = await accountService.openAccount({
      customerId: user2.id,
      type: 'Current',
      initialBalance: 0,
      overdraftLimit: 20000, // $200.00 Overdraft limit
    });
  });

  it('should deposit funds and maintain append-only transaction ledger', async () => {
    const tx = await ledgerService.deposit({
      accountId: acc1.id,
      amount: 100000, // $1,000.00
      reference: 'Salary Deposit',
      userId: user1.id,
    });

    expect(tx.type).toBe('DEPOSIT');
    expect(tx.amount).toBe('100000');
    expect(tx.balance_after).toBe('100000');

    const updatedAcc = await accountService.getAccountById(acc1.id);
    expect(updatedAcc.balance).toBe('100000');
  });

  it('should reject withdrawal when amount exceeds balance and overdraft limit', async () => {
    // Deposit $100
    await ledgerService.deposit({
      accountId: acc1.id,
      amount: 10000,
      userId: user1.id,
    });

    // Attempt to withdraw $150 (overdraft limit is 0)
    await expect(
      ledgerService.withdraw({
        accountId: acc1.id,
        amount: 15000,
        userId: user1.id,
      })
    ).rejects.toThrow('Insufficient funds');

    const checkAcc = await accountService.getAccountById(acc1.id);
    expect(checkAcc.balance).toBe('10000'); // Balance remains unchanged
  });

  it('should allow withdrawal into overdraft within overdraft limit', async () => {
    // acc2 has $0 balance and $200 overdraft limit
    const tx = await ledgerService.withdraw({
      accountId: acc2.id,
      amount: 15000, // $150.00
      userId: user2.id,
    });

    expect(tx.balance_after).toBe('-15000');

    const checkAcc = await accountService.getAccountById(acc2.id);
    expect(checkAcc.balance).toBe('-15000');
  });

  it('should execute concurrent transfers safely and conserve total system money', async () => {
    // Seed initial balance: Acc1 has $1,000.00, Acc2 has $1,000.00
    await ledgerService.deposit({ accountId: acc1.id, amount: 100000, userId: user1.id });
    await ledgerService.deposit({ accountId: acc2.id, amount: 100000, userId: user2.id });

    const initialTotalMoney = BigInt(100000) + BigInt(100000);

    // Issue 10 simultaneous transfers in opposing directions
    const transferPromises = [];
    for (let i = 0; i < 5; i++) {
      transferPromises.push(
        ledgerService.transfer({
          sourceAccountId: acc1.id,
          destAccountNumber: acc2.account_number,
          amount: 1000, // $10 each
          userId: user1.id,
        })
      );
      transferPromises.push(
        ledgerService.transfer({
          sourceAccountId: acc2.id,
          destAccountNumber: acc1.account_number,
          amount: 1000, // $10 each
          userId: user2.id,
        })
      );
    }

    await Promise.all(transferPromises);

    const updatedAcc1 = await accountService.getAccountById(acc1.id);
    const updatedAcc2 = await accountService.getAccountById(acc2.id);

    const finalTotalMoney = BigInt(updatedAcc1.balance) + BigInt(updatedAcc2.balance);

    // Strict conservation of money: Total money before === Total money after
    expect(finalTotalMoney).toBe(initialTotalMoney);
    expect(updatedAcc1.balance).toBe('100000');
    expect(updatedAcc2.balance).toBe('100000');
  });

  it('should retry account creation on account number collision', async () => {
    const spy = vi.spyOn(generator, 'generateAccountNumber');
    
    // First create a base account to capture a valid account number
    const baseAcc = await accountService.openAccount({
      customerId: user1.id,
      type: 'Savings',
    });
    
    const blockedNum = baseAcc.account_number;
    
    // Clear the spy history so we only measure calls made during the next account creation
    spy.mockClear();
    
    // Force the generator to return the blocked number on the next attempt (inducing collision)
    spy.mockReturnValueOnce(blockedNum);
    
    const newAcc = await accountService.openAccount({
      customerId: user1.id,
      type: 'Savings',
    });
    
    expect(newAcc.account_number).not.toBe(blockedNum);
    expect(spy).toHaveBeenCalledTimes(2); // Initial blocked return + actual unique backup generation
    spy.mockRestore();
  });
});
