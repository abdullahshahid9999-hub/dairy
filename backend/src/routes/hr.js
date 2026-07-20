const router   = require('express').Router();
const { body } = require('express-validator');
const bcrypt   = require('bcryptjs');
const db       = require('../config/db');
const { validate }              = require('../middleware/validate');
const { authenticate, adminOnly } = require('../middleware/auth');

// POST /hr/migrate — force run auto-migration (admin only)
router.post('/migrate', authenticate, adminOnly, async (req, res) => {
  const { pool } = db;
  const steps = [
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS department  VARCHAR(50)  DEFAULT 'sales'`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB        DEFAULT '[]'::jsonb`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS shop_id     BIGINT       REFERENCES shops(id) ON DELETE SET NULL`,
    `ALTER TABLE employees ADD COLUMN IF NOT EXISTS shop_id BIGINT REFERENCES shops(id) ON DELETE SET NULL`,
    `CREATE INDEX IF NOT EXISTS idx_employees_shop ON employees(shop_id)`,
  ];
  const results = [];
  for (const sql of steps) {
    try { await pool.query(sql); results.push({ ok: true, sql: sql.slice(0, 60) }); }
    catch (e) { results.push({ ok: false, sql: sql.slice(0, 60), err: e.message }); }
  }
  res.json({ success: true, results });
});

// All routes below require admin auth
router.use(authenticate, adminOnly);

const DEPTS = ['sales','purchase'];
const DEPT_PERMS = {
  sales:    ['sales','customers','dashboard'],
  purchase: ['milk','customers_view','dashboard'],
};

router.get('/departments', (_,res) => res.json({ success:true, data:DEPTS, perms:DEPT_PERMS }));

// GET all employees including fired (for showFired toggle)
router.get('/employees/all', async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT e.*,u.email,u.is_active AS user_active,u.department AS user_dept,u.permissions AS extra_perms,
              s.shop_name,
         COALESCE((SELECT SUM(amount-recovered) FROM advance_salary WHERE employee_id=e.id AND status!='recovered'),0) AS pending_advance
       FROM employees e
       LEFT JOIN users u ON u.id=e.user_id
       LEFT JOIN shops s ON s.id=e.shop_id
       ORDER BY e.is_active DESC,e.name`
    );
    res.json({ success:true, data:rows });
  } catch(err){next(err);}
});

// GET employees
router.get('/employees', async (req, res, next) => {
  try {
    const all = req.query.all === '1';
    const where = all ? '' : 'WHERE e.is_active=TRUE';
    const [rows] = await db.query(
      `SELECT e.*,u.email,u.is_active AS user_active,u.department AS user_dept,u.permissions AS extra_perms,
              s.shop_name,
         COALESCE((SELECT SUM(amount-recovered) FROM advance_salary WHERE employee_id=e.id AND status!='recovered'),0) AS pending_advance
       FROM employees e
       LEFT JOIN users u ON u.id=e.user_id
       LEFT JOIN shops s ON s.id=e.shop_id
       ${where} ORDER BY e.is_active DESC,e.name`
    );
    res.json({ success:true, data:rows });
  } catch(err){next(err);}
});

// POST add employee
router.post('/employees',
  [body('name').trim().notEmpty(), body('base_salary').isFloat({min:0})],
  validate,
  async (req, res, next) => {
    try {
      const { name, phone, address, designation, department='sales', base_salary, join_date, email, password, shop_id } = req.body;
      if (!['sales','purchase'].includes(department)) {
        return res.status(400).json({ success:false, message:'Department must be sales or purchase' });
      }
      if (email && !password) return res.status(400).json({ success:false, message:'Password is required when setting up portal access' });
      if (email && password && password.length < 8) return res.status(400).json({ success:false, message:'Password must be at least 8 characters' });

      // Auto-assign permissions based on department
      const autoPerms = DEPT_PERMS[department] || [];

      const m = await db.queryOne('SELECT COALESCE(MAX(id),0) AS m FROM employees');
      const emp_code = `EMP-${String(Number(m.m)+1).padStart(4,'0')}`;

      let user_id = null;
      if (email && password) {
        const ex = await db.queryOne('SELECT id FROM users WHERE email=$1', [email]);
        if (ex) return res.status(409).json({ success:false, message:'Email already in use' });
        const hash = await bcrypt.hash(password, 12);
        // Try with shop_id column, fallback without if column doesn't exist yet
        let newUser;
        try {
          newUser = await db.queryOne(
            `INSERT INTO users (name,email,password_hash,role,is_active,email_verified,department,permissions,shop_id)
             VALUES ($1,$2,$3,'staff',true,true,$4,$5,$6) RETURNING id`,
            [name, email, hash, department, JSON.stringify(autoPerms), shop_id || null]
          );
        } catch(colErr) {
          // shop_id column might not exist — insert without it
          newUser = await db.queryOne(
            `INSERT INTO users (name,email,password_hash,role,is_active,email_verified,department,permissions)
             VALUES ($1,$2,$3,'staff',true,true,$4,$5) RETURNING id`,
            [name, email, hash, department, JSON.stringify(autoPerms)]
          );
        }
        user_id = newUser?.id || null;
      }

      let newEmp;
      try {
        newEmp = await db.queryOne(
          `INSERT INTO employees (emp_code,name,phone,address,designation,department,base_salary,join_date,shop_id,user_id,created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
          [emp_code, name, phone||null, address||null, designation||null, department, base_salary, join_date||null, shop_id||null, user_id, req.user.id]
        );
      } catch(colErr) {
        // shop_id column might not exist yet
        newEmp = await db.queryOne(
          `INSERT INTO employees (emp_code,name,phone,address,designation,department,base_salary,join_date,user_id,created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
          [emp_code, name, phone||null, address||null, designation||null, department, base_salary, join_date||null, user_id, req.user.id]
        );
      }
      res.status(201).json({ success:true, data:{ id:newEmp?.id, emp_code, user_id } });
    } catch(err){next(err);}
  }
);

// PUT update employee
router.put('/employees/:id', async (req, res, next) => {
  try {
    const {name, phone, designation, department, base_salary, shop_id} = req.body;
    const autoPerms = DEPT_PERMS[department] || [];
    await db.query(
      'UPDATE employees SET name=$1,phone=$2,designation=$3,department=$4,base_salary=$5,shop_id=$6 WHERE id=$7',
      [name, phone||null, designation||null, department, base_salary, shop_id||null, req.params.id]
    );
    // Sync permissions and shop when department/shop changes
    await db.query(
      'UPDATE users SET department=$1,permissions=$2,shop_id=$3 WHERE id=(SELECT user_id FROM employees WHERE id=$4)',
      [department, JSON.stringify(autoPerms), shop_id||null, req.params.id]
    );
    res.json({success:true});
  } catch(err){next(err);}
});

// PATCH fire
router.patch('/employees/:id/fire', async (req,res,next) => {
  try {
    await db.query('UPDATE employees SET is_active=FALSE WHERE id=$1',[req.params.id]);
    await db.query('UPDATE users SET is_active=FALSE WHERE id=(SELECT user_id FROM employees WHERE id=$1)',[req.params.id]);
    res.json({success:true,message:'Employee deactivated'});
  } catch(err){next(err);}
});

router.patch('/employees/:id/activate', async (req,res,next) => {
  try {
    await db.query('UPDATE employees SET is_active=TRUE WHERE id=$1',[req.params.id]);
    await db.query('UPDATE users SET is_active=TRUE WHERE id=(SELECT user_id FROM employees WHERE id=$1)',[req.params.id]);
    res.json({success:true,message:'Reactivated'});
  } catch(err){next(err);}
});

// Advances
router.get('/employees/:id/advances', async (req,res,next) => {
  try {
    const [rows] = await db.query('SELECT * FROM advance_salary WHERE employee_id=$1 ORDER BY advance_date DESC',[req.params.id]);
    res.json({success:true,data:rows});
  } catch(err){next(err);}
});

router.post('/employees/:id/advances',
  [body('amount').isFloat({min:1}), body('advance_date').isDate()],
  validate,
  async (req,res,next) => {
    try {
      const {amount,advance_date,notes} = req.body;
      const advRow = await db.queryOne(
        'INSERT INTO advance_salary (employee_id,amount,advance_date,notes,created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id',
        [req.params.id,amount,advance_date,notes||null,req.user.id]
      );
      res.status(201).json({success:true,data:{id:advRow?.id}});
    } catch(err){next(err);}
  }
);

// POST advance return (employee returns money)
router.post('/employees/:id/advance-return',
  [body('amount').isFloat({min:1}), body('return_date').isDate()],
  validate,
  async (req,res,next) => {
    try {
      const {amount,return_date,notes} = req.body;
      // Apply to oldest pending advances
      await db.query(
        'INSERT INTO advance_returns (employee_id,amount,return_date,notes,recorded_by) VALUES ($1,$2,$3,$4,$5)',
        [req.params.id,amount,return_date,notes||null,req.user.id]
      );
      // Update advance_salary records
      const [advs] = await db.query(
        "SELECT id,amount,recovered FROM advance_salary WHERE employee_id=$1 AND status!='recovered' ORDER BY advance_date",
        [req.params.id]
      );
      let rem = parseFloat(amount);
      for (const adv of advs) {
        if (rem<=0) break;
        const bal = parseFloat(adv.amount)-parseFloat(adv.recovered);
        const apply = Math.min(bal,rem);
        const newRec = parseFloat(adv.recovered)+apply;
        const stat = newRec>=parseFloat(adv.amount)?'recovered':'partial';
        await db.query('UPDATE advance_salary SET recovered=$1,status=$2 WHERE id=$3',[newRec.toFixed(2),stat,adv.id]);
        rem-=apply;
      }
      res.status(201).json({success:true,message:'Advance return recorded'});
    } catch(err){next(err);}
  }
);

// POST salary adjustment (bonus / deduction)
router.post('/employees/:id/adjustment',
  [body('type').isIn(['bonus','deduction']), body('amount').isFloat({min:1}), body('apply_month').matches(/^\d{4}-\d{2}$/)],
  validate,
  async (req,res,next) => {
    try {
      const {type,amount,reason,apply_month} = req.body;
      await db.query(
        'INSERT INTO salary_adjustments (employee_id,type,amount,reason,apply_month,created_by) VALUES ($1,$2,$3,$4,$5,$6)',
        [req.params.id,type,amount,reason||null,apply_month,req.user.id]
      );
      res.status(201).json({success:true,message:`${type==='bonus'?'Bonus':'Deduction'} recorded for ${apply_month}`});
    } catch(err){next(err);}
  }
);

router.get('/users', async (_,res,next) => {
  try{const[r]=await db.query('SELECT id,name,email,role,department,is_active,created_at FROM users ORDER BY created_at DESC');res.json({success:true,data:r});}
  catch(err){next(err);}
});

module.exports = router;
