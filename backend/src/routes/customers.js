const router = require('express').Router();
const { body } = require('express-validator');
const db = require('../config/db');
const { validate } = require('../middleware/validate');
const { authenticate, adminOnly } = require('../middleware/auth');
const { computeTS, getPricingConfig } = require('../utils/pricingEngine');

router.use(authenticate);

// ── GET all customers ────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { type, search='' } = req.query;
    let sql = `SELECT c.*,
      COALESCE((SELECT SUM(total_amount) FROM receipts WHERE customer_id=c.id),0) AS total_billed,
      COALESCE((SELECT SUM(amount) FROM bulk_ledger WHERE customer_id=c.id),0) AS bulk_outstanding
      FROM customers c
      WHERE c.is_active=TRUE AND (c.name ILIKE $1 OR c.phone ILIKE $1)`;
    const p = [`%${search}%`];
    if (type) { sql += ' AND c.customer_type=$2'; p.push(type); }
    sql += ' ORDER BY c.name';
    const [rows] = await db.query(sql, p);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// ── POST add customer ────────────────────────────────────────
router.post('/', adminOnly,
  [body('name').trim().notEmpty(), body('customer_type').equals('bulk')],
  validate,
  async (req, res, next) => {
    try {
      const { name, phone, address, customer_type, company_name, cnic,
              daily_qty, rate_per_liter, credit_limit, payment_terms } = req.body;
      if (phone) {
        const ex = await db.queryOne('SELECT id,name FROM customers WHERE phone=$1', [phone]);
        if (ex) return res.status(409).json({ success:false, message:`Phone already used by: ${ex.name}` });
      }
      const maxRow = await db.queryOne('SELECT COALESCE(MAX(id),0) AS m FROM customers');
      const code = `CUS-${String(Number(maxRow.m)+1).padStart(4,'0')}`;
      const r = await db.queryOne(
        `INSERT INTO customers (customer_code,name,phone,address,customer_type,company_name,cnic,
          daily_qty,rate_per_liter,credit_limit,payment_terms,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
        [code,name,phone||null,address||null,customer_type,company_name||null,cnic||null,
         daily_qty||0,rate_per_liter||0,credit_limit||0,payment_terms||'monthly',req.user.id]
      );
      res.status(201).json({ success:true, data:{ id:r?.id, code } });
    } catch (err) { next(err); }
  }
);

// ── GET customer detail ──────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const c = await db.queryOne('SELECT * FROM customers WHERE id=$1', [req.params.id]);
    if (!c) return res.status(404).json({ success:false, message:'Not found' });
    const [receipts] = await db.query('SELECT * FROM receipts WHERE customer_id=$1 ORDER BY receipt_date DESC LIMIT 30', [req.params.id]);
    const [ledger]   = await db.query('SELECT * FROM bulk_ledger WHERE customer_id=$1 ORDER BY entry_date DESC LIMIT 50', [req.params.id]);
    res.json({ success:true, data:{ ...c, receipts, ledger } });
  } catch (err) { next(err); }
});

// ── BULK: record delivery to ledger (FAT/LR-based TS pricing) ──
router.post('/:id/bulk-entry',
  [
    body('qty_liters').isFloat({ min: 0.1 }),
    body('entry_date').isDate(),
    body('fat_percentage').optional().isFloat({ min: 0 }),
    body('lr').optional().isFloat({ min: 0 }),
    body('rate').optional().isFloat({ min: 0 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      // Admin always allowed; staff need bulk_access perm
      const userPerms = req.user.perms || [];
      if (req.user.role !== 'admin' && !userPerms.includes('*') && !userPerms.includes('bulk_access')) {
        return res.status(403).json({ success:false, message:'Bulk deal access not granted. Contact admin.' });
      }
      const { qty_liters, entry_date, notes, fat_percentage, lr } = req.body;

      const customer = await db.queryOne('SELECT rate_per_liter, customer_type FROM customers WHERE id=$1', [req.params.id]);
      if (!customer) return res.status(404).json({ success:false, message:'Customer not found' });
      if (customer.customer_type !== 'bulk') return res.status(400).json({ success:false, message:'Not a bulk customer' });

      let insertCols, insertVals, amount;

      if (fat_percentage != null && lr != null) {
        // FAT/LR-based standardised pricing — same formula as farmer purchase,
        // using this customer's own rate_per_liter as the base_rate.
        const globalCfg = await getPricingConfig().catch(() => ({}));
        const cfg = { ...globalCfg, base_rate: customer.rate_per_liter };
        const result = computeTS({ cfg, fat: fat_percentage, lr, weight: qty_liters });
        amount = result.total_payout;

        await db.query(
          `INSERT INTO bulk_ledger
             (customer_id, entry_date, qty_liters, rate, amount, notes, recorded_by,
              fat_percentage, lr, ts, snf_computed, sp_gravity, milk_kg, standardised_ts)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [req.params.id, entry_date, qty_liters, result.rate_per_unit, amount.toFixed(2), notes || null, req.user.id,
           fat_percentage, lr, result.ts, result.snf_computed, result.sp_gravity, result.milk_kg, result.standardised_ts]
        );

        await db.query('UPDATE customers SET outstanding=outstanding+$1 WHERE id=$2', [amount, req.params.id]);
        return res.status(201).json({ success:true, data:{ amount, ...result } });
      }

      // Legacy fallback: flat qty x manual rate (no FAT/LR given)
      const { rate } = req.body;
      if (rate == null) return res.status(400).json({ success:false, message:'Provide fat_percentage+lr, or a flat rate.' });
      amount = parseFloat(qty_liters) * parseFloat(rate);
      await db.query(
        'INSERT INTO bulk_ledger (customer_id,entry_date,qty_liters,rate,amount,notes,recorded_by) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [req.params.id, entry_date, qty_liters, rate, amount.toFixed(2), notes||null, req.user.id]
      );
      await db.query('UPDATE customers SET outstanding=outstanding+$1 WHERE id=$2', [amount, req.params.id]);
      res.status(201).json({ success:true, data:{ amount } });
    } catch (err) { next(err); }
  }
);

// ── BULK: live rate preview (no save) ───────────────────────
router.post('/bulk/preview-rate', async (req, res, next) => {
  try {
    const { fat_percentage, lr, qty_liters, customer_id } = req.body;
    if (fat_percentage == null || lr == null || !qty_liters || !customer_id)
      return res.status(400).json({ success:false, message:'fat_percentage, lr, qty_liters, customer_id required.' });

    const customer = await db.queryOne('SELECT rate_per_liter FROM customers WHERE id=$1', [customer_id]);
    if (!customer) return res.status(404).json({ success:false, message:'Customer not found' });

    const globalCfg = await getPricingConfig().catch(() => ({}));
    const cfg = { ...globalCfg, base_rate: customer.rate_per_liter };
    const result = computeTS({ cfg, fat: fat_percentage, lr, weight: qty_liters });

    res.json({ success:true, data: result });
  } catch (err) { next(err); }
});

// ── BULK: generate bill ──────────────────────────────────────
router.post('/:id/bulk-bill', adminOnly, async (req, res, next) => {
  try {
    const { date_from, date_to, notes } = req.body;
    const [entries] = await db.query(
      'SELECT * FROM bulk_ledger WHERE customer_id=$1 AND entry_date BETWEEN $2 AND $3',
      [req.params.id, date_from, date_to]
    );
    if (!entries.length) return res.status(400).json({ success:false, message:'No entries in date range' });
    const total = entries.reduce((s,e)=>s+parseFloat(e.amount),0);
    const seq   = await db.queryOne('SELECT COALESCE(MAX(id),0) AS m FROM receipts');
    const no    = `REC-${String(Number(seq.m)+1).padStart(6,'0')}`;
    const [r]   = await db.query(
      `INSERT INTO receipts (receipt_no,customer_id,customer_type,receipt_date,period_start,period_end,
        milk_qty,milk_amount,total_amount,status,notes,created_by)
       VALUES ($1,$2,'bulk',CURRENT_DATE,$3,$4,$5,$6,$7,'pending',$8,$9) RETURNING id`,
      [no,req.params.id,date_from,date_to,
       entries.reduce((s,e)=>s+parseFloat(e.qty_liters),0).toFixed(2),
       total.toFixed(2),total.toFixed(2),notes||null,req.user.id]
    );
    res.status(201).json({ success:true, data:{ receipt_id:r?.id, receipt_no:no, total } });
  } catch (err) { next(err); }
});

// GET receipts list — filterable by date
router.get('/receipts', async (req, res, next) => {
  try {
    const { date_from, date_to, limit=100 } = req.query;
    const params = []; let pi = 1;
    const conds = ['1=1'];
    if (date_from) { conds.push(`receipt_date >= $${pi++}`); params.push(date_from); }
    if (date_to)   { conds.push(`receipt_date <= $${pi++}`); params.push(date_to); }
    params.push(parseInt(limit));
    const [rows] = await db.query(
      `SELECT id,receipt_no,customer_type,receipt_date,milk_qty,milk_amount,total_amount,paid_amount,status
       FROM receipts WHERE ${conds.join(' AND ')} ORDER BY receipt_date DESC, id DESC LIMIT $${pi}`,
      params
    );
    res.json({ success:true, data:rows });
  } catch(err){next(err);}
});

// GET sales summary KPIs — for sales staff dashboard
router.get('/sales-summary', async (req, res, next) => {
  try {
    const { date_from, date_to } = req.query;
    const params = [date_from, date_to];

    const row = await db.queryOne(
      `SELECT COALESCE(SUM(amount),0)      AS total_revenue,
              COALESCE(SUM(qty_liters),0)  AS sold_liters,
              COUNT(*)                      AS total_receipts
       FROM bulk_ledger WHERE entry_date BETWEEN $1 AND $2`,
      params
    );
    const paid = await db.queryOne(
      `SELECT COALESCE(SUM(paid_amount),0) AS received FROM receipts WHERE receipt_date BETWEEN $1 AND $2`,
      params
    );

    res.json({ success:true, data:{ ...row, received: paid?.received || 0 } });
  } catch(err){next(err);}
});

router.patch('/:id/receipts/:rid/pay', adminOnly, async (req, res, next) => {
  try {
    await db.query("UPDATE receipts SET status='paid',paid_amount=total_amount WHERE id=$1", [req.params.rid]);
    await db.query('UPDATE customers SET outstanding=GREATEST(0,outstanding-(SELECT total_amount FROM receipts WHERE id=$1)) WHERE id=$2',
      [req.params.rid, req.params.id]);
    res.json({ success:true });
  } catch (err) { next(err); }
});

// ── Summary stats ────────────────────────────────────────────
router.get('/stats/summary', async (_req, res, next) => {
  try {
    const today = new Date().toISOString().slice(0,10);
    const [todaySales] = await db.query(
      "SELECT customer_type, COUNT(*) AS cnt, SUM(total_amount) AS total FROM receipts WHERE receipt_date=$1 GROUP BY customer_type",
      [today]
    );
    const [monthSales] = await db.query(
      `SELECT TO_CHAR(receipt_date,'YYYY-MM') AS month, SUM(total_amount) AS total
       FROM receipts WHERE receipt_date >= CURRENT_DATE - INTERVAL '6 months'
       GROUP BY TO_CHAR(receipt_date,'YYYY-MM') ORDER BY month`
    );
    const outstanding = await db.queryOne(
      "SELECT COALESCE(SUM(outstanding),0) AS total FROM customers WHERE customer_type='bulk'"
    );
    res.json({ success:true, data:{ todaySales, monthSales, bulkOutstanding: outstanding.total } });
  } catch (err) { next(err); }
});

module.exports = router;
