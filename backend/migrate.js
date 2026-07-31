require('dotenv').config();
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) { console.log('No DATABASE_URL, skipping migration'); process.exit(0); }

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const steps = [
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS department  VARCHAR(50)  DEFAULT 'sales'`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB        DEFAULT '[]'::jsonb`,
  `ALTER TABLE milk_records ADD COLUMN IF NOT EXISTS collection_time    TIME`,
  `ALTER TABLE milk_records ADD COLUMN IF NOT EXISTS lactometer_reading NUMERIC(6,2)`,
  `ALTER TABLE milk_records ADD COLUMN IF NOT EXISTS snf_computed       NUMERIC(6,4)`,
  `ALTER TABLE milk_records ADD COLUMN IF NOT EXISTS sp_gravity         NUMERIC(8,6)`,
  `ALTER TABLE milk_records ADD COLUMN IF NOT EXISTS standardised_ts    NUMERIC(8,4)`,
  `ALTER TABLE milk_records ADD COLUMN IF NOT EXISTS ts_value           NUMERIC(8,4)`,
  // Sync department from employees to users for existing staff
  `UPDATE users u SET department = e.department FROM employees e WHERE e.user_id = u.id AND u.role = 'staff' AND (u.department IS NULL OR u.department = '')`,
  // Ensure advance_salary table exists (PostgreSQL)
  `CREATE TABLE IF NOT EXISTS advance_salary (
    id           BIGSERIAL PRIMARY KEY,
    employee_id  BIGINT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    amount       NUMERIC(10,2) NOT NULL,
    advance_date DATE NOT NULL,
    recovered    NUMERIC(10,2) NOT NULL DEFAULT 0,
    status       VARCHAR(20) NOT NULL DEFAULT 'pending',
    notes        TEXT,
    created_by   BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  // Ensure salary_adjustments table exists
  `CREATE TABLE IF NOT EXISTS salary_adjustments (
    id           BIGSERIAL PRIMARY KEY,
    employee_id  BIGINT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    type         VARCHAR(20) NOT NULL DEFAULT 'bonus',
    amount       NUMERIC(10,2) NOT NULL,
    reason       TEXT,
    apply_month  VARCHAR(7) NOT NULL,
    created_by   BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  // ── Core business tables ─────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS customers (
    id            BIGSERIAL PRIMARY KEY,
    customer_code VARCHAR(20) UNIQUE NOT NULL,
    name          VARCHAR(150) NOT NULL,
    phone         VARCHAR(20),
    address       TEXT,
    customer_type VARCHAR(20) NOT NULL DEFAULT 'walkin',
    company_name  VARCHAR(150),
    cnic          VARCHAR(20),
    daily_qty     NUMERIC(10,2) DEFAULT 0,
    rate_per_liter NUMERIC(10,4) DEFAULT 0,
    credit_limit  NUMERIC(10,2) DEFAULT 0,
    payment_terms VARCHAR(30) DEFAULT 'monthly',
    outstanding   NUMERIC(10,2) DEFAULT 0,
    is_active     BOOLEAN DEFAULT TRUE,
    created_by    BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS receipts (
    id               BIGSERIAL PRIMARY KEY,
    receipt_no       VARCHAR(30) UNIQUE NOT NULL,
    customer_id      BIGINT REFERENCES customers(id) ON DELETE SET NULL,
    customer_type    VARCHAR(20),
    receipt_date     DATE NOT NULL DEFAULT CURRENT_DATE,
    period_start     DATE,
    period_end       DATE,
    milk_qty         NUMERIC(10,3) DEFAULT 0,
    milk_amount      NUMERIC(10,2) DEFAULT 0,
    total_amount     NUMERIC(10,2) NOT NULL DEFAULT 0,
    paid_amount      NUMERIC(10,2) DEFAULT 0,
    status           VARCHAR(20) DEFAULT 'paid',
    notes            TEXT,
    created_by       BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS invoices (
    id             BIGSERIAL PRIMARY KEY,
    invoice_no     VARCHAR(30) UNIQUE NOT NULL,
    customer_id    BIGINT REFERENCES customers(id) ON DELETE SET NULL,
    customer_type  VARCHAR(20),
    customer_name  VARCHAR(150),
    invoice_date   DATE NOT NULL DEFAULT CURRENT_DATE,
    subtotal       NUMERIC(10,2) DEFAULT 0,
    discount       NUMERIC(10,2) DEFAULT 0,
    tax_pct        NUMERIC(5,2) DEFAULT 0,
    tax_amount     NUMERIC(10,2) DEFAULT 0,
    total_amount   NUMERIC(10,2) NOT NULL DEFAULT 0,
    paid_amount    NUMERIC(10,2) DEFAULT 0,
    status         VARCHAR(20) DEFAULT 'pending',
    notes          TEXT,
    created_by     BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS invoice_items (
    id           BIGSERIAL PRIMARY KEY,
    invoice_id   BIGINT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    description  VARCHAR(200),
    qty          NUMERIC(10,3) NOT NULL DEFAULT 1,
    unit         VARCHAR(20) DEFAULT 'pcs',
    rate         NUMERIC(10,4) DEFAULT 0,
    amount       NUMERIC(10,2) NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS bulk_ledger (
    id           BIGSERIAL PRIMARY KEY,
    customer_id  BIGINT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    entry_date   DATE NOT NULL,
    qty_liters   NUMERIC(10,3) NOT NULL,
    rate         NUMERIC(10,4) NOT NULL,
    amount       NUMERIC(10,2) NOT NULL,
    notes        TEXT,
    recorded_by  BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `ALTER TABLE bulk_ledger ADD COLUMN IF NOT EXISTS fat_percentage   NUMERIC(6,3)`,
  `ALTER TABLE bulk_ledger ADD COLUMN IF NOT EXISTS lr               NUMERIC(6,3)`,
  `ALTER TABLE bulk_ledger ADD COLUMN IF NOT EXISTS ts               NUMERIC(10,4)`,
  `ALTER TABLE bulk_ledger ADD COLUMN IF NOT EXISTS snf_computed     NUMERIC(6,3)`,
  `ALTER TABLE bulk_ledger ADD COLUMN IF NOT EXISTS sp_gravity       NUMERIC(6,4)`,
  `ALTER TABLE bulk_ledger ADD COLUMN IF NOT EXISTS milk_kg          NUMERIC(10,3)`,
  `ALTER TABLE bulk_ledger ADD COLUMN IF NOT EXISTS standardised_ts  NUMERIC(10,4)`,
  `CREATE TABLE IF NOT EXISTS expense_categories (
    id   BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE
  )`,
  `CREATE TABLE IF NOT EXISTS expenses (
    id             BIGSERIAL PRIMARY KEY,
    category_id    BIGINT REFERENCES expense_categories(id) ON DELETE SET NULL,
    expense_date   DATE NOT NULL,
    amount         NUMERIC(10,2) NOT NULL,
    description    TEXT,
    reference_type VARCHAR(30),
    reference_id   BIGINT,
    created_by     BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `INSERT INTO expense_categories (name) VALUES ('Shop Rent'),('Staff Salary'),('Vehicle'),('Maintenance'),('Other')
   ON CONFLICT (name) DO NOTHING`,
];

(async () => {
  let ok = 0, fail = 0;
  for (const sql of steps) {
    try { await pool.query(sql); ok++; console.log('✓', sql.slice(0, 60)); }
    catch (e) { fail++; console.log('✗', sql.slice(0, 60), '-', e.message); }
  }
  console.log(`\nMigration done: ${ok} ok, ${fail} failed`);
  await pool.end();
  process.exit(0);
})();
