-- migration_whatsapp.sql
-- Run this once against your existing Supabase database.
-- Adds: admin WhatsApp number setting, and a log table to track sent notifications.
--
-- Covers both:
--   - Milk PURCHASE (collection): admin + supplier notified
--   - Milk SALE (to company):     admin + company notified
-- Required Meta templates: purchase_alert_admin, purchase_alert_supplier,
--                           sale_alert_admin, sale_alert_company

INSERT INTO settings (key, value, description) VALUES
  ('admin_whatsapp', '', 'Admin WhatsApp number for purchase/sale alerts (e.g. 03001234567)')
ON CONFLICT (key) DO NOTHING;

-- Optional but recommended: keeps a record of every WhatsApp send attempt,
-- useful for debugging delivery issues and for an audit trail.
CREATE TABLE IF NOT EXISTS whatsapp_logs (
  id            BIGSERIAL PRIMARY KEY,
  recipient     VARCHAR(20)  NOT NULL,
  recipient_type VARCHAR(20) NOT NULL,   -- 'admin' or 'supplier'
  template_name VARCHAR(100) NOT NULL,
  related_table VARCHAR(50),             -- e.g. 'milk_records'
  related_id    BIGINT,
  success       BOOLEAN      NOT NULL,
  error_detail  TEXT,
  created_at    TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_related ON whatsapp_logs(related_table, related_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_created ON whatsapp_logs(created_at);
