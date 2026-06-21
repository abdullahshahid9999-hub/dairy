-- clear_all_data.sql
--
-- Wipes ALL data EXCEPT admin user accounts (role = 'admin').
-- This is IRREVERSIBLE. Take a Supabase backup/snapshot before running this
-- if you have any doubt.
--
-- Run this in the Supabase SQL Editor.

BEGIN;

-- 1. Truncate every table that has no special "keep some rows" requirement.
--    CASCADE handles all FK-dependent rows automatically, in any order.
--    RESTART IDENTITY resets auto-increment IDs back to 1.
TRUNCATE TABLE
  bill_line_items,
  bills,
  billing_periods,
  milk_records,
  milk_sales,
  sales_contracts,
  companies,
  vehicle_expenses,
  vehicles,
  shop_rent_payments,
  shops,
  advance_salary,
  payroll,
  employees,
  expenses,
  expense_categories,
  farmers,
  audit_logs
RESTART IDENTITY CASCADE;

-- 2. Users table: delete everyone EXCEPT admin accounts.
--    (Non-admin users may be referenced by employees.user_id, but employees
--     was already wiped above, so this is now safe.)
DELETE FROM users WHERE role <> 'admin';

-- 3. Settings: keep the table structure and keys, but reset values to blank
--    defaults EXCEPT app branding (app_name, logo, currency, timezone) which
--    you likely want to keep. Adjust this list if you want those reset too.
UPDATE settings SET value = '' WHERE key IN ('admin_whatsapp');

COMMIT;

-- Sanity check after running — should show 0 for everything except users (admin count) and settings.
SELECT 'farmers' AS table_name, COUNT(*) FROM farmers
UNION ALL SELECT 'milk_records', COUNT(*) FROM milk_records
UNION ALL SELECT 'employees', COUNT(*) FROM employees
UNION ALL SELECT 'users (remaining)', COUNT(*) FROM users
UNION ALL SELECT 'vehicles', COUNT(*) FROM vehicles
UNION ALL SELECT 'companies', COUNT(*) FROM companies;
