-- migration_bulk_ts_pricing.sql
-- Run once in Supabase SQL Editor.
--
-- Adds FAT%/LR/TS-derived columns to bulk_ledger so bulk customer sales can be
-- priced using the same standardised-TS formula as farmer purchases, instead
-- of a flat qty x rate. Existing rows are untouched (new columns are nullable
-- so old flat-rate entries remain valid history).
--
-- Pricing model:
--   rate column           -> repurposed as the FINAL computed rate per
--                            standardised unit (was: flat manual rate)
--   amount column         -> unchanged meaning: total payout for the entry
--   customers.rate_per_liter -> repurposed as this customer's "base_rate"
--                            (price per standardised-TS unit), same role as
--                            the global base_rate used for farmer purchases

ALTER TABLE bulk_ledger
  ADD COLUMN IF NOT EXISTS fat_percentage   NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS lr               NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS ts               NUMERIC(6,4),
  ADD COLUMN IF NOT EXISTS snf_computed     NUMERIC(6,4),
  ADD COLUMN IF NOT EXISTS sp_gravity       NUMERIC(6,4),
  ADD COLUMN IF NOT EXISTS milk_kg          NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS standardised_ts  NUMERIC(10,4);

COMMENT ON COLUMN bulk_ledger.rate IS 'Final computed rate per standardised unit (FAT/LR-based) for new entries; flat manual rate for legacy entries.';
COMMENT ON COLUMN bulk_ledger.qty_liters IS 'Raw liters entered by the operator (before TS standardisation).';
