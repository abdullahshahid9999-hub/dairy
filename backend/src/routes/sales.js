const router   = require('express').Router();
const { body } = require('express-validator');
const db       = require('../config/db');
const { validate }              = require('../middleware/validate');
const { authenticate, adminOnly } = require('../middleware/auth');

router.use(authenticate);

// ── Companies ──────────────────────────────────────────────

router.get('/companies', async (_req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT c.*,
         COUNT(ms.id)                AS sale_count,
         COALESCE(SUM(ms.total_amount),0) AS total_sold
       FROM companies c
       LEFT JOIN milk_sales ms ON ms.company_id = c.id
       WHERE c.is_active = TRUE
       GROUP BY c.id ORDER BY c.name`
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.post('/companies', adminOnly,
  [body('name').trim().notEmpty().isLength({ max: 150 })],
  validate,
  async (req, res, next) => {
    try {
      const { name, contact_name, phone, address, gstin } = req.body;
      const [result] = await db.query(
        'INSERT INTO companies (name, contact_name, phone, address, gstin, created_by) VALUES (?,?,?,?,?,?)',
        [name, contact_name || null, phone || null, address || null, gstin || null, req.user.id]
      );
      res.status(201).json({ success: true, message: 'Company added.', data: { id: result?.id } });
    } catch (err) { next(err); }
  }
);

router.put('/companies/:id', adminOnly,
  [body('name').trim().notEmpty()],
  validate,
  async (req, res, next) => {
    try {
      const { name, contact_name, phone, address, gstin } = req.body;
      await db.query(
        'UPDATE companies SET name=?, contact_name=?, phone=?, address=?, gstin=? WHERE id=?',
        [name, contact_name || null, phone || null, address || null, gstin || null, req.params.id]
      );
      res.json({ success: true, message: 'Company updated.' });
    } catch (err) { next(err); }
  }
);

// ── Contracts ──────────────────────────────────────────────

router.get('/contracts', async (req, res, next) => {
  try {
    const { company_id } = req.query;
    let sql = `SELECT sc.*, c.name AS company_name FROM sales_contracts sc
               JOIN companies c ON c.id = sc.company_id WHERE 1=1`;
    const params = [];
    if (company_id) { sql += ' AND sc.company_id = ?'; params.push(company_id); }
    sql += ' ORDER BY sc.start_date DESC';
    const [rows] = await db.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.post('/contracts', adminOnly,
  [
    body('company_id').isInt({ min: 1 }),
    body('rate_per_liter').isFloat({ min: 0 }),
    body('start_date').isDate(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { company_id, contract_ref, rate_per_liter, min_quantity, start_date, end_date, notes } = req.body;
      const [result] = await db.query(`INSERT INTO sales_contracts
           (company_id, contract_ref, rate_per_liter, min_quantity, start_date, end_date, notes, created_by)
         VALUES (?,?,?,?,?,?,?,?)`,
        [company_id, contract_ref || null, rate_per_liter, min_quantity || null,
         start_date, end_date || null, notes || null, req.user.id]
      );
      res.status(201).json({ success: true, message: 'Contract created.', data: { id: result?.id } });
    } catch (err) { next(err); }
  }
);

// ── Milk Sales ─────────────────────────────────────────────

router.get('/sales', async (req, res, next) => {
  try {
    const { company_id, date_from, date_to, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let sql = `
      SELECT ms.*, c.name AS company_name, sc.contract_ref
      FROM milk_sales ms
      JOIN companies c ON c.id = ms.company_id
      JOIN sales_contracts sc ON sc.id = ms.contract_id
      WHERE 1=1`;
    const params = [];

    if (company_id) { sql += ' AND ms.company_id = ?'; params.push(company_id); }
    if (date_from)  { sql += ' AND ms.sale_date >= ?'; params.push(date_from); }
    if (date_to)    { sql += ' AND ms.sale_date <= ?'; params.push(date_to); }
    sql += ' ORDER BY ms.sale_date DESC LIMIT ? OFFSET ?';
    params.push(+limit, offset);

    const [rows] = await db.query(sql, params);

    // Aggregates
    const [agg] = await db.query(
      `SELECT COALESCE(SUM(total_amount),0) AS total_revenue,
              COALESCE(SUM(received_amount),0) AS total_received,
              COALESCE(SUM(quantity_liters),0) AS total_liters
       FROM milk_sales WHERE 1=1`
    );

    res.json({ success: true, data: rows, summary: agg[0] });
  } catch (err) { next(err); }
});

router.post('/sales',
  [
    body('contract_id').isInt({ min: 1 }),
    body('sale_date').isDate(),
    body('quantity_liters').isFloat({ min: 0.01 }),
    body('rate_per_liter').isFloat({ min: 0 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const {
        contract_id, sale_date, quantity_liters,
        fat_percentage, snf_percentage, rate_per_liter,
        payment_status, received_amount, notes,
      } = req.body;

      // Get company_id from contract
      const [_cRows] = await db.query(
        'SELECT company_id FROM sales_contracts WHERE id = ? AND status = "active"',
        [contract_id]
      );
      const contract = _cRows[0];
      if (!contract) return res.status(404).json({ success: false, message: 'Active contract not found.' });

      const total_amount = parseFloat((quantity_liters * rate_per_liter).toFixed(2));
      const [result] = await db.query(`INSERT INTO milk_sales
           (contract_id, company_id, sale_date, quantity_liters, fat_percentage, snf_percentage,
            rate_per_liter, total_amount, payment_status, received_amount, notes, recorded_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [contract_id, contract.company_id, sale_date, quantity_liters,
         fat_percentage || null, snf_percentage || null, rate_per_liter, total_amount,
         payment_status || 'pending', received_amount || 0, notes || null, req.user.id]
      );

      res.status(201).json({ success: true, message: 'Sale recorded.', data: { id: result?.id, total_amount } });
    } catch (err) { next(err); }
  }
);

router.patch('/sales/:id/payment', adminOnly,
  [body('received_amount').isFloat({ min: 0 }), body('payment_status').isIn(['pending','received','partial'])],
  validate,
  async (req, res, next) => {
    try {
      const { received_amount, payment_status } = req.body;
      await db.query(
        'UPDATE milk_sales SET received_amount=?, payment_status=? WHERE id=?',
        [received_amount, payment_status, req.params.id]
      );
      res.json({ success: true, message: 'Payment updated.' });
    } catch (err) { next(err); }
  }
);

module.exports = router;
