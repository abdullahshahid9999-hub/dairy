const router = require('express').Router();
const db     = require('../config/db');
const { authenticate, adminOnly } = require('../middleware/auth');

router.use(authenticate);

router.get('/', async (_req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT v.*,
         COALESCE((SELECT SUM(amount) FROM vehicle_expenses WHERE vehicle_id=v.id),0) AS total_expenses
       FROM vehicles v ORDER BY v.is_active DESC, v.reg_number`
    );
    res.json({ success:true, data:rows });
  } catch(err){next(err);}
});

router.post('/', adminOnly, async (req, res, next) => {
  try {
    const { reg_number, make_model, use_type='commercial', ownership_type='owned',
            owner_name, owner_phone, monthly_rent,
            capacity_liters, purchase_price, payment_type='full',
            installment_months, installment_paid=0, notes } = req.body;
    if (!reg_number) return res.status(400).json({success:false,message:'Reg number required'});

    // capacity only for commercial
    const cap = use_type === 'commercial' ? capacity_liters||null : null;

    const [r] = await db.query(
      `INSERT INTO vehicles (reg_number,make_model,use_type,ownership_type,owner_name,owner_phone,
         monthly_rent,capacity_liters,purchase_price,payment_type,installment_months,installment_paid,
         notes,is_active,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true,$14) RETURNING id`,
      [reg_number, make_model||null, use_type, ownership_type,
       owner_name||null, owner_phone||null,
       ownership_type==='rented'?monthly_rent||null:null,
       cap, purchase_price||null, payment_type,
       installment_months||null, installment_paid,
       notes||null, req.user.id]
    );
    res.status(201).json({success:true,data:{id:r?.insertId}});
  } catch(err){next(err);}
});

router.put('/:id', adminOnly, async (req, res, next) => {
  try {
    const { reg_number, make_model, use_type, ownership_type,
            owner_name, owner_phone, monthly_rent, capacity_liters,
            purchase_price, payment_type, installment_months, installment_paid, notes } = req.body;
    const cap = use_type === 'commercial' ? capacity_liters||null : null;
    await db.query(
      `UPDATE vehicles SET reg_number=$1,make_model=$2,use_type=$3,ownership_type=$4,
         owner_name=$5,owner_phone=$6,monthly_rent=$7,capacity_liters=$8,
         purchase_price=$9,payment_type=$10,installment_months=$11,installment_paid=$12,notes=$13
       WHERE id=$14`,
      [reg_number,make_model||null,use_type,ownership_type,
       owner_name||null,owner_phone||null,
       ownership_type==='rented'?monthly_rent||null:null,
       cap,purchase_price||null,payment_type,
       installment_months||null,installment_paid||0,notes||null,req.params.id]
    );
    res.json({success:true});
  } catch(err){next(err);}
});

router.patch('/:id/deactivate', adminOnly, async (req,res,next) => {
  try{await db.query('UPDATE vehicles SET is_active=FALSE WHERE id=$1',[req.params.id]);res.json({success:true});}
  catch(err){next(err);}
});

router.get('/:id/expenses', async (req,res,next) => {
  try{
    const [rows]=await db.query('SELECT * FROM vehicle_expenses WHERE vehicle_id=$1 ORDER BY expense_date DESC',[req.params.id]);
    res.json({success:true,data:rows});
  }catch(err){next(err);}
});

router.post('/:id/expenses', async (req,res,next) => {
  try{
    const{expense_type,expense_date,amount,notes}=req.body;
    const[r]=await db.query(
      'INSERT INTO vehicle_expenses (vehicle_id,expense_type,expense_date,amount,notes,recorded_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
      [req.params.id,expense_type,expense_date,amount,notes||null,req.user.id]
    );
    // Auto-add to expenses ledger
    const cat = await db.queryOne(`SELECT id FROM expense_categories WHERE name ILIKE $1 LIMIT 1`,
      [expense_type==='diesel'?'Diesel':expense_type==='service'?'Vehicle Service':'Vehicle Rent']);
    if(cat){
      await db.query('INSERT INTO expenses (category_id,expense_date,amount,description,reference_type,reference_id,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [cat.id,expense_date,amount,`${expense_type}: Vehicle ${req.params.id}`,
         'vehicle',r?.id,req.user.id]);
    }
    res.status(201).json({success:true,data:{id:r?.id}});
  }catch(err){next(err);}
});

module.exports = router;
