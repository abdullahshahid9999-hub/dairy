const router   = require('express').Router();
const { body } = require('express-validator');
const db       = require('../config/db');
const { validate }                    = require('../middleware/validate');
const { authenticate, adminOnly }     = require('../middleware/auth');

router.use(authenticate);

// GET periods
router.get('/periods', async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT bp.*, COUNT(b.id) AS bill_count, COALESCE(SUM(b.net_payable),0) AS total_payable
       FROM billing_periods bp
       LEFT JOIN bills b ON b.billing_period_id = bp.id
       GROUP BY bp.id ORDER BY bp.period_year DESC, bp.period_month DESC`
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// POST create period
router.post('/periods', adminOnly,
  [body('period_month').isInt({ min:1, max:12 }), body('period_year').isInt({ min:2020 })],
  validate,
  async (req, res, next) => {
    try {
      const { period_month, period_year } = req.body;
      const r = await db.queryOne(
        'INSERT INTO billing_periods (period_month, period_year, created_by) VALUES ($1,$2,$3) RETURNING id',
        [period_month, period_year, req.user.id]
      );
      res.status(201).json({ success: true, data: { id: r?.id } });
    } catch (err) { next(err); }
  }
);

// PATCH close period
router.patch('/periods/:id/close', adminOnly, async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `UPDATE billing_periods SET status='closed', closed_at=NOW()
       WHERE id=$1 AND status='open' RETURNING id`,
      [req.params.id]
    );
    if (!rows.length) return res.status(400).json({ success:false, message:'Period already closed or not found.' });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST generate bills for a period
router.post('/generate', adminOnly,
  [body('billing_period_id').isInt({ min:1 })],
  validate,
  async (req, res, next) => {
    try {
      const { billing_period_id } = req.body;
      const period = await db.queryOne(
        `SELECT * FROM billing_periods WHERE id=$1 AND status='open'`,
        [billing_period_id]
      );
      if (!period) return res.status(400).json({ success:false, message:'Period not found or already closed.' });

      const periodStart = `${period.period_year}-${String(period.period_month).padStart(2,'0')}-01`;
      const periodEnd   = new Date(period.period_year, period.period_month, 0).toISOString().slice(0,10);

      const [farmers] = await db.query(
        `SELECT DISTINCT mr.farmer_id, f.name, f.base_rate
         FROM milk_records mr
         JOIN farmers f ON f.id = mr.farmer_id
         WHERE mr.collection_date BETWEEN $1 AND $2`,
        [periodStart, periodEnd]
      );

      const created = [];
      let billSeq = 0;

      for (const farmer of farmers) {
        const existing = await db.queryOne(
          'SELECT id FROM bills WHERE billing_period_id=$1 AND farmer_id=$2',
          [billing_period_id, farmer.farmer_id]
        );
        if (existing) continue;

        const [records] = await db.query(
          `SELECT * FROM milk_records
           WHERE farmer_id=$1 AND collection_date BETWEEN $2 AND $3
           ORDER BY collection_date`,
          [farmer.farmer_id, periodStart, periodEnd]
        );
        if (!records.length) continue;

        const totalLiters = records.reduce((s,r) => s + parseFloat(r.quantity_liters), 0);
        const totalAmount = records.reduce((s,r) => s + parseFloat(r.total_amount || 0), 0);
        const avgFat      = records.reduce((s,r) => s + parseFloat(r.fat_percentage), 0) / records.length;
        const snfRecs     = records.filter(r => r.snf_computed);
        const avgSnf      = snfRecs.length
          ? snfRecs.reduce((s,r) => s + parseFloat(r.snf_computed), 0) / snfRecs.length
          : null;

        // Pending advance deduction (if farmer has linked employee)
        const advRow = await db.queryOne(
          `SELECT COALESCE(SUM(amount - recovered), 0) AS pending
           FROM advance_salary
           WHERE employee_id = (
             SELECT e.id FROM employees e
             JOIN users u ON u.id = e.user_id
             JOIN farmers f ON f.name = e.name
             WHERE f.id = $1 LIMIT 1
           ) AND status != 'recovered'`,
          [farmer.farmer_id]
        ).catch(() => ({ pending: 0 }));

        const advanceDeduction = Math.min(parseFloat(advRow?.pending || 0), totalAmount);

        billSeq++;
        const billNumber = `BILL-${period.period_year}${String(period.period_month).padStart(2,'0')}-${String(billSeq).padStart(4,'0')}`;
        const netPayable = parseFloat((totalAmount - advanceDeduction).toFixed(2));

        const bill = await db.queryOne(
          `INSERT INTO bills
             (bill_number, billing_period_id, farmer_id, total_liters, avg_fat, avg_snf,
              total_amount, advance_deduction, net_payable, generated_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
          [billNumber, billing_period_id, farmer.farmer_id,
           totalLiters.toFixed(2), avgFat.toFixed(2), avgSnf ? avgSnf.toFixed(2) : null,
           totalAmount.toFixed(2), advanceDeduction.toFixed(2), netPayable, req.user.id]
        );

        for (const r of records) {
          await db.query(
            `INSERT INTO bill_line_items
               (bill_id, milk_record_id, collection_date, quantity_liters,
                fat_percentage, snf_percentage, computed_rate, line_amount)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [bill?.id, r.id, r.collection_date, r.quantity_liters,
             r.fat_percentage, r.snf_computed || r.snf_percentage, r.computed_rate, r.total_amount]
          ).catch(() => {});
        }

        created.push({ id: bill?.id, bill_number: billNumber, farmer: farmer.name, net_payable: netPayable });
      }

      res.json({ success: true, message: `${created.length} bill(s) generated.`, data: created });
    } catch (err) { next(err); }
  }
);

// GET bills list
router.get('/bills', async (req, res, next) => {
  try {
    const { period_id, farmer_id, status } = req.query;
    const params = []; let pi = 1;
    let sql = `SELECT b.*, f.name AS farmer_name, f.farmer_code, bp.period_month, bp.period_year
               FROM bills b
               JOIN farmers f ON f.id = b.farmer_id
               JOIN billing_periods bp ON bp.id = b.billing_period_id
               WHERE 1=1`;
    if (period_id) { sql += ` AND b.billing_period_id=$${pi++}`; params.push(period_id); }
    if (farmer_id) { sql += ` AND b.farmer_id=$${pi++}`;         params.push(farmer_id); }
    if (status)    { sql += ` AND b.status=$${pi++}`;            params.push(status); }
    sql += ' ORDER BY bp.period_year DESC, bp.period_month DESC, f.name';
    const [rows] = await db.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// GET single bill with line items
router.get('/bills/:id', async (req, res, next) => {
  try {
    const bill = await db.queryOne(
      `SELECT b.*, f.name AS farmer_name, f.farmer_code, f.phone, f.bank_name, f.bank_account,
              bp.period_month, bp.period_year
       FROM bills b
       JOIN farmers f ON f.id = b.farmer_id
       JOIN billing_periods bp ON bp.id = b.billing_period_id
       WHERE b.id=$1`,
      [req.params.id]
    );
    if (!bill) return res.status(404).json({ success:false, message:'Bill not found.' });
    const [lineItems] = await db.query(
      'SELECT * FROM bill_line_items WHERE bill_id=$1 ORDER BY collection_date',
      [req.params.id]
    );
    res.json({ success: true, data: { ...bill, line_items: lineItems } });
  } catch (err) { next(err); }
});

// PATCH mark bill paid
router.patch('/bills/:id/pay', adminOnly, async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `UPDATE bills SET status='paid', paid_at=NOW()
       WHERE id=$1 AND status='generated' RETURNING id`,
      [req.params.id]
    );
    if (!rows.length) return res.status(400).json({ success:false, message:'Bill not found or already paid.' });
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
