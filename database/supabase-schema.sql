-- ============================================================
-- DAIRY ERP — Supabase (PostgreSQL) Schema
-- Matches schema.sql table names exactly so all routes work
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- ============================================================

-- ============================================================
-- 1. USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id                  BIGSERIAL PRIMARY KEY,
  name                VARCHAR(100)  NOT NULL,
  email               VARCHAR(150)  NOT NULL UNIQUE,
  password_hash       VARCHAR(255),
  role                VARCHAR(10)   NOT NULL DEFAULT 'staff' CHECK (role IN ('admin','staff')),
  avatar_url          VARCHAR(500),
  google_id           VARCHAR(100)  UNIQUE,
  is_active           BOOLEAN       NOT NULL DEFAULT TRUE,
  email_verified      BOOLEAN       NOT NULL DEFAULT FALSE,
  verification_token  VARCHAR(64),
  token_expires_at    TIMESTAMPTZ,
  refresh_token_hash  VARCHAR(255),
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_email  ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role   ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);

-- ============================================================
-- 2. FARMERS
-- ============================================================
CREATE TABLE IF NOT EXISTS farmers (
  id              BIGSERIAL PRIMARY KEY,
  farmer_code     VARCHAR(20)   NOT NULL UNIQUE,
  name            VARCHAR(100)  NOT NULL,
  phone           VARCHAR(20)   NOT NULL,
  address         TEXT          NOT NULL,
  bank_name       VARCHAR(100),
  bank_account    VARCHAR(50),
  base_rate       NUMERIC(8,2)  NOT NULL DEFAULT 45.00,
  ideal_fat       NUMERIC(5,2)  NOT NULL DEFAULT 6.00,
  ideal_snf       NUMERIC(5,2)  NOT NULL DEFAULT 9.00,
  fat_correction  NUMERIC(8,4)  NOT NULL DEFAULT 0.50,
  snf_correction  NUMERIC(8,4)  NOT NULL DEFAULT 0.30,
  is_active       BOOLEAN       NOT NULL DEFAULT TRUE,
  created_by      BIGINT        REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_farmers_name   ON farmers(name);
CREATE INDEX IF NOT EXISTS idx_farmers_active ON farmers(is_active);

-- ============================================================
-- 3. MILK RECORDS
-- ============================================================
CREATE TABLE IF NOT EXISTS milk_records (
  id               BIGSERIAL PRIMARY KEY,
  farmer_id        BIGINT        NOT NULL REFERENCES farmers(id) ON DELETE RESTRICT,
  collection_date  DATE          NOT NULL,
  shift            VARCHAR(10)   NOT NULL DEFAULT 'morning' CHECK (shift IN ('morning','evening')),
  quantity_liters  NUMERIC(10,2) NOT NULL,
  fat_percentage   NUMERIC(5,2)  NOT NULL,
  snf_percentage   NUMERIC(5,2),
  base_rate        NUMERIC(8,2)  NOT NULL,
  fat_correction   NUMERIC(8,4)  NOT NULL,
  snf_correction   NUMERIC(8,4)  NOT NULL,
  computed_rate    NUMERIC(8,2)  NOT NULL,
  total_amount     NUMERIC(12,2) NOT NULL,
  notes            TEXT,
  recorded_by      BIGINT        REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_milk_farmer    ON milk_records(farmer_id);
CREATE INDEX IF NOT EXISTS idx_milk_date      ON milk_records(collection_date);
CREATE INDEX IF NOT EXISTS idx_milk_dateshift ON milk_records(collection_date, shift);

-- ============================================================
-- 4. BILLING PERIODS
-- ============================================================
CREATE TABLE IF NOT EXISTS billing_periods (
  id            BIGSERIAL PRIMARY KEY,
  period_month  SMALLINT      NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  period_year   SMALLINT      NOT NULL,
  status        VARCHAR(10)   NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','paid')),
  closed_at     TIMESTAMPTZ,
  created_by    BIGINT        REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE(period_month, period_year)
);

-- ============================================================
-- 5. BILLS
-- ============================================================
CREATE TABLE IF NOT EXISTS bills (
  id                  BIGSERIAL PRIMARY KEY,
  bill_number         VARCHAR(30)   NOT NULL UNIQUE,
  billing_period_id   BIGINT        NOT NULL REFERENCES billing_periods(id) ON DELETE RESTRICT,
  farmer_id           BIGINT        NOT NULL REFERENCES farmers(id) ON DELETE RESTRICT,
  total_liters        NUMERIC(12,2) NOT NULL DEFAULT 0,
  avg_fat             NUMERIC(5,2),
  avg_snf             NUMERIC(5,2),
  total_amount        NUMERIC(14,2) NOT NULL DEFAULT 0,
  advance_deduction   NUMERIC(14,2) NOT NULL DEFAULT 0,
  other_deductions    NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_payable         NUMERIC(14,2) NOT NULL DEFAULT 0,
  status              VARCHAR(15)   NOT NULL DEFAULT 'generated' CHECK (status IN ('generated','paid','cancelled')),
  generated_by        BIGINT        REFERENCES users(id) ON DELETE SET NULL,
  paid_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE(billing_period_id, farmer_id)
);
CREATE INDEX IF NOT EXISTS idx_bills_farmer ON bills(farmer_id);
CREATE INDEX IF NOT EXISTS idx_bills_status ON bills(status);

-- ============================================================
-- 6. BILL LINE ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS bill_line_items (
  id               BIGSERIAL PRIMARY KEY,
  bill_id          BIGINT        NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  milk_record_id   BIGINT        NOT NULL,
  collection_date  DATE          NOT NULL,
  shift            VARCHAR(10)   NOT NULL,
  quantity_liters  NUMERIC(10,2) NOT NULL,
  fat_percentage   NUMERIC(5,2)  NOT NULL,
  snf_percentage   NUMERIC(5,2),
  computed_rate    NUMERIC(8,2)  NOT NULL,
  line_amount      NUMERIC(12,2) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_line_bill ON bill_line_items(bill_id);

-- ============================================================
-- 7. COMPANIES (bulk milk buyers)
-- ============================================================
CREATE TABLE IF NOT EXISTS companies (
  id            BIGSERIAL PRIMARY KEY,
  name          VARCHAR(150)  NOT NULL,
  contact_name  VARCHAR(100),
  phone         VARCHAR(20),
  address       TEXT,
  gstin         VARCHAR(20),
  is_active     BOOLEAN       NOT NULL DEFAULT TRUE,
  created_by    BIGINT        REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 8. SALES CONTRACTS
-- ============================================================
CREATE TABLE IF NOT EXISTS sales_contracts (
  id              BIGSERIAL PRIMARY KEY,
  company_id      BIGINT        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  contract_ref    VARCHAR(50),
  rate_per_liter  NUMERIC(8,2)  NOT NULL,
  min_quantity    NUMERIC(10,2),
  start_date      DATE          NOT NULL,
  end_date        DATE,
  status          VARCHAR(15)   NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','terminated')),
  notes           TEXT,
  created_by      BIGINT        REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contracts_company ON sales_contracts(company_id);

-- ============================================================
-- 9. MILK SALES
-- ============================================================
CREATE TABLE IF NOT EXISTS milk_sales (
  id               BIGSERIAL PRIMARY KEY,
  contract_id      BIGINT        NOT NULL REFERENCES sales_contracts(id) ON DELETE RESTRICT,
  company_id       BIGINT        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  sale_date        DATE          NOT NULL,
  quantity_liters  NUMERIC(10,2) NOT NULL,
  fat_percentage   NUMERIC(5,2),
  snf_percentage   NUMERIC(5,2),
  rate_per_liter   NUMERIC(8,2)  NOT NULL,
  total_amount     NUMERIC(12,2) NOT NULL,
  payment_status   VARCHAR(10)   NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending','received','partial')),
  received_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes            TEXT,
  recorded_by      BIGINT        REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sales_company ON milk_sales(company_id);
CREATE INDEX IF NOT EXISTS idx_sales_date    ON milk_sales(sale_date);

-- ============================================================
-- 10. VEHICLES
-- ============================================================
CREATE TABLE IF NOT EXISTS vehicles (
  id              BIGSERIAL PRIMARY KEY,
  reg_number      VARCHAR(30)   NOT NULL UNIQUE,
  make_model      VARCHAR(100),
  ownership_type  VARCHAR(10)   NOT NULL DEFAULT 'owned' CHECK (ownership_type IN ('owned','rented')),
  owner_name      VARCHAR(100),
  owner_phone     VARCHAR(20),
  monthly_rent    NUMERIC(10,2),
  is_active       BOOLEAN       NOT NULL DEFAULT TRUE,
  notes           TEXT,
  created_by      BIGINT        REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 11. VEHICLE EXPENSES
-- ============================================================
CREATE TABLE IF NOT EXISTS vehicle_expenses (
  id            BIGSERIAL PRIMARY KEY,
  vehicle_id    BIGINT        NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
  expense_date  DATE          NOT NULL,
  expense_type  VARCHAR(20)   NOT NULL CHECK (expense_type IN ('diesel','service','rent','insurance','other')),
  amount        NUMERIC(10,2) NOT NULL,
  odometer_km   INTEGER,
  notes         TEXT,
  recorded_by   BIGINT        REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vexp_vehicle ON vehicle_expenses(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vexp_date    ON vehicle_expenses(expense_date);

-- ============================================================
-- 12. SHOPS
-- ============================================================
CREATE TABLE IF NOT EXISTS shops (
  id              BIGSERIAL PRIMARY KEY,
  shop_name       VARCHAR(150)  NOT NULL,
  location        TEXT,
  ownership_type  VARCHAR(10)   NOT NULL DEFAULT 'owned' CHECK (ownership_type IN ('owned','rented')),
  owner_name      VARCHAR(100),
  owner_phone     VARCHAR(20),
  monthly_rent    NUMERIC(10,2),
  rent_due_day    SMALLINT,
  latitude        NUMERIC(10,8),
  longitude       NUMERIC(11,8),
  is_active       BOOLEAN       NOT NULL DEFAULT TRUE,
  created_by      BIGINT        REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 13. SHOP RENT PAYMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS shop_rent_payments (
  id          BIGSERIAL PRIMARY KEY,
  shop_id     BIGINT        NOT NULL REFERENCES shops(id) ON DELETE RESTRICT,
  paid_for    VARCHAR(7)    NOT NULL,
  paid_date   DATE          NOT NULL,
  amount      NUMERIC(10,2) NOT NULL,
  notes       TEXT,
  recorded_by BIGINT        REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shop_rent ON shop_rent_payments(shop_id);

-- ============================================================
-- 14. EMPLOYEES
-- ============================================================
CREATE TABLE IF NOT EXISTS employees (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT        REFERENCES users(id) ON DELETE SET NULL,
  emp_code     VARCHAR(20)   NOT NULL UNIQUE,
  name         VARCHAR(100)  NOT NULL,
  phone        VARCHAR(20),
  address      TEXT,
  designation  VARCHAR(100),
  department   VARCHAR(100),
  base_salary  NUMERIC(10,2) NOT NULL DEFAULT 0,
  join_date    DATE,
  is_active    BOOLEAN       NOT NULL DEFAULT TRUE,
  created_by   BIGINT        REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 15. ADVANCE SALARY
-- ============================================================
CREATE TABLE IF NOT EXISTS advance_salary (
  id           BIGSERIAL PRIMARY KEY,
  employee_id  BIGINT        NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  amount       NUMERIC(10,2) NOT NULL,
  advance_date DATE          NOT NULL,
  recovered    NUMERIC(10,2) NOT NULL DEFAULT 0,
  status       VARCHAR(10)   NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','partial','recovered')),
  notes        TEXT,
  created_by   BIGINT        REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_advance_emp ON advance_salary(employee_id);

-- ============================================================
-- 16. PAYROLL
-- ============================================================
CREATE TABLE IF NOT EXISTS payroll (
  id                  BIGSERIAL PRIMARY KEY,
  employee_id         BIGINT        NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  payroll_month       VARCHAR(7)    NOT NULL,
  base_salary         NUMERIC(10,2) NOT NULL,
  allowances          NUMERIC(10,2) NOT NULL DEFAULT 0,
  advance_deduction   NUMERIC(10,2) NOT NULL DEFAULT 0,
  other_deductions    NUMERIC(10,2) NOT NULL DEFAULT 0,
  net_salary          NUMERIC(10,2) NOT NULL,
  status              VARCHAR(10)   NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','paid')),
  paid_at             TIMESTAMPTZ,
  notes               TEXT,
  processed_by        BIGINT        REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE(employee_id, payroll_month)
);
CREATE INDEX IF NOT EXISTS idx_payroll_emp   ON payroll(employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_month ON payroll(payroll_month);

-- ============================================================
-- 17. EXPENSE CATEGORIES
-- ============================================================
CREATE TABLE IF NOT EXISTS expense_categories (
  id          BIGSERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 18. EXPENSES
-- ============================================================
CREATE TABLE IF NOT EXISTS expenses (
  id              BIGSERIAL PRIMARY KEY,
  category_id     BIGINT        NOT NULL REFERENCES expense_categories(id) ON DELETE RESTRICT,
  expense_date    DATE          NOT NULL,
  amount          NUMERIC(10,2) NOT NULL,
  description     VARCHAR(500),
  reference_type  VARCHAR(50),
  reference_id    BIGINT,
  created_by      BIGINT        REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_expense_date     ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expense_category ON expenses(category_id);

-- ============================================================
-- 19. AUDIT LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT       REFERENCES users(id) ON DELETE SET NULL,
  action      VARCHAR(20)  NOT NULL,
  table_name  VARCHAR(64)  NOT NULL,
  record_id   BIGINT,
  old_values  JSONB,
  new_values  JSONB,
  ip_address  VARCHAR(45),
  user_agent  VARCHAR(500),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_user  ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_table ON audit_logs(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_date  ON audit_logs(created_at);

-- ============================================================
-- 20. SETTINGS (logo + config)
-- ============================================================
CREATE TABLE IF NOT EXISTS settings (
  key         VARCHAR(100) PRIMARY KEY,
  value       TEXT,
  description TEXT,
  updated_by  BIGINT       REFERENCES users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- ============================================================
-- TRIGGERS — auto updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['users','farmers','milk_records','bills','companies',
    'milk_sales','vehicles','shops','employees','expenses'] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%I_updated_at ON %I;
       CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t,t,t,t);
  END LOOP;
END;
$$;

-- ============================================================
-- SEED DATA
-- ============================================================
INSERT INTO expense_categories (name, description) VALUES
  ('Diesel',          'Fuel expenses'),
  ('Vehicle Service', 'Maintenance and repairs'),
  ('Rent',            'Shop and office rent'),
  ('Salaries',        'Employee salaries'),
  ('Utilities',       'Electricity, water, gas'),
  ('Procurement',     'Consumables and supplies'),
  ('Insurance',       'Vehicle and property insurance'),
  ('Miscellaneous',   'Other expenses')
ON CONFLICT (name) DO NOTHING;

INSERT INTO settings (key, value, description) VALUES
  ('app_name',  'Dairy ERP',    'App display name'),
  ('logo_url',  '',             'Company logo — base64 or URL'),
  ('logo_name', 'Dairy ERP',    'Company name shown next to logo'),
  ('currency',  'PKR',          'Currency symbol'),
  ('timezone',  'Asia/Karachi', 'Timezone'),
  ('admin_whatsapp', '', 'Admin WhatsApp number for purchase/sale alerts (e.g. 03001234567)')
ON CONFLICT (key) DO NOTHING;

-- Default admin user — password: Admin@1234
-- CHANGE THIS PASSWORD IMMEDIATELY AFTER FIRST LOGIN
INSERT INTO users (name, email, password_hash, role, is_active, email_verified)
VALUES (
  'System Admin',
  'admin@dairy.local',
  '$2b$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
  'admin', TRUE, TRUE
)
ON CONFLICT (email) DO NOTHING;
