require('dotenv').config();
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) { console.log('No DATABASE_URL, skipping migration'); process.exit(0); }

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const steps = [
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS department  VARCHAR(50)  DEFAULT 'sales'`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB        DEFAULT '[]'::jsonb`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS shop_id     BIGINT       REFERENCES shops(id) ON DELETE SET NULL`,
  `ALTER TABLE employees ADD COLUMN IF NOT EXISTS shop_id BIGINT REFERENCES shops(id) ON DELETE SET NULL`,
  `ALTER TABLE milk_records ADD COLUMN IF NOT EXISTS shop_id            BIGINT REFERENCES shops(id) ON DELETE SET NULL`,
  `ALTER TABLE milk_records ADD COLUMN IF NOT EXISTS collection_time    TIME`,
  `ALTER TABLE milk_records ADD COLUMN IF NOT EXISTS lactometer_reading NUMERIC(6,2)`,
  `ALTER TABLE milk_records ADD COLUMN IF NOT EXISTS snf_computed       NUMERIC(6,4)`,
  `ALTER TABLE milk_records ADD COLUMN IF NOT EXISTS sp_gravity         NUMERIC(8,6)`,
  `ALTER TABLE milk_records ADD COLUMN IF NOT EXISTS standardised_ts    NUMERIC(8,4)`,
  `ALTER TABLE milk_records ADD COLUMN IF NOT EXISTS ts_value           NUMERIC(8,4)`,
  `ALTER TABLE receipts ADD COLUMN IF NOT EXISTS shop_id BIGINT REFERENCES shops(id) ON DELETE SET NULL`,
  `CREATE INDEX IF NOT EXISTS idx_employees_shop ON employees(shop_id)`,
  `CREATE INDEX IF NOT EXISTS idx_milk_shop      ON milk_records(shop_id)`,
  `CREATE INDEX IF NOT EXISTS idx_receipts_shop  ON receipts(shop_id)`,
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
  // Ensure payroll table exists
  `CREATE TABLE IF NOT EXISTS payroll (
    id               BIGSERIAL PRIMARY KEY,
    employee_id      BIGINT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    payroll_month    VARCHAR(7) NOT NULL,
    base_salary      NUMERIC(10,2) NOT NULL,
    adjustments      NUMERIC(10,2) NOT NULL DEFAULT 0,
    advance_deducted NUMERIC(10,2) NOT NULL DEFAULT 0,
    net_salary       NUMERIC(10,2) NOT NULL,
    status           VARCHAR(20) NOT NULL DEFAULT 'pending',
    paid_date        DATE,
    created_by       BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(employee_id, payroll_month)
  )`,
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
