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
    `ALTER TABLE milk_records ADD COLUMN IF NOT EXISTS shop_id BIGINT REFERENCES shops(id) ON DELETE SET NULL`,
    `ALTER TABLE receipts ADD COLUMN IF NOT EXISTS shop_id  BIGINT REFERENCES shops(id) ON DELETE SET NULL`,
    `CREATE INDEX IF NOT EXISTS idx_employees_shop ON employees(shop_id)`,
    `CREATE INDEX IF NOT EXISTS idx_receipts_shop  ON receipts(shop_id)`,
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
  sales:    ['sales','customers','products','dashboard'],
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

// Payroll
router.get('/payroll', async (req,res,next) => {
  try {
    const {month} = req.query;
    let sql = `SELECT p.*,e.name AS employee_name,e.emp_code,e.designation FROM payroll p JOIN employees e ON e.id=p.employee_id WHERE 1=1`;
    const params=[];
    if (month){sql+=' AND p.payroll_month=$1';params.push(month);}
    sql+=' ORDER BY p.payroll_month DESC,e.name';
    const [rows] = await db.query(sql,params);
    res.json({success:true,data:rows});
  } catch(err){next(err);}
});

router.post('/payroll/process',
  [body('payroll_month').matches(/^\d{4}-\d{2}$/)],
  validate,
  async (req,res,next) => {
    try {
      const {payroll_month,allowances_map={}} = req.body;
      const results = await db.transaction(async (conn) => {
        const [emps] = await conn.query('SELECT * FROM employees WHERE is_active=TRUE');
        const processed=[];
        for (const emp of emps) {
          const ex = await conn.queryOne('SELECT id FROM payroll WHERE employee_id=$1 AND payroll_month=$2',[emp.id,payroll_month]);
          if(ex) continue;
          const advRow = await conn.queryOne("SELECT COALESCE(SUM(amount-recovered),0) AS p FROM advance_salary WHERE employee_id=$1 AND status!='recovered'",[emp.id]);
          const pending=parseFloat(advRow?.p||0);
          const allowances=parseFloat(allowances_map[emp.id]||0);
          // Get bonus/deductions for this month
          const [adjs] = await conn.query("SELECT type,amount FROM salary_adjustments WHERE employee_id=$1 AND apply_month=$2 AND applied=FALSE",[emp.id,payroll_month]);
          const bonusTotal = adjs.filter(a=>a.type==='bonus').reduce((s,a)=>s+parseFloat(a.amount),0);
          const dedTotal   = adjs.filter(a=>a.type==='deduction').reduce((s,a)=>s+parseFloat(a.amount),0);
          const advDed=Math.min(pending,parseFloat(emp.base_salary));
          const net=parseFloat(emp.base_salary)+allowances+bonusTotal-dedTotal-advDed;
          const pr = await conn.queryOne(
            `INSERT INTO payroll (employee_id,payroll_month,base_salary,allowances,advance_deduction,net_salary,processed_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
            [emp.id,payroll_month,emp.base_salary,allowances+bonusTotal-dedTotal,advDed.toFixed(2),Math.max(0,net).toFixed(2),req.user.id]
          );
          // Mark adjustments applied
          if(adjs.length>0)
            await conn.query("UPDATE salary_adjustments SET applied=TRUE WHERE employee_id=$1 AND apply_month=$2",[emp.id,payroll_month]);
          // Reduce advances
          if(advDed>0){
            const [advs] = await conn.query("SELECT id,amount,recovered FROM advance_salary WHERE employee_id=$1 AND status!='recovered' ORDER BY advance_date",[emp.id]);
            let rem=advDed;
            for(const adv of advs){
              if(rem<=0) break;
              const bal=parseFloat(adv.amount)-parseFloat(adv.recovered);
              const apply=Math.min(bal,rem);
              const newRec=parseFloat(adv.recovered)+apply;
              const stat=newRec>=parseFloat(adv.amount)?'recovered':'partial';
              await conn.query('UPDATE advance_salary SET recovered=$1,status=$2 WHERE id=$3',[newRec.toFixed(2),stat,adv.id]);
              rem-=apply;
            }
          }
          // Auto expense
          const salCat=await conn.queryOne("SELECT id FROM expense_categories WHERE name='Salaries' LIMIT 1");
          if(salCat){
            const [yr,mn]=payroll_month.split('-');
            await conn.query('INSERT INTO expenses (category_id,expense_date,amount,description,reference_type,reference_id,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)',
              [salCat.id,`${yr}-${mn}-01`,Math.max(0,net).toFixed(2),`Salary: ${emp.name} (${payroll_month})`,'payroll',pr?.id,req.user.id]);
          }
          processed.push({id:pr?.id,employee:emp.name,net_salary:Math.max(0,net).toFixed(2),bonus:bonusTotal,deduction:dedTotal});
        }
        return processed;
      });
      res.json({success:true,message:`${results.length} processed`,data:results});
    } catch(err){next(err);}
  }
);

router.patch('/payroll/:id/pay', async (req,res,next) => {
  try{await db.query("UPDATE payroll SET status='paid',paid_at=NOW() WHERE id=$1",[req.params.id]);res.json({success:true});}
  catch(err){next(err);}
});

router.get('/users', async (_,res,next) => {
  try{const[r]=await db.query('SELECT id,name,email,role,department,is_active,created_at FROM users ORDER BY created_at DESC');res.json({success:true,data:r});}
  catch(err){next(err);}
});

module.exports = router;
