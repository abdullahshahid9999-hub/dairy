/**
 * Brimi Dairy Pricing Engine
 *
 * Formulas:
 *   SP Gravity      = (LR / 1000) + 1
 *   SNF%            = (LR / 4) + (0.21 × Fat%) + 0.36
 *   TS%             = Fat% + SNF%
 *   Weight (kg)     = Liters × SP Gravity
 *   Dry Solids Wt   = Weight_kg × (TS% / 100)
 *   Std Qty         = Weight_kg × (TS% / Std_TS%)
 *   Purchase Rate   = Std_TS% × base_rate
 *   Total Payout    = Purchase_Rate × Weight_kg
 */

const DEFAULT = {
  target_ts:   13,
  base_rate:   1,
};

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
  const snf_computed = (l / 4) + (0.21 * f) + 0.36;

  // 3. TS%
  const ts = f + snf_computed;

  // 4. Weight in kg
  const milk_kg = w * sp_gravity;

  // 5. Dry Solids Weight
  const dry_solids = milk_kg * (ts / 100);

  // 6. Standardized Qty = milk_kg × (TS% / Std_TS%)
  const standardised_ts = milk_kg * (ts / ts_t);

  // 7. Purchase Rate = Std_TS × base_rate
  const rate_per_unit = standardised_ts * brate;

  // 8. Total Payout = Purchase_Rate × milk_kg
  const total_payout = rate_per_unit * milk_kg;

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

module.exports = { computeTS, computeRate, computeAmount, validateConfig, DEFAULT };
