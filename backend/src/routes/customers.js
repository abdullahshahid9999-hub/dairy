const router = require('express').Router();
const { body } = require('express-validator');
const db = require('../config/db');
const { validate } = require('../middleware/validate');
const { authenticate, adminOnly } = require('../middleware/auth');

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
  [body('name').trim().notEmpty(), body('customer_type').isIn(['bulk','household','cash','walkin'])],
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
    const [extra]    = await db.query('SELECT * FROM household_extra WHERE customer_id=$1 ORDER BY entry_date DESC LIMIT 30', [req.params.id]);
    res.json({ success:true, data:{ ...c, receipts, ledger, extra } });
  } catch (err) { next(err); }
});

// ── BULK: record delivery to ledger ─────────────────────────
router.post('/:id/bulk-entry',
  [body('qty_liters').isFloat({min:0.1}), body('rate').isFloat({min:0}), body('entry_date').isDate()],
  validate,
  async (req, res, next) => {
    try {
      // Admin always allowed; staff need bulk_access perm
      const userPerms = req.user.perms || [];
      if (req.user.role !== 'admin' && !userPerms.includes('*') && !userPerms.includes('bulk_access')) {
        return res.status(403).json({ success:false, message:'Bulk deal access not granted. Contact admin.' });
      }
      const { qty_liters, rate, entry_date, notes } = req.body;
      const amount = parseFloat(qty_liters) * parseFloat(rate);
      await db.query(
        'INSERT INTO bulk_ledger (customer_id,entry_date,qty_liters,rate,amount,notes,recorded_by) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [req.params.id, entry_date, qty_liters, rate, amount.toFixed(2), notes||null, req.user.id]
      );
      // update outstanding
      await db.query('UPDATE customers SET outstanding=outstanding+$1 WHERE id=$2', [amount, req.params.id]);
      res.status(201).json({ success:true, data:{ amount } });
    } catch (err) { next(err); }
  }
);

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

// ── HOUSEHOLD: add extra milk ────────────────────────────────
router.post('/:id/extra-milk',
  [body('extra_qty').isFloat({min:0.1}), body('entry_date').isDate()],
  validate,
  async (req, res, next) => {
    try {
      const c = await db.queryOne('SELECT rate_per_liter FROM customers WHERE id=$1', [req.params.id]);
      const { extra_qty, entry_date, notes } = req.body;
      const amount = parseFloat(extra_qty) * parseFloat(c.rate_per_liter);
      await db.query(
        'INSERT INTO household_extra (customer_id,entry_date,extra_qty,rate,amount,notes,recorded_by) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [req.params.id, entry_date, extra_qty, c.rate_per_liter, amount.toFixed(2), notes||null, req.user.id]
      );
      res.status(201).json({ success:true, data:{ amount } });
    } catch (err) { next(err); }
  }
);

// ── HOUSEHOLD: generate monthly bill ────────────────────────
router.post('/:id/monthly-bill', adminOnly, async (req, res, next) => {
  try {
    const { year, month } = req.body;
    const c = await db.queryOne('SELECT * FROM customers WHERE id=$1', [req.params.id]);
    if (c.customer_type !== 'household') return res.status(400).json({ success:false, message:'Not a household customer' });
    const daysInMonth = new Date(parseInt(year), parseInt(month), 0).getDate();
    const periodStart = `${year}-${String(month).padStart(2,'0')}-01`;
    const periodEnd   = `${year}-${String(month).padStart(2,'0')}-${daysInMonth}`;
    const baseMilk    = parseFloat(c.daily_qty) * daysInMonth;
    const baseAmount  = baseMilk * parseFloat(c.rate_per_liter);
    const [extras]    = await db.query(
      'SELECT COALESCE(SUM(extra_qty),0) AS eq, COALESCE(SUM(amount),0) AS ea FROM household_extra WHERE customer_id=$1 AND entry_date BETWEEN $2 AND $3',
      [req.params.id, periodStart, periodEnd]
    );
    const totalQty    = baseMilk + parseFloat(extras[0]?.eq||0);
    const totalAmount = baseAmount + parseFloat(extras[0]?.ea||0);
    const seq = await db.queryOne('SELECT COALESCE(MAX(id),0) AS m FROM receipts');
    const no  = `REC-${String(Number(seq.m)+1).padStart(6,'0')}`;
    const r = await db.queryOne(
      `INSERT INTO receipts (receipt_no,customer_id,customer_type,receipt_date,period_start,period_end,
        milk_qty,milk_amount,total_amount,status,notes,created_by)
       VALUES ($1,$2,'household',CURRENT_DATE,$3,$4,$5,$6,$7,'pending',$8,$9) RETURNING id`,
      [no,req.params.id,periodStart,periodEnd,totalQty.toFixed(2),totalAmount.toFixed(2),totalAmount.toFixed(2),
       `Monthly bill: base ${baseMilk}L + extra ${extras[0]?.eq||0}L`,req.user.id]
    );
    // Update outstanding
    await db.query('UPDATE customers SET outstanding=outstanding+$1 WHERE id=$2', [totalAmount, req.params.id]);
    res.status(201).json({ success:true, data:{ receipt_id:r?.id, receipt_no:no, total:totalAmount, qty:totalQty } });
  } catch (err) { next(err); }
});

// ── CASH/WALKIN: record sale + receipt ───────────────────────
router.post('/sale',
  [body('customer_type').isIn(['cash','walkin']), body('milk_qty').optional().isFloat({min:0})],
  validate,
  async (req, res, next) => {
    try {
      const { customer_id, customer_type, sale_date, milk_qty=0, milk_rate=0, items=[], notes, shop_id: bodyShopId } = req.body;
      if (customer_type==='cash' && !customer_id) return res.status(400).json({ success:false, message:'Customer required for cash sale' });

      // Staff always use their assigned shop
      const shop_id = req.user.role === 'admin'
        ? (bodyShopId || null)
        : (req.user.shop_id || bodyShopId || null);

      const milkQtyNum = parseFloat(milk_qty) || 0;

      // ── Stock check — prevent selling more milk than available ──
      if (milkQtyNum > 0) {
        if (shop_id) {
          // Per-shop stock check
          const stockRow = await db.queryOne(
            `SELECT GREATEST(0,
               COALESCE((SELECT SUM(quantity_liters) FROM milk_records WHERE shop_id=$1),0)
             - COALESCE((SELECT SUM(milk_qty) FROM receipts WHERE shop_id=$1 AND milk_qty > 0),0)
             ) AS available_stock`,
            [shop_id]
          );
          const available = parseFloat(stockRow?.available_stock || 0);
          if (milkQtyNum > available) {
            return res.status(400).json({
              success: false,
              message: `Not enough milk in this shop. Available: ${available.toFixed(1)}L, Requested: ${milkQtyNum}L`
            });
          }
        } else {
          // Global stock check (no shop selected)
          const stockRow = await db.queryOne(
            `SELECT GREATEST(0,
               COALESCE((SELECT SUM(quantity_liters) FROM milk_records),0)
             - COALESCE((SELECT SUM(milk_qty) FROM receipts WHERE milk_qty > 0),0)
             ) AS available_stock`
          );
          const available = parseFloat(stockRow?.available_stock || 0);
          if (milkQtyNum > available) {
            return res.status(400).json({
              success: false,
              message: `Not enough milk in stock. Available: ${available.toFixed(1)}L, Requested: ${milkQtyNum}L`
            });
          }
        }
      }

      const milkAmount    = milkQtyNum * parseFloat(milk_rate);
      const productsAmount = items.reduce((s,i)=>s+parseFloat(i.qty)*parseFloat(i.price),0);
      const total         = milkAmount + productsAmount;

      const seq = await db.queryOne('SELECT COALESCE(MAX(id),0) AS m FROM receipts');
      const no  = `REC-${String(Number(seq.m)+1).padStart(6,'0')}`;

      const r = await db.queryOne(
        `INSERT INTO receipts (receipt_no,customer_id,customer_type,receipt_date,milk_qty,milk_amount,
          products_amount,total_amount,paid_amount,status,notes,shop_id,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'paid',$10,$11,$12) RETURNING id`,
        [no,customer_id||null,customer_type,sale_date||new Date().toISOString().slice(0,10),
         milkQtyNum,milkAmount.toFixed(2),productsAmount.toFixed(2),total.toFixed(2),total.toFixed(2),notes||null,shop_id||null,req.user.id]
      );
      const receiptId = r?.id;

      // Insert line items + reduce stock
      for (const item of items) {
        if (receiptId) {
          try {
            await db.query(
              'INSERT INTO receipt_items (receipt_id,product_id,product_name,qty,price,amount) VALUES ($1,$2,$3,$4,$5,$6)',
              [receiptId,item.product_id,item.product_name,item.qty,item.price,(item.qty*item.price).toFixed(2)]
            );
          } catch(e) { console.error('receipt_items insert skipped:', e.message); }
        }
        try {
          await db.query('UPDATE products SET stock_qty=GREATEST(0,stock_qty-$1) WHERE id=$2', [item.qty,item.product_id]);
        } catch(e) {}
      }

      // Auto-create invoice for cash-in
      // Invoice creation — optional, sale completes even if invoices table missing
      let invNo = null, invoiceId = null;
      try {
        const invSeq = await db.queryOne('SELECT COALESCE(MAX(id),0) AS m FROM invoices');
        invNo  = `INV-${String(Number(invSeq?.m||0)+1).padStart(6,'0')}`;
        const invR = await db.queryOne(
          `INSERT INTO invoices (invoice_no,customer_id,customer_type,customer_name,invoice_date,
             subtotal,discount,tax_pct,tax_amount,total_amount,paid_amount,status,notes,created_by)
           VALUES ($1,$2,$3,$4,CURRENT_DATE,$5,0,0,0,$6,$7,'paid',$8,$9) RETURNING id`,
          [invNo, customer_id||null, customer_type,
           customer_id ? (await db.queryOne('SELECT name FROM customers WHERE id=$1',[customer_id]))?.name : 'Walk-in',
           total.toFixed(2), total.toFixed(2), total.toFixed(2),
           notes||null, req.user.id]
        );
        invoiceId = invR?.id;
        if (invoiceId) {
          if (parseFloat(milk_qty)>0) {
            await db.query('INSERT INTO invoice_items (invoice_id,description,qty,unit,rate,amount) VALUES ($1,$2,$3,$4,$5,$6)',
              [invoiceId, 'Milk', milk_qty, 'L', milk_rate, milkAmount.toFixed(2)]);
          }
          for (const item of items) {
            await db.query('INSERT INTO invoice_items (invoice_id,description,qty,unit,rate,amount) VALUES ($1,$2,$3,$4,$5,$6)',
              [invoiceId, item.product_name, item.qty, item.unit||'pcs', item.price, (item.qty*item.price).toFixed(2)]);
          }
        }
      } catch(invErr) {
        console.error('Invoice creation skipped (table may not exist yet):', invErr.message);
      }

      res.status(201).json({ success:true, data:{ receipt_id:receiptId, receipt_no:no, invoice_no:invNo, invoice_id:invoiceId, total } });
    } catch (err) { next(err); }
  }
);

// ── Mark receipt as paid ─────────────────────────────────────
// GET receipts list — filterable by date, shop (for sales staff history)
router.get('/receipts', async (req, res, next) => {
  try {
    const { date_from, date_to, shop_id, limit=100 } = req.query;
    const params = []; let pi = 1;
    const conds = ['1=1'];
    if (date_from) { conds.push(`receipt_date >= $${pi++}`); params.push(date_from); }
    if (date_to)   { conds.push(`receipt_date <= $${pi++}`); params.push(date_to); }
    if (shop_id)   { conds.push(`shop_id = $${pi++}`); params.push(shop_id); }
    // Staff only see their own shop's receipts
    if (req.user.role === 'staff' && req.user.shop_id && !shop_id) {
      conds.push(`shop_id = $${pi++}`); params.push(req.user.shop_id);
    }
    params.push(parseInt(limit));
    const [rows] = await db.query(
      `SELECT id,receipt_no,customer_type,receipt_date,milk_qty,milk_amount,products_amount,total_amount,paid_amount,status,shop_id
       FROM receipts WHERE ${conds.join(' AND ')} ORDER BY receipt_date DESC, id DESC LIMIT $${pi}`,
      params
    );
    res.json({ success:true, data:rows });
  } catch(err){next(err);}
});

// GET sales summary KPIs — for sales staff dashboard
router.get('/sales-summary', async (req, res, next) => {
  try {
    const { date_from, date_to, shop_id } = req.query;
    const effectiveShopId = req.user.role === 'staff' ? req.user.shop_id : (shop_id || null);
    const params = [date_from, date_to]; let pi = 3;
    let shopCond = '';
    if (effectiveShopId) { shopCond = ` AND shop_id = $${pi++}`; params.push(effectiveShopId); }

    const row = await db.queryOne(
      `SELECT COALESCE(SUM(total_amount),0) AS total_revenue,
              COALESCE(SUM(paid_amount),0)  AS received,
              COALESCE(SUM(milk_qty),0)     AS sold_liters,
              COUNT(*)                       AS total_receipts
       FROM receipts WHERE receipt_date BETWEEN $1 AND $2${shopCond}`,
      params
    );

    let shop_stock = 0;
    if (effectiveShopId) {
      const stockRow = await db.queryOne(
        `SELECT GREATEST(0,
           COALESCE((SELECT SUM(quantity_liters) FROM milk_records WHERE shop_id=$1),0)
         - COALESCE((SELECT SUM(milk_qty) FROM receipts WHERE shop_id=$1 AND milk_qty > 0),0)
         ) AS available`,
        [effectiveShopId]
      );
      shop_stock = parseFloat(stockRow?.available || 0);
    }

    res.json({ success:true, data:{ ...row, shop_stock } });
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
