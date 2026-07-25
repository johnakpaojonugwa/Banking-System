# RESTful Banking Management System API

A high-integrity, secure, and auditable financial backend built with **Node.js**, **Express**, and **PostgreSQL (Supabase)** using **ES Modules (`type: module`)**.

Designed specifically for financial transaction integrity, this API guarantees **atomic balance updates under high concurrency**, **append-only ledger tracking**, **deadlock-free two-sided transfers**, and **integer-based monetary representation**.

---

## Key Financial Integrity & Concurrency Features

1. **Pessimistic Row-Level Locking (`SELECT ... FOR UPDATE`)**:
   - Every balance mutation (Deposit, Withdrawal, Transfer, Loan Disbursement/Repayment) locks the target account row(s) before performing validations or updates.
   - Concurrently executing operations on the same account serialize safely instead of causing race conditions.

2. **Deterministic Anti-Deadlock Locking Strategy**:
   - For multi-account transfers, account IDs are sorted lexicographically before acquiring locks:
     ```sql
     SELECT id, balance, overdraft_limit, status FROM accounts 
     WHERE id IN ($1, $2) 
     ORDER BY id ASC 
     FOR UPDATE;
     ```
   - Even if Account A transfers to Account B at the exact same millisecond that Account B transfers to Account A, both transactions request locks in identical order (`Account A`, then `Account B`), completely eliminating circular wait deadlocks.

3. **Integer Monetary Representation (Zero Floating-Point Drift)**:
   - All balances and monetary amounts are stored as 64-bit integers (`BIGINT`) representing the smallest currency unit (e.g., cents/kobo). `$100.50` is stored as `10050`.

4. **Append-Only Immutable Ledger**:
   - The `transactions` table is append-only. History is never modified or deleted. Corrections are applied through new reversing ledger entries (`REVERSAL`).

5. **Balance Overdraft Enforcement**:
   - Overdraft is modeled as a non-negative limit (`overdraft_limit`). Negative balances are permitted down to `-overdraft_limit` and enforced via both database check constraints (`CHECK (balance >= -overdraft_limit)`) and transactional checks.

6. **Automatic Balance Reconciliation Engine**:
   - An admin endpoint (`POST /api/v1/admin/accounts/:id/reconcile`) recomputes an account's balance from its full transaction history and reports any discrepancy or drift from the stored `balance` column.

---

## Role-Based Access Control (RBAC)

- **Customer**: Access to their own accounts, transactions, transfers, loans, cards, and beneficiaries only.
- **Teller**: Can process deposits/withdrawals/transfers on behalf of customers, open accounts, and view account details.
- **Bank Manager**: Can approve/reject loan applications, freeze/unfreeze accounts, and view system compliance reports.
- **Admin**: Full system permissions, user role management, audit log access, and balance reconciliation.

---

## API Endpoint Matrix

| Method | Path | Description | Required Roles |
| :--- | :--- | :--- | :--- |
| **POST** | `/api/v1/auth/register` | Register new user | Public |
| **POST** | `/api/v1/auth/login` | Login and receive JWT token | Public |
| **POST** | `/api/v1/auth/kyc` | Upload KYC identity documents | Customer |
| **POST** | `/api/v1/accounts` | Open new Savings or Current account | Customer, Teller, Admin |
| **GET** | `/api/v1/accounts/my-accounts` | List accounts belonging to user | Customer, Admin |
| **GET** | `/api/v1/accounts/:id` | Get account details | Customer, Teller, Manager, Admin |
| **PATCH** | `/api/v1/accounts/:id/status` | Freeze/unfreeze/close account | Bank Manager, Admin |
| **GET** | `/api/v1/accounts/:id/statement` | Download PDF or JSON statement | Customer, Teller, Manager, Admin |
| **POST** | `/api/v1/transactions/deposit` | Deposit funds | Customer, Teller, Admin |
| **POST** | `/api/v1/transactions/withdraw` | Withdraw funds | Customer, Teller, Admin |
| **POST** | `/api/v1/transfers` | Atomic two-sided transfer | Customer, Teller, Admin |
| **GET** | `/api/v1/transactions/accounts/:id` | Account transaction history | Customer, Teller, Manager, Admin |
| **POST** | `/api/v1/loans/apply` | Submit loan application | Customer, Admin |
| **PATCH** | `/api/v1/loans/:id/status` | Approve or reject loan | Bank Manager, Admin |
| **POST** | `/api/v1/loans/:id/repay` | Make loan repayment | Customer, Teller, Admin |
| **POST** | `/api/v1/cards` | Issue virtual/physical card record | Customer, Admin |
| **PATCH** | `/api/v1/cards/:id/status` | Block/unblock card | Customer, Manager, Admin |
| **POST** | `/api/v1/beneficiaries` | Save transfer recipient | Customer, Admin |
| **POST** | `/api/v1/admin/accounts/:id/reconcile` | Reconcile account balance | Admin |
| **GET** | `/api/v1/admin/audit-logs` | Query system audit log | Bank Manager, Admin |
| **GET** | `/api/v1/reports/summary` | Cross-account system analytics | Bank Manager, Admin |

---

## Setup & Installation

### 1. Requirements
- **Node.js**: v18+
- **PostgreSQL**: v14+ (or Supabase Postgres connection string)

### 2. Environment Configuration
Copy `.env.example` to `.env`:

```env
PORT=3000
NODE_ENV=development
DATABASE_URL=postgres://postgres:postgres@localhost:5432/banking_db
JWT_SECRET=super_secret_banking_jwt_key_2026_change_in_production
JWT_EXPIRES_IN=1d
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
UPLOAD_DIR=uploads
ALLOWED_ORIGINS=*
DB_POOL_MAX=20
DB_POOL_IDLE_TIMEOUT=30000
DB_POOL_CONN_TIMEOUT=10000
FORCE_DB=false
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Run Migrations & Seed Sample Data
```bash
# Execute schema migration against PostgreSQL
npm run migrate

# Seed database with sample customers, accounts, deposits, withdrawals, and transfers
npm run seed
```

---

## Running the API

### Development Mode (with hot reloading)
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

### Interactive API Documentation (Swagger UI)
Visit [http://localhost:3000/api-docs](http://localhost:3000/api-docs) in your browser while the server is running to view interactive OpenAPI specs.

---

## Running with Docker

You can run the entire API application stack locally along with an isolated PostgreSQL database using Docker Compose.

### 1. Start the Containers
```bash
docker compose up -d
```
This builds the API server image, pulls PostgreSQL, runs a health check, executes database schema migrations automatically, and exposes the API on [http://localhost:3000](http://localhost:3000) with development hot-reloading active.

### 2. View Container Logs
```bash
docker compose logs -f
```

### 3. Stop the Stack
```bash
docker compose down -v
```

---

## Testing with Vitest

By default, tests run against a high-fidelity in-memory database simulation for speed. You can also run the integration and concurrency tests against a real PostgreSQL database.

### 1. Default Mode (In-Memory Mock Engine)
```bash
# Run tests once
npm test

# Run tests in watch mode
npm run test:watch
```

### 2. Real Database Integration Mode (PostgreSQL / Supabase)
To test transaction locking, database constraints, and unique indexes on a real database, set the `FORCE_DB=true` environment variable and run the test suite sequentially (disabling parallelism ensures test workers don't conflict on `TRUNCATE` operations):

**On PowerShell (Windows):**
```powershell
$env:FORCE_DB="true"; npx vitest run --fileParallelism=false --maxWorkers=1
```

**On Bash (macOS/Linux):**
```bash
FORCE_DB=true npx vitest run --fileParallelism=false --maxWorkers=1
```

---

## Sample Seed Accounts & Login Credentials

| Role | Email | Password | Account Number | Initial Balance | Overdraft Limit |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Admin** | `admin@apexbank.com` | `Password123!` | N/A | N/A | N/A |
| **Manager** | `manager@apexbank.com` | `Password123!` | N/A | N/A | N/A |
| **Teller** | `teller@apexbank.com` | `Password123!` | N/A | N/A | N/A |
| **Customer** | `alice@example.com` | `Password123!` | `1038000001` (Savings) | `$3,800.00` | `$0.00` |
| **Customer** | `alice@example.com` | `Password123!` | `1038000002` (Current) | `$300.00` | `$500.00` |
| **Customer** | `bob@example.com` | `Password123!` | `1038000003` (Savings) | `$2,200.00` | `$0.00` |
