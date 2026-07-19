const router   = require('express').Router();
const { body } = require('express-validator');
const db       = require('../config/db');
const { validate }                = require('../middleware/validate');
const { authenticate, adminOnly } = require('../middleware/auth');

router.use(authenticate);

const rules = [
  body('name').trim().notEmpty().isLength({ max: 100 }),
  body('phone').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 20 }),
  body('address').optional({ nullable: true, checkFalsy: true }).trim(),
  body('base_rate').isFloat({ min: 0 }),
  body('ideal_fat').optional({ nullable: true }).isFloat({ min: 0, max: 20 }),
  body('ideal_snf').optional({ nullable: true }).isFloat({ min: 0, max: 20 }),
  body('fat_correction').optional({ nullable: true }).isFloat({ min: 0 }),
  body('snf_correction').optional({ nullable: true }).isFloat({ min: 0 }),
  body('bank_name').optional({ nullable: true }).isLength({ max: 100 }),
  body('bank_account').optional({ nullable: true }).isLength({ max: 50 }),
  body('centre_name').optional({ nullable: true }).isString().isLength({ max: 150 }),
  body('supplier_rate').optional({ nullable: true }).isFloat({ min: 0 }),
];

// ── Check if extra columns exist (migration_v2 guard) ────────────────────────
let _hasCentreName = null;
async function hasCentreCol() {
  if (_hasCentreName !== null) return _hasCentreName;
  try {
    const row = await db.queryOne(
      `SELECT COUNT(*) AS cnt FROM information_schema.columns
       WHERE table_name='farmers' AND column_name='centre_name'`
    );
    _hasCentreName = parseInt(row.cnt) > 0;
  } catch { _hasCentreName = false; }
  return _hasCentreName;
}

// GET /api/farmers
router.get('/', async (req, res, next) => {
  try {
    const { search = '', active = '1', page = 1, limit = 50 } = req.query;
    const offset   = (parseInt(page) - 1) * parseInt(limit);
    const hasCentre = await hasCentreCol();

    // Build SELECT — include new columns only if they exist
    const extraCols = hasCentre
      ? ', f.centre_name, f.supplier_rate'
      : ", f.name AS centre_name, 0 AS supplier_rate";

    let sql = `
      SELECT f.id, f.name, f.phone, f.address, f.farmer_code,
             f.base_rate, f.ideal_fat, f.ideal_snf,
             f.fat_correction, f.snf_correction,
             f.bank_name, f.bank_account,
             f.is_active, f.created_at
             ${extraCols},
             COUNT(mr.id)::int                  AS total_records,
             COALESCE(SUM(mr.quantity_liters),0) AS total_liters,
             COALESCE(SUM(mr.total_amount),0)    AS total_earned
      FROM farmers f
      LEFT JOIN milk_records mr ON mr.farmer_id = f.id
      WHERE f.name ILIKE $1`;
    const params = [`%${search}%`];
    let idx = 2;

    if (active !== 'all') {
      sql += ` AND f.is_active = $${idx++}`;
      params.push(active === '1');
    }
    sql += ` GROUP BY f.id ORDER BY f.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(parseInt(limit), offset);

    const [rows] = await db.query(sql, params);

    let cSql = 'SELECT COUNT(*) AS total FROM farmers WHERE name ILIKE $1';
    const cParams = [`%${search}%`];
    if (active !== 'all') { cSql += ' AND is_active = $2'; cParams.push(active === '1'); }
    const countRow = await db.queryOne(cSql, cParams);

    res.json({ success: true, data: rows, pagination: { page: +page, limit: +limit, total: Number(countRow.total) } });
  } catch (err) { next(err); }
});

// GET /api/farmers/:id
router.get('/:id', async (req, res, next) => {
  try {
    const hasCentre = await hasCentreCol();
    const extraCols = hasCentre ? ', centre_name, supplier_rate' : ", name AS centre_name, 0 AS supplier_rate";
    const row = await db.queryOne(
      `SELECT *${extraCols} FROM farmers WHERE id = $1`,
      [req.params.id]
    );
    if (!row) return res.status(404).json({ success: false, message: 'Farmer not found' });
    res.json({ success: true, data: row });
  } catch (err) { next(err); }
});

// POST /api/farmers — admin only
router.post('/', adminOnly, rules, validate, async (req, res, next) => {
  try {
    const {
      name, phone, address, base_rate,
      ideal_fat = 0, ideal_snf = 0,
      fat_correction = 0, snf_correction = 0,
      bank_name = null, bank_account = null,
      centre_name = null, supplier_rate = null,
    } = req.body;

    const hasCentre = await hasCentreCol();
    let sql, params;

    if (hasCentre) {
      sql = `INSERT INTO farmers
               (name, phone, address, base_rate, ideal_fat, ideal_snf,
                fat_correction, snf_correction, bank_name, bank_account,
                centre_name, supplier_rate)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
             RETURNING *`;
      params = [name, phone, address, parseFloat(base_rate),
        parseFloat(ideal_fat||0), parseFloat(ideal_snf||0),
        parseFloat(fat_correction||0), parseFloat(snf_correction||0),
        bank_name, bank_account, centre_name || name, supplier_rate];
    } else {
      sql = `INSERT INTO farmers
               (name, phone, address, base_rate, ideal_fat, ideal_snf,
                fat_correction, snf_correction, bank_name, bank_account)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
             RETURNING *`;
      params = [name, phone, address, parseFloat(base_rate),
        parseFloat(ideal_fat||0), parseFloat(ideal_snf||0),
        parseFloat(fat_correction||0), parseFloat(snf_correction||0),
        bank_name, bank_account];
    }

    const row = await db.queryOne(sql, params);
    res.status(201).json({ success: true, data: row });
  } catch (err) { next(err); }
});

// PUT /api/farmers/:id — admin only
router.put('/:id', adminOnly, rules, validate, async (req, res, next) => {
  try {
    const {
      name, phone, address, base_rate,
      ideal_fat = 0, ideal_snf = 0,
      fat_correction = 0, snf_correction = 0,
      bank_name = null, bank_account = null,
      centre_name = null, supplier_rate = null,
      is_active = true,
    } = req.body;

    const hasCentre = await hasCentreCol();
    let sql, params;

    if (hasCentre) {
      sql = `UPDATE farmers SET
               name=$1, phone=$2, address=$3, base_rate=$4,
               ideal_fat=$5, ideal_snf=$6, fat_correction=$7, snf_correction=$8,
               bank_name=$9, bank_account=$10,
               centre_name=$11, supplier_rate=$12, is_active=$13
             WHERE id=$14 RETURNING *`;
      params = [name, phone, address, parseFloat(base_rate),
        parseFloat(ideal_fat||0), parseFloat(ideal_snf||0),
        parseFloat(fat_correction||0), parseFloat(snf_correction||0),
        bank_name, bank_account, centre_name || name, supplier_rate,
        Boolean(is_active), req.params.id];
    } else {
      sql = `UPDATE farmers SET
               name=$1, phone=$2, address=$3, base_rate=$4,
               ideal_fat=$5, ideal_snf=$6, fat_correction=$7, snf_correction=$8,
               bank_name=$9, bank_account=$10, is_active=$11
             WHERE id=$12 RETURNING *`;
      params = [name, phone, address, parseFloat(base_rate),
        parseFloat(ideal_fat||0), parseFloat(ideal_snf||0),
        parseFloat(fat_correction||0), parseFloat(snf_correction||0),
        bank_name, bank_account, Boolean(is_active), req.params.id];
    }

    const row = await db.queryOne(sql, params);
    if (!row) return res.status(404).json({ success: false, message: 'Farmer not found' });
    res.json({ success: true, data: row });
  } catch (err) { next(err); }
});

// DELETE /api/farmers/:id — admin only
router.delete('/:id', adminOnly, async (req, res, next) => {
  try {
    await db.query('DELETE FROM farmers WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'Deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
