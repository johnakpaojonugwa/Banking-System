import bcrypt from 'bcryptjs';
import db, { initDb } from './config/db.js';
import * as authService from './services/authService.js';
import * as accountService from './services/accountService.js';
import * as ledgerService from './services/ledgerService.js';
import logger from './utils/logger.js';

export async function seedDatabase() {
  await initDb();
  logger.info('Starting database seeder...');

  // 1. Create Users
  const password = 'Password123!';

  const admin = await authService.registerUser({
    email: 'admin@apexbank.com',
    password,
    full_name: 'System Admin',
    role: 'Admin',
  }).catch(() => null);

  const manager = await authService.registerUser({
    email: 'manager@apexbank.com',
    password,
    full_name: 'Sarah Manager',
    role: 'Bank_Manager',
  }).catch(() => null);

  const teller = await authService.registerUser({
    email: 'teller@apexbank.com',
    password,
    full_name: 'Tom Teller',
    role: 'Teller',
  }).catch(() => null);

  const alice = await authService.registerUser({
    email: 'alice@example.com',
    password,
    full_name: 'Alice Smith',
    id_number: 'ID-ALICE-1001',
    address: '123 Financial Way, New York, NY',
    role: 'Customer',
  }).catch(() => null);

  const bob = await authService.registerUser({
    email: 'bob@example.com',
    password,
    full_name: 'Bob Jones',
    id_number: 'ID-BOB-2002',
    address: '456 Wall Street, New York, NY',
    role: 'Customer',
  }).catch(() => null);

  const aliceUser = alice || (await db.query(`SELECT * FROM users WHERE email = 'alice@example.com'`)).rows[0];
  const bobUser = bob || (await db.query(`SELECT * FROM users WHERE email = 'bob@example.com'`)).rows[0];

  // 2. Open Accounts
  const aliceSavings = await accountService.openAccount({
    customerId: aliceUser.id,
    type: 'Savings',
    initialBalance: 0,
    overdraftLimit: 0,
  });

  const aliceCurrent = await accountService.openAccount({
    customerId: aliceUser.id,
    type: 'Current',
    initialBalance: 0,
    overdraftLimit: 50000, // $500.00 Overdraft Limit
  });

  const bobSavings = await accountService.openAccount({
    customerId: bobUser.id,
    type: 'Savings',
    initialBalance: 0,
    overdraftLimit: 0,
  });

  logger.info(`Opened accounts: Alice Savings (${aliceSavings.account_number}), Alice Current (${aliceCurrent.account_number}), Bob Savings (${bobSavings.account_number})`);

  // 3. Perform Transactions & Populate Ledger
  // Deposit $5,000 into Alice Savings
  await ledgerService.deposit({
    accountId: aliceSavings.id,
    amount: 500000, // $5,000.00
    reference: 'Initial Deposit - Salary',
    userId: aliceUser.id,
  });

  // Deposit $1,500 into Bob Savings
  await ledgerService.deposit({
    accountId: bobSavings.id,
    amount: 150000, // $1,500.00
    reference: 'Initial Deposit - Cash',
    userId: bobUser.id,
  });

  // Withdrawal $200 from Alice Savings
  await ledgerService.withdraw({
    accountId: aliceSavings.id,
    amount: 20000, // $200.00
    reference: 'ATM Cash Withdrawal',
    userId: aliceUser.id,
  });

  // Atomic Transfer $1,000 from Alice Savings to Bob Savings
  await ledgerService.transfer({
    sourceAccountId: aliceSavings.id,
    destAccountNumber: bobSavings.account_number,
    amount: 100000, // $1,000.00
    reference: 'Rent Payment',
    userId: aliceUser.id,
  });

  // Transfer $300 back from Bob Savings to Alice Current
  await ledgerService.transfer({
    sourceAccountId: bobSavings.id,
    destAccountNumber: aliceCurrent.account_number,
    amount: 30000, // $300.00
    reference: 'Reimbursement',
    userId: bobUser.id,
  });

  logger.info('Database seeded successfully with sample users, accounts, deposits, withdrawals, and transfers.');
}

if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error('Seeding failed:', err);
      process.exit(1);
    });
}

export default seedDatabase;
