import pg from 'pg';
import env from './env.js';
import crypto from 'crypto';

const { Pool } = pg;

let pool = null;
let useInMemory = false;

export const memoryDb = {
  users: [],
  accounts: [],
  transactions: [],
  beneficiaries: [],
  cards: [],
  loans: [],
  audit_logs: [],
};

try {
  const poolConfig = {
    connectionString: env.DATABASE_URL,
    connectionTimeoutMillis: 3000,
  };

  if (env.DATABASE_URL && (env.DATABASE_URL.includes('supabase') || env.DATABASE_URL.includes('sslmode=require'))) {
    poolConfig.ssl = {
      rejectUnauthorized: false,
    };
  }

  pool = new Pool(poolConfig);

  pool.on('error', (err) => {
    console.error('Unexpected PostgreSQL Pool Error:', err);
  });
} catch (err) {
  if (env.NODE_ENV === 'production') {
    console.error('CRITICAL: PostgreSQL Pool initialization failed in production environment:', err.message);
    throw err;
  }
  console.warn('PostgreSQL Pool initialization failed, defaulting to in-memory store:', err.message);
  useInMemory = true;
}

export async function initDb() {
  if (useInMemory && env.NODE_ENV === 'production') {
    throw new Error('Database pool is uninitialized. Running in-memory database is prohibited in production.');
  }
  if (useInMemory) return;
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    console.log('Successfully connected to PostgreSQL database.');
  } catch (err) {
    if (env.NODE_ENV === 'production') {
      console.error('CRITICAL: PostgreSQL connection failed in production environment:', err.message);
      throw err;
    }
    console.warn(`PostgreSQL connection failed (${err.message}). Falling back to high-fidelity In-Memory Database Engine.`);
    useInMemory = true;
  }
}

async function executeInMemoryQuery(text, params = []) {
  const normalized = text.trim().replace(/\s+/g, ' ');

  // 1. SELECT 1 or Heartbeat
  if (/^SELECT 1/i.test(normalized)) {
    return { rows: [{ '?column?': 1 }], rowCount: 1 };
  }

  // 2. BEGIN / COMMIT / ROLLBACK
  if (/^BEGIN/i.test(normalized) || /^COMMIT/i.test(normalized) || /^ROLLBACK/i.test(normalized)) {
    return { rows: [], rowCount: 0 };
  }

  // 3. INSERT INTO users
  if (/^INSERT INTO users/i.test(normalized)) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const newUser = {
      id,
      email: params[0],
      password_hash: params[1],
      role: params[2] || 'Customer',
      full_name: params[3],
      id_number: params[4] || null,
      address: params[5] || null,
      kyc_status: params[6] || 'unverified',
      kyc_documents: [],
      failed_attempts: 0,
      locked_until: null,
      created_at: now,
      updated_at: now,
    };
    memoryDb.users.push(newUser);
    return { rows: [newUser], rowCount: 1 };
  }

  // 4. SELECT FROM users
  if (/^SELECT .* FROM users/i.test(normalized)) {
    let rows = [...memoryDb.users];
    if (normalized.includes('WHERE email =')) {
      rows = rows.filter((u) => u.email.toLowerCase() === (params[0] || '').toLowerCase());
    } else if (normalized.includes('WHERE id =')) {
      rows = rows.filter((u) => u.id === params[0]);
    } else if (normalized.includes('WHERE id_number =')) {
      rows = rows.filter((u) => u.id_number === params[0]);
    }
    return { rows, rowCount: rows.length };
  }

  // 5. UPDATE users
  if (/^UPDATE users/i.test(normalized)) {
    const userId = params[params.length - 1];
    const user = memoryDb.users.find((u) => u.id === userId);
    if (!user) return { rows: [], rowCount: 0 };

    if (normalized.includes('kyc_status =')) {
      user.kyc_status = params[0];
      if (params[1]) user.kyc_documents = typeof params[1] === 'string' ? JSON.parse(params[1]) : params[1];
    } else if (normalized.includes('role =')) {
      user.role = params[0];
    }
    user.updated_at = new Date().toISOString();
    return { rows: [user], rowCount: 1 };
  }

  // 6. INSERT INTO accounts
  if (/^INSERT INTO accounts/i.test(normalized)) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const newAcc = {
      id,
      customer_id: params[0],
      account_number: params[1],
      type: params[2] || 'Savings',
      balance: BigInt(params[3] || 0),
      overdraft_limit: BigInt(params[4] || 0),
      status: params[5] || 'active',
      currency: params[6] || 'USD',
      created_at: now,
      updated_at: now,
    };
    memoryDb.accounts.push(newAcc);
    return { rows: [serializeAcc(newAcc)], rowCount: 1 };
  }

  // 7. SELECT FROM accounts
  if (/^SELECT .* FROM accounts/i.test(normalized)) {
    let rows = [...memoryDb.accounts];
    if (normalized.includes('WHERE account_number =')) {
      rows = rows.filter((a) => a.account_number === params[0]);
    } else if (normalized.includes('WHERE customer_id =')) {
      rows = rows.filter((a) => a.customer_id === params[0]);
    } else if (normalized.includes('WHERE id =')) {
      rows = rows.filter((a) => a.id === params[0]);
    } else if (normalized.includes('WHERE id IN')) {
      const ids = params;
      rows = rows.filter((a) => ids.includes(a.id));
    }

    if (normalized.includes('ORDER BY id ASC')) {
      rows.sort((a, b) => a.id.localeCompare(b.id));
    }

    return { rows: rows.map(serializeAcc), rowCount: rows.length };
  }

  // 8. UPDATE accounts
  if (/^UPDATE accounts/i.test(normalized)) {
    if (normalized.includes('status =')) {
      const accId = params[1];
      const acc = memoryDb.accounts.find((a) => a.id === accId);
      if (!acc) return { rows: [], rowCount: 0 };
      acc.status = params[0];
      acc.updated_at = new Date().toISOString();
      return { rows: [serializeAcc(acc)], rowCount: 1 };
    }

    if (normalized.includes('balance = balance -')) {
      const amount = BigInt(params[0]);
      const accId = params[1];
      const acc = memoryDb.accounts.find((a) => a.id === accId);
      if (!acc) return { rows: [], rowCount: 0 };
      const newBal = acc.balance - amount;
      if (newBal < -acc.overdraft_limit) {
        throw new Error('new row for relation "accounts" violates check constraint "chk_balance_overdraft"');
      }
      acc.balance = newBal;
      acc.updated_at = new Date().toISOString();
      return { rows: [serializeAcc(acc)], rowCount: 1 };
    }

    if (normalized.includes('balance = balance +')) {
      const amount = BigInt(params[0]);
      const accId = params[1];
      const acc = memoryDb.accounts.find((a) => a.id === accId);
      if (!acc) return { rows: [], rowCount: 0 };
      acc.balance = acc.balance + amount;
      acc.updated_at = new Date().toISOString();
      return { rows: [serializeAcc(acc)], rowCount: 1 };
    }
  }

  // 9. INSERT INTO transactions
  if (/^INSERT INTO transactions/i.test(normalized)) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    // Extract type from literal in SQL text if present
    const typeMatch = normalized.match(/'(DEPOSIT|WITHDRAWAL|TRANSFER_DEBIT|TRANSFER_CREDIT|LOAN_DISBURSEMENT|LOAN_REPAYMENT|REVERSAL)'/i);
    const txType = typeMatch ? typeMatch[1] : params[1];

    let account_id, amount, balance_after, reference, transfer_id = null, created_by = null;

    if (normalized.includes('transfer_id')) {
      // (account_id, type, amount, balance_after, reference, transfer_id, created_by)
      account_id = params[0];
      amount = BigInt(params[1]);
      balance_after = BigInt(params[2]);
      reference = params[3];
      transfer_id = params[4] || null;
      created_by = params[5] || null;
    } else {
      // (account_id, type, amount, balance_after, reference, created_by)
      account_id = params[0];
      amount = BigInt(params[1]);
      balance_after = BigInt(params[2]);
      reference = params[3];
      created_by = params[4] || null;
    }

    const newTx = {
      id,
      account_id,
      type: txType,
      amount,
      balance_after,
      reference,
      transfer_id,
      related_transaction_id: null,
      created_by,
      created_at: now,
    };
    memoryDb.transactions.push(newTx);
    return { rows: [serializeTx(newTx)], rowCount: 1 };
  }

  // 10. SELECT FROM transactions
  if (/^SELECT .* FROM transactions/i.test(normalized)) {
    let rows = [...memoryDb.transactions];
    if (normalized.includes('WHERE account_id =')) {
      rows = rows.filter((t) => t.account_id === params[0]);
    }
    if (normalized.includes('ORDER BY created_at DESC') || normalized.includes('ORDER BY created_at ASC')) {
      rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }
    if (normalized.includes('LIMIT')) {
      const limitMatch = normalized.match(/LIMIT \$?(\d+)/i);
      if (limitMatch) {
        const lim = parseInt(params[params.length - 1] || limitMatch[1], 10);
        if (!isNaN(lim)) rows = rows.slice(0, lim);
      }
    }
    return { rows: rows.map(serializeTx), rowCount: rows.length };
  }

  // 11. INSERT INTO beneficiaries
  if (/^INSERT INTO beneficiaries/i.test(normalized)) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const newB = {
      id,
      customer_id: params[0],
      nickname: params[1],
      account_number: params[2],
      bank_name: params[3] || 'Internal Bank',
      routing_number: params[4] || null,
      is_external: params[5] ?? false,
      created_at: now,
    };
    memoryDb.beneficiaries.push(newB);
    return { rows: [newB], rowCount: 1 };
  }

  // 12. SELECT FROM beneficiaries
  if (/^SELECT .* FROM beneficiaries/i.test(normalized)) {
    let rows = [...memoryDb.beneficiaries];
    if (normalized.includes('WHERE customer_id =')) {
      rows = rows.filter((b) => b.customer_id === params[0]);
    }
    return { rows, rowCount: rows.length };
  }

  // 13. INSERT INTO cards
  if (/^INSERT INTO cards/i.test(normalized)) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const newCard = {
      id,
      account_id: params[0],
      card_token: params[1],
      masked_pan: params[2],
      card_type: params[3] || 'virtual',
      expiry_month: params[4],
      expiry_year: params[5],
      status: params[6] || 'active',
      daily_limit: BigInt(params[7] || 100000),
      created_at: now,
      updated_at: now,
    };
    memoryDb.cards.push(newCard);
    return { rows: [serializeCard(newCard)], rowCount: 1 };
  }

  // 14. SELECT FROM cards
  if (/^SELECT .* FROM cards/i.test(normalized)) {
    let rows = [...memoryDb.cards];
    if (normalized.includes('WHERE account_id =')) {
      rows = rows.filter((c) => c.account_id === params[0]);
    } else if (normalized.includes('WHERE id =')) {
      rows = rows.filter((c) => c.id === params[0]);
    }
    return { rows: rows.map(serializeCard), rowCount: rows.length };
  }

  // 15. INSERT INTO loans
  if (/^INSERT INTO loans/i.test(normalized)) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const newLoan = {
      id,
      customer_id: params[0],
      account_id: params[1],
      principal_amount: BigInt(params[2]),
      interest_rate: params[3],
      term_months: params[4],
      amount_repaid: BigInt(0),
      status: 'pending',
      approved_by: null,
      repayment_schedule: params[5] || [],
      created_at: now,
      updated_at: now,
    };
    memoryDb.loans.push(newLoan);
    return { rows: [serializeLoan(newLoan)], rowCount: 1 };
  }

  // 16. SELECT FROM loans
  if (/^SELECT .* FROM loans/i.test(normalized)) {
    let rows = [...memoryDb.loans];
    if (normalized.includes('WHERE customer_id =')) {
      rows = rows.filter((l) => l.customer_id === params[0]);
    } else if (normalized.includes('WHERE id =')) {
      rows = rows.filter((l) => l.id === params[0]);
    }
    return { rows: rows.map(serializeLoan), rowCount: rows.length };
  }

  // 17. UPDATE loans
  if (/^UPDATE loans/i.test(normalized)) {
    const loanId = params[params.length - 1];
    const loan = memoryDb.loans.find((l) => l.id === loanId);
    if (!loan) return { rows: [], rowCount: 0 };
    if (normalized.includes('amount_repaid =')) {
      loan.amount_repaid = BigInt(params[0]);
      if (params[1]) loan.status = params[1];
      if (normalized.includes('repayment_schedule =')) {
        loan.repayment_schedule = typeof params[2] === 'string' ? JSON.parse(params[2]) : params[2];
      }
    } else if (normalized.includes('status =')) {
      loan.status = params[0];
      loan.approved_by = params[1] || null;
    }
    loan.updated_at = new Date().toISOString();
    return { rows: [serializeLoan(loan)], rowCount: 1 };
  }

  // 18. INSERT INTO audit_logs
  if (/^INSERT INTO audit_logs/i.test(normalized)) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const newLog = {
      id,
      user_id: params[0],
      action: params[1],
      entity_type: params[2],
      entity_id: params[3],
      ip_address: params[4],
      user_agent: params[5],
      details: params[6] || {},
      created_at: now,
    };
    memoryDb.audit_logs.push(newLog);
    return { rows: [newLog], rowCount: 1 };
  }

  // 19. SELECT FROM audit_logs
  if (/^SELECT .* FROM audit_logs/i.test(normalized)) {
    let rows = [...memoryDb.audit_logs];
    if (normalized.includes('ORDER BY created_at DESC')) {
      rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }
    return { rows, rowCount: rows.length };
  }

  return { rows: [], rowCount: 0 };
}

function serializeAcc(a) {
  return { ...a, balance: a.balance.toString(), overdraft_limit: a.overdraft_limit.toString() };
}

function serializeTx(t) {
  return { ...t, amount: t.amount.toString(), balance_after: t.balance_after.toString() };
}

function serializeCard(c) {
  return { ...c, daily_limit: c.daily_limit ? c.daily_limit.toString() : '100000' };
}

function serializeLoan(l) {
  return { ...l, principal_amount: l.principal_amount.toString(), amount_repaid: l.amount_repaid.toString() };
}

class InMemoryClient {
  async query(text, params) {
    return executeInMemoryQuery(text, params);
  }
  release() {}
}

export const query = async (text, params) => {
  if (useInMemory) {
    return executeInMemoryQuery(text, params);
  }
  try {
    return await pool.query(text, params);
  } catch (err) {
    console.error('PostgreSQL Query execution failed:', err);
    throw err;
  }
};

export const getClient = async () => {
  if (useInMemory) {
    return new InMemoryClient();
  }
  return await pool.connect();
};

export const setUseInMemory = (val) => {
  useInMemory = val;
};

export const isInMemory = () => useInMemory;

export default {
  query,
  getClient,
  initDb,
  memoryDb,
  setUseInMemory,
  isInMemory,
};
