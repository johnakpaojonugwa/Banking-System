import { describe, it, expect, beforeEach } from 'vitest';
import db from '../src/config/db.js';
import * as authService from '../src/services/authService.js';
import * as accountService from '../src/services/accountService.js';
import * as ledgerService from '../src/services/ledgerService.js';
import * as reconciliationService from '../src/services/reconciliationService.js';
import { setupTestDb } from './databaseHelper.js';

describe('Reconciliation Engine Test Suite', () => {
  let user, admin, account;

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

    admin = await authService.registerUser({
      email: 'admin@reconcile.com',
      password: 'Password123!',
      full_name: 'Admin Reconciler',
      role: 'Admin',
    });

    user = await authService.registerUser({
      email: 'customer@reconcile.com',
      password: 'Password123!',
      full_name: 'Regular Customer',
    });

    account = await accountService.openAccount({
      customerId: user.id,
      type: 'Savings',
      initialBalance: 0,
    });
  });

  it('should reconcile cleanly when stored balance matches full transaction history', async () => {
    // Deposit $500
    await ledgerService.deposit({ accountId: account.id, amount: 50000, userId: user.id });
    // Withdraw $150
    await ledgerService.withdraw({ accountId: account.id, amount: 15000, userId: user.id });
    // Deposit $200
    await ledgerService.deposit({ accountId: account.id, amount: 20000, userId: user.id });

    const auditRes = await reconciliationService.reconcileAccount(account.id, admin.id);

    expect(auditRes.isReconciled).toBe(true);
    expect(auditRes.storedBalance).toBe('55000'); // 500 - 150 + 200 = 550.00 (55000)
    expect(auditRes.calculatedBalance).toBe('55000');
    expect(auditRes.drift).toBe('0');
  });

  it('should detect balance drift if stored balance is modified out-of-band', async () => {
    await ledgerService.deposit({ accountId: account.id, amount: 50000, userId: user.id });

    // Manually tamper with account balance to simulate out-of-band corruption
    if (db.isInMemory()) {
      const accRecord = db.memoryDb.accounts.find((a) => a.id === account.id);
      accRecord.balance = BigInt(60000); // Intentionally set to $600 instead of $500
    } else {
      await db.query(`UPDATE accounts SET balance = 60000 WHERE id = $1`, [account.id]);
    }

    const auditRes = await reconciliationService.reconcileAccount(account.id, admin.id);

    expect(auditRes.isReconciled).toBe(false);
    expect(auditRes.storedBalance).toBe('60000');
    expect(auditRes.calculatedBalance).toBe('50000');
    expect(auditRes.drift).toBe('-10000'); // Drift of -$100.00
  });
});
