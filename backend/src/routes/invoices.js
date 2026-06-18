const router = require('express').Router();
const { body } = require('express-validator');
const db = require('../config/db');
const { validate } = require('../middleware/validate');
const { authenticate, adminOnly } = require('../middleware/auth');

router.use(authenticate);

const genNo = async () => {
  const r = await db.queryOne('SELECT COALESCE(MAX(id),0) AS m FROM invoices');
  return `INV-${String(Number(r.m)+1).padStart(6,'0')}`;
};

// GET invoices
router.get('/', async (req, res, next) => {
  try {
    const { status, customer_id, date_from, date_to } = req.query;
    let sql = `SELECT i.*,c.name AS cname FROM invoices i LEFT JOIN customers c ON c.id=i.customer_id WHERE 1=1`;
    const p=[]; let idx=1;
    if (status)      { sql+=` AND i.status=$${idx++}`;          p.push(status); }
    if (customer_id) { sql+=` AND i.customer_id=$${idx++}`;     p.push(customer_id); }
    if (date_from)   { sql+=` AND i.invoice_date>=$${idx++}`;   p.push(date_from); }
    if (date_to)     { sql+=` AND i.invoice_date<=$${idx++}`;   p.push(date_to); }
    sql+=' ORDER BY i.created_at DESC LIMIT 500';
    const [rows] = await db.query(sql,p);
    res.json({success:true,data:rows});
  } catch(err){next(err);}
});

// GET single invoice with items + payments
router.get('/:id', async (req, res, next) => {
  try {
    const inv = await db.queryOne(`SELECT i.*,c.name AS cname,c.phone,c.address FROM invoices i LEFT JOIN customers c ON c.id=i.customer_id WHERE i.id=$1`,[req.params.id]);
    if(!inv) return res.status(404).json({success:false,message:'Not found'});
    const [items]    = await db.query('SELECT * FROM invoice_items WHERE invoice_id=$1',[req.params.id]);
    const [payments] = await db.query('SELECT * FROM payments WHERE invoice_id=$1 ORDER BY payment_date',[req.params.id]);
    res.json({success:true,data:{...inv,items,payments}});
  } catch(err){next(err);}
});

// POST create invoice
router.post('/', adminOnly,
  [body('customer_id').optional(), body('customer_type').notEmpty()],
  validate,
  async (req, res, next) => {
    try {
      const { customer_id,customer_type,customer_name,invoice_date,due_date,period_start,period_end,
              items=[],discount=0,tax_pct=0,notes } = req.body;
      const subtotal = items.reduce((s,i)=>s+parseFloat(i.qty)*parseFloat(i.rate),0);
      const tax_amount = (subtotal-parseFloat(discount))*(parseFloat(tax_pct)/100);
      const total = subtotal - parseFloat(discount) + tax_amount;
      const no = await genNo();
      const [r] = await db.query(
        `INSERT INTO invoices (invoice_no,customer_id,customer_type,customer_name,invoice_date,due_date,period_start,period_end,
          subtotal,discount,tax_pct,tax_amount,total_amount,status,notes,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'unpaid',$14,$15) RETURNING id`,
        [no,customer_id||null,customer_type,customer_name||null,invoice_date,due_date||null,period_start||null,period_end||null,
         subtotal.toFixed(2),discount,tax_pct,tax_amount.toFixed(2),total.toFixed(2),notes||null,req.user.id]
      );
      for(const item of items){
        const amt=parseFloat(item.qty)*parseFloat(item.rate);
        await db.query('INSERT INTO invoice_items (invoice_id,description,qty,unit,rate,amount) VALUES ($1,$2,$3,$4,$5,$6)',
          [r?.insertId,item.description,item.qty,item.unit||'L',item.rate,amt.toFixed(2)]);
      }
      res.status(201).json({success:true,data:{id:r?.id,invoice_no:no,total}});
    } catch(err){next(err);}
  }
);

// PATCH update invoice (discount/tax/notes/status)
router.patch('/:id', adminOnly, async (req, res, next) => {
  try {
    const { discount, tax_pct, notes, status } = req.body;
    const inv = await db.queryOne('SELECT * FROM invoices WHERE id=$1',[req.params.id]);
    if(!inv) return res.status(404).json({success:false,message:'Not found'});
    const d = discount !== undefined ? parseFloat(discount) : parseFloat(inv.discount);
    const t = tax_pct !== undefined ? parseFloat(tax_pct) : parseFloat(inv.tax_pct);
    const taxAmt = (parseFloat(inv.subtotal)-d)*(t/100);
    const total  = parseFloat(inv.subtotal)-d+taxAmt;
    await db.query(
      `UPDATE invoices SET discount=$1,tax_pct=$2,tax_amount=$3,total_amount=$4,notes=COALESCE($5,notes),
       status=COALESCE($6,status),updated_at=NOW() WHERE id=$7`,
      [d,t,taxAmt.toFixed(2),total.toFixed(2),notes||null,status||null,req.params.id]
    );
    res.json({success:true,message:'Invoice updated'});
  } catch(err){next(err);}
});

// POST record payment against invoice
router.post('/:id/payment', adminOnly,
  [body('amount').isFloat({min:0.01}), body('payment_date').isDate()],
  validate,
  async (req, res, next) => {
    try {
      const { amount, payment_date, method='cash', reference, notes } = req.body;
      const inv = await db.queryOne('SELECT * FROM invoices WHERE id=$1',[req.params.id]);
      if(!inv) return res.status(404).json({success:false,message:'Not found'});
      const [r] = await db.query(
        'INSERT INTO payments (invoice_id,customer_id,amount,payment_date,method,reference,notes,recorded_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
        [req.params.id,inv.customer_id,amount,payment_date,method,reference||null,notes||null,req.user.id]
      );
      const newPaid = parseFloat(inv.paid_amount)+parseFloat(amount);
      const newStatus = newPaid>=parseFloat(inv.total_amount)?'paid':newPaid>0?'partial':'unpaid';
      await db.query('UPDATE invoices SET paid_amount=$1,status=$2,updated_at=NOW() WHERE id=$3',[newPaid.toFixed(2),newStatus,req.params.id]);
      // Update customer outstanding
      if(inv.customer_id) {
        await db.query('UPDATE customers SET outstanding=GREATEST(0,outstanding-$1) WHERE id=$2',[amount,inv.customer_id]);
      }
      res.status(201).json({success:true,data:{id:r?.id,new_status:newStatus,paid_amount:newPaid}});
    } catch(err){next(err);}
  }
);

module.exports = router;
