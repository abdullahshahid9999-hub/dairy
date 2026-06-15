const router = require('express').Router();
const db     = require('../config/db');
const { authenticate, adminOnly } = require('../middleware/auth');

router.use(authenticate);

router.get('/', async (_req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT s.*,
         COALESCE((SELECT SUM(amount) FROM shop_rent_payments WHERE shop_id=s.id),0) AS total_paid
       FROM shops s ORDER BY s.is_active DESC, s.shop_name`
    );
    res.json({ success:true, data:rows });
  } catch(err){next(err);}
});

router.post('/', adminOnly, async (req, res, next) => {
  try {
    const { shop_name, location, ownership_type='owned',
            owner_name, owner_phone, monthly_rent, rent_due_day } = req.body;
    if (!shop_name) return res.status(400).json({success:false,message:'Shop name required'});
    const [r] = await db.query(
      `INSERT INTO shops (shop_name,location,ownership_type,owner_name,owner_phone,
         monthly_rent,rent_due_day,is_active,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8) RETURNING id`,
      [shop_name, location||null, ownership_type,
       ownership_type==='rented'?owner_name||null:null,
       ownership_type==='rented'?owner_phone||null:null,
       ownership_type==='rented'?monthly_rent||null:null,
       ownership_type==='rented'?rent_due_day||null:null,
       req.user.id]
    );
    res.status(201).json({success:true,data:{id:r?.id}});
  } catch(err){next(err);}
});

router.put('/:id', adminOnly, async (req, res, next) => {
  try {
    const { shop_name, location, ownership_type, owner_name, owner_phone, monthly_rent, rent_due_day } = req.body;
    await db.query(
      `UPDATE shops SET shop_name=$1,location=$2,ownership_type=$3,owner_name=$4,
         owner_phone=$5,monthly_rent=$6,rent_due_day=$7 WHERE id=$8`,
      [shop_name, location||null, ownership_type,
       ownership_type==='rented'?owner_name||null:null,
       ownership_type==='rented'?owner_phone||null:null,
       ownership_type==='rented'?monthly_rent||null:null,
       ownership_type==='rented'?rent_due_day||null:null,
       req.params.id]
    );
    res.json({success:true});
  } catch(err){next(err);}
});

// GET shop available milk stock
router.get('/:id/stock', async (req, res, next) => {
  try {
    const row = await db.queryOne(
      `SELECT GREATEST(0,
         COALESCE((SELECT SUM(quantity_liters) FROM milk_records WHERE shop_id=$1),0)
       - COALESCE((SELECT SUM(milk_qty) FROM receipts WHERE shop_id=$1 AND milk_qty > 0),0)
       ) AS available`,
      [req.params.id]
    );
    res.json({ success:true, available: parseFloat(row?.available || 0) });
  } catch(err){next(err);}
});

router.patch('/:id/rent', adminOnly, async (req, res, next) => {
  try {
    const { paid_for, paid_date, amount } = req.body;
    if (!paid_for || !amount) return res.status(400).json({success:false,message:'paid_for and amount required'});
    const [r] = await db.query(
      'INSERT INTO shop_rent_payments (shop_id,paid_for,paid_date,amount,recorded_by) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [req.params.id, paid_for, paid_date||new Date().toISOString().slice(0,10), amount, req.user.id]
    );
    // Auto-add to expenses
    const cat = await db.queryOne("SELECT id FROM expense_categories WHERE name='Shop Rent' LIMIT 1");
    if (cat) {
      await db.query(
        'INSERT INTO expenses (category_id,expense_date,amount,description,reference_type,reference_id,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [cat.id, paid_date||new Date().toISOString().slice(0,10), amount,
         `Shop rent: ${paid_for}`, 'shop', req.params.id, req.user.id]
      );
    }
    res.status(201).json({success:true,data:{id:r?.id}});
  } catch(err){next(err);}
});

router.get('/:id/rent-history', async (req, res, next) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM shop_rent_payments WHERE shop_id=$1 ORDER BY paid_date DESC',
      [req.params.id]
    );
    res.json({success:true,data:rows});
  } catch(err){next(err);}
});

router.patch('/:id/deactivate', adminOnly, async (req,res,next) => {
  try{await db.query('UPDATE shops SET is_active=FALSE WHERE id=$1',[req.params.id]);res.json({success:true});}
  catch(err){next(err);}
});

module.exports = router;
