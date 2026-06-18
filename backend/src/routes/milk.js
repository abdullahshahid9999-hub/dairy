const express  = require('express');
const { body } = require('express-validator');
const db       = require('../config/db');
const { validate }                = require('../middleware/validate');
const { authenticate, adminOnly } = require('../middleware/auth');
const { computeTS, getPricingConfig } = require('../utils/pricingEngine');

const router = express.Router();
router.use(authenticate);

const isPurchase = user => user?.role === 'staff' && user?.department === 'purchase';

// ── Check if migration_v2 columns exist ──────────────────────────────────────
let _migrated = null;
async function isMigrated() {
  if (_migrated !== null) return _migrated;
  try {
    const row = await db.queryOne(
      `SELECT COUNT(*) AS cnt FROM information_schema.columns
       WHERE table_name='milk_records' AND column_name='snf_computed'`
    );
    _migrated = parseInt(row.cnt) > 0;
  } catch { _migrated = false; }
  return _migrated;
}

// Minimal rules — old frontend sends shift/morning which must not fail
const rules = [
  body('quantity_liters').isFloat({ min: 0.001 }).withMessage('Quantity must be > 0'),
  body('fat_percentage').isFloat({ min: 0, max: 100 }).withMessage('FAT% must be 0–100'),
];

// ── GET list ─────────────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { farmer_id, shop_id, date_from, date_to, page = 1, limit = 100 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    let pi = 1;
    const conds = ['1=1'];

    if (isPurchase(req.user)) { conds.push(`mr.recorded_by = $${pi++}`); params.push(req.user.id); }
    if (farmer_id) { conds.push(`mr.farmer_id = $${pi++}`); params.push(farmer_id); }
    if (shop_id)   { conds.push(`mr.shop_id = $${pi++}`);   params.push(shop_id); }
    if (date_from) { conds.push(`mr.collection_date >= $${pi++}`); params.push(date_from); }
    if (date_to)   { conds.push(`mr.collection_date <= $${pi++}`); params.push(date_to); }

    const migrated = await isMigrated();
    const extraCols = migrated
      ? `mr.lactometer_reading, mr.ts_value, mr.standardised_ts,
         mr.snf_computed, mr.sp_gravity, mr.computed_rate, mr.collection_time,
         mr.shop_id,`
      : `NULL AS lactometer_reading, NULL AS ts_value, NULL AS standardised_ts,
         NULL AS snf_computed, NULL AS sp_gravity, mr.computed_rate, NULL AS collection_time,
         NULL AS shop_id,`;

    const where = conds.join(' AND ');
    const [rows] = await db.query(
      `SELECT mr.id, mr.farmer_id, mr.collection_date,
              ${extraCols}
              mr.quantity_liters, mr.fat_percentage, mr.snf_percentage,
              mr.total_amount, mr.notes, mr.recorded_by, mr.created_at,
              f.name AS farmer_name,
              COALESCE(f.centre_name, f.name) AS centre_name,
              f.farmer_code,
              s.shop_name,
              u.name AS recorded_by_name
       FROM milk_records mr
       JOIN farmers f ON f.id = mr.farmer_id
       LEFT JOIN shops s ON s.id = mr.shop_id
       LEFT JOIN users u ON u.id = mr.recorded_by
       WHERE ${where}
       ORDER BY mr.collection_date DESC, mr.created_at DESC
       LIMIT $${pi++} OFFSET $${pi++}`,
      [...params, parseInt(limit), offset]
    );

    const data = isPurchase(req.user)
      ? rows.map(r => ({ ...r, computed_rate: undefined, total_amount: undefined }))
      : rows;

    const [countRow] = await db.query(
      `SELECT COUNT(*) AS total FROM milk_records mr WHERE ${where}`, params
    );

    res.json({ success: true, data, pagination: { page: +page, limit: +limit, total: Number(countRow[0]?.total || 0) } });
  } catch (err) { next(err); }
});

// ── POST preview-rate ─────────────────────────────────────────────────────────
router.post('/preview-rate', async (req, res, next) => {
  try {
    const { fat_percentage, lactometer_reading, quantity_liters, target_ts, temperature } = req.body;
    if (!fat_percentage || !lactometer_reading || !quantity_liters)
      return res.status(400).json({ success: false, message: 'fat_percentage, lactometer_reading, quantity_liters required.' });

    let cfg = {};
    try { cfg = await getPricingConfig(); } catch {}
    if (target_ts && parseFloat(target_ts) > 0) cfg.target_ts = parseFloat(target_ts);

    const result = computeTS({
      cfg,
      fat:    parseFloat(fat_percentage),
      lr:     parseFloat(lactometer_reading),
      temperature,
      weight: parseFloat(quantity_liters),
    });

    if (isPurchase(req.user)) {
      return res.json({ success: true, data: {
        ts:              result.ts,
        standardised_ts: result.standardised_ts,
        snf_computed:    result.snf_computed,
        sp_gravity:      result.sp_gravity,
      }});
    }

    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// ── POST create ───────────────────────────────────────────────────────────────
router.post('/', async (req, res, next) => {
  try {
    const {
      farmer_id, collection_date, quantity_liters, fat_percentage,
      lactometer_reading, snf_percentage, shop_id: bodyShopId, notes, target_ts, temperature
    } = req.body;

    // Staff always get their assigned shop — admin can specify manually
    const shop_id = req.user.role === 'admin'
      ? (bodyShopId || null)
      : (req.user.shop_id || bodyShopId || null);

    // Manual validation — no express-validator (old JS sends shift which was breaking)
    const fid = parseInt(farmer_id, 10);
    if (!fid || fid < 1) {
      return res.status(422).json({ success: false, message: 'Select a supplier first.' });
    }
    const qty = parseFloat(quantity_liters);
    if (!qty || qty <= 0) {
      return res.status(422).json({ success: false, message: 'Quantity must be > 0.' });
    }
    const fat = parseFloat(fat_percentage);
    if (isNaN(fat) || fat < 0 || fat > 100) {
      return res.status(422).json({ success: false, message: 'FAT% must be 0-100.' });
    }
    const cd = collection_date || new Date().toISOString().slice(0, 10);

    let cfg = {};
    try { cfg = await getPricingConfig(); } catch {}
    if (target_ts && parseFloat(target_ts) > 0) cfg.target_ts = parseFloat(target_ts);

    const lr = lactometer_reading ? parseFloat(lactometer_reading) : 0;

    const { ts, standardised_ts, snf_computed, sp_gravity, rate_per_unit, total_payout } = computeTS({
      cfg, fat, lr, weight: qty, temperature,
    });

    const collection_time = new Date().toISOString();
    const migrated = await isMigrated();

    let insertedId;

    if (migrated) {
      const [result] = await db.query(
        `INSERT INTO milk_records
           (farmer_id, collection_date, collection_time, quantity_liters, fat_percentage,
            snf_percentage, lactometer_reading, ts_value, standardised_ts, snf_computed,
            sp_gravity, computed_rate, total_amount, shop_id, notes, recorded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         RETURNING id`,
        [fid, cd, collection_time, qty,
         fat, snf_percentage ? parseFloat(snf_percentage) : null,
         lr, ts, standardised_ts, snf_computed,
         sp_gravity, rate_per_unit, total_payout, shop_id || null, notes || null, req.user.id]
      );
      insertedId = result[0]?.id;
    } else {
      // Fallback: insert without new columns (pre-migration)
      const [result] = await db.query(
        `INSERT INTO milk_records
           (farmer_id, collection_date, quantity_liters, fat_percentage,
            snf_percentage, computed_rate, total_amount, notes, recorded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING id`,
        [fid, cd, qty,
         fat, snf_percentage ? parseFloat(snf_percentage) : null,
         rate_per_unit, total_payout, notes || null, req.user.id]
      );
      insertedId = result[0]?.id;
    }

    if (isPurchase(req.user)) {
      return res.status(201).json({ success: true, message: 'Saved.', data: { id: insertedId, ts, standardised_ts, snf_computed, sp_gravity } });
    }
    res.status(201).json({ success: true, message: 'Saved.', data: { id: insertedId, ts, standardised_ts, snf_computed, sp_gravity, rate_per_unit, total_payout } });
  } catch (err) { next(err); }
});

// ── PUT update ───────────────────────────────────────────────────────────────
router.put('/:id', adminOnly, async (req, res, next) => {
  try {
    const {
      farmer_id, collection_date, quantity_liters, fat_percentage,
      lactometer_reading, snf_percentage, shop_id, notes, target_ts
    } = req.body;

    let cfg = {};
    try { cfg = await getPricingConfig(); } catch {}
    if (target_ts && parseFloat(target_ts) > 0) cfg.target_ts = parseFloat(target_ts);

    const lr = lactometer_reading ? parseFloat(lactometer_reading) : 0;
    const { ts, standardised_ts, snf_computed, sp_gravity, rate_per_unit, total_payout } = computeTS({
      cfg, fat: parseFloat(fat_percentage), lr, weight: parseFloat(quantity_liters),
    });

    const migrated = await isMigrated();
    if (migrated) {
      await db.query(
        `UPDATE milk_records SET
           farmer_id=$1, collection_date=$2, quantity_liters=$3, fat_percentage=$4,
           snf_percentage=$5, lactometer_reading=$6, ts_value=$7, standardised_ts=$8,
           snf_computed=$9, sp_gravity=$10, computed_rate=$11, total_amount=$12,
           shop_id=$13, notes=$14
         WHERE id=$15`,
        [farmer_id, collection_date, parseFloat(quantity_liters), parseFloat(fat_percentage),
         snf_percentage || null, lr, ts, standardised_ts, snf_computed,
         sp_gravity, rate_per_unit, total_payout, shop_id || null, notes || null, req.params.id]
      );
    } else {
      await db.query(
        `UPDATE milk_records SET
           farmer_id=$1, collection_date=$2, quantity_liters=$3, fat_percentage=$4,
           snf_percentage=$5, computed_rate=$6, total_amount=$7, notes=$8
         WHERE id=$9`,
        [farmer_id, collection_date, parseFloat(quantity_liters), parseFloat(fat_percentage),
         snf_percentage || null, rate_per_unit, total_payout, notes || null, req.params.id]
      );
    }

    res.json({ success: true, message: 'Updated.' });
  } catch (err) { next(err); }
});

// ── DELETE ───────────────────────────────────────────────────────────────────
router.delete('/:id', adminOnly, async (req, res, next) => {
  try {
    await db.query('DELETE FROM milk_records WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'Deleted.' });
  } catch (err) { next(err); }
});

module.exports = router;
