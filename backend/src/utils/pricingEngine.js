/**
 * Brimi Dairy Pricing Engine
 *
 * Formulas (verified against confirmed reference figures):
 *   SP Gravity          = (LR / 1000) + 1
 *   SNF%                = (LR / 4) + (0.22 × Fat%) + 0.72
 *   TS%                 = Fat% + SNF%
 *   Milk Weight (kg)    = Liters × SP Gravity
 *   TS Milk Quantity    = Liters × (TS% / Std_TS%)   ← standardized volume, in liters
 *   Total Payout        = TS Milk Quantity × base_rate
 */

const db = require('../config/db');

const DEFAULT = {
  target_ts:   13,
  base_rate:   1,
};

/**
 * Reads pricing config (target_ts, base_rate, and the TS formula constants)
 * from the settings table. Falls back to DEFAULT for any key not set.
 *
 * IMPORTANT: this was previously called but never defined anywhere, which
 * meant every purchase calculation silently fell back to DEFAULT.base_rate
 * (=1) instead of the admin's actual configured rate. Fixed.
 */
async function getPricingConfig() {
  const keys = ['target_ts', 'base_rate', 'constant_c1', 'constant_c2', 'constant_c3', 'constant_scale'];
  const cfg = {};
  try {
    const [rows] = await db.query(
      `SELECT key, value FROM settings WHERE key = ANY($1)`,
      [keys]
    );
    rows.forEach(r => { cfg[r.key] = r.value; });
  } catch (err) {
    console.error('[pricingEngine] getPricingConfig failed, using defaults:', err.message);
  }
  return cfg;
}

function getNum(cfg, key) {
  const v = parseFloat(cfg?.[key]);
  return isNaN(v) ? DEFAULT[key] : v;
}

function validateConfig(cfg) {
  const t = getNum(cfg, 'target_ts');
  if (t === 0) throw new Error('target_ts cannot be zero — update Settings.');
}

/**
 * Main calculation
 * @param {object} cfg        - pricing config from DB (target_ts, base_rate)
 * @param {number} fat        - Fat%
 * @param {number} lr         - Lactometer Reading
 * @param {number} weight     - quantity in Liters (input from user)
 *
 * Returns all display values + payout
 */
function computeTS({ cfg = {}, fat, lr, weight }) {
  validateConfig(cfg);

  const ts_t  = getNum(cfg, 'target_ts');   // Std TS% (default 13)
  const brate = getNum(cfg, 'base_rate');

  const f = parseFloat(fat);
  const l = parseFloat(lr);
  const w = parseFloat(weight);             // liters

  // 1. Specific Gravity
  const sp_gravity = (l / 1000) + 1;

  // 2. SNF%
  const snf_computed = (l / 4) + (0.22 * f) + 0.72;

  // 3. TS%
  const ts = f + snf_computed;

  // 4. Weight in kg (informational)
  const milk_kg = w * sp_gravity;

  // 5. Dry Solids Weight (informational)
  const dry_solids = milk_kg * (ts / 100);

  // 6. TS Milk Quantity — standardized volume, based on liters (not kg)
  const standardised_ts = w * (ts / ts_t);

  // 7. Purchase Rate = farmer's own base_rate (per standardized liter)
  const rate_per_unit = brate;

  // 8. Total Payout = TS Milk Quantity × base_rate
  const total_payout = standardised_ts * brate;

  return {
    ts:              parseFloat(ts.toFixed(4)),
    snf_computed:    parseFloat(snf_computed.toFixed(4)),
    sp_gravity:      parseFloat(sp_gravity.toFixed(4)),
    milk_kg:         parseFloat(milk_kg.toFixed(4)),
    dry_solids:      parseFloat(dry_solids.toFixed(4)),
    standardised_ts: parseFloat(standardised_ts.toFixed(4)),
    rate_per_unit:   parseFloat(rate_per_unit.toFixed(4)),
    total_payout:    parseFloat(total_payout.toFixed(2)),
  };
}

// Legacy helpers kept for backward compat
function computeRate({ base_rate, ideal_fat, ideal_snf, fat_correction, snf_correction, actual_fat, actual_snf }) {
  const fatAdj = (actual_fat - ideal_fat) * fat_correction;
  const snfAdj = actual_snf != null ? (actual_snf - ideal_snf) * snf_correction : 0;
  return Math.max(0, parseFloat((parseFloat(base_rate) + fatAdj + snfAdj).toFixed(4)));
}
function computeAmount(quantity_liters, computed_rate) {
  return parseFloat((parseFloat(quantity_liters) * computed_rate).toFixed(4));
}

module.exports = { computeTS, computeRate, computeAmount, validateConfig, getPricingConfig, DEFAULT };
