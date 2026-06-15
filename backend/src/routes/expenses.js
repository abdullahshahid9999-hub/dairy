const expRouter = require('express').Router();
const { body }  = require('express-validator');
const db        = require('../config/db');
const { validate }              = require('../middleware/validate');
const { authenticate, adminOnly } = require('../middleware/auth');

expRouter.use(authenticate);

expRouter.get('/categories', async (_req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT ec.*, COALESCE(SUM(e.amount),0) AS total_spent, COUNT(e.id) AS entry_count
       FROM expense_categories ec
       LEFT JOIN expenses e ON e.category_id = ec.id
       GROUP BY ec.id, ec.name, ec.description, ec.created_at ORDER BY ec.name`
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// GET shops for rent auto-fill
expRouter.get('/rent-refs', authenticate, async (_req, res, next) => {
  try {
    const [shops] = await db.query(
      `SELECT id, shop_name AS name, monthly_rent AS amount, 'shop' AS type FROM shops WHERE is_active = TRUE`
    );
    const [vehicles] = await db.query(
      `SELECT id, reg_number AS name, monthly_rent AS amount, 'vehicle' AS type FROM vehicles WHERE is_active = TRUE AND ownership_type = 'rented'`
    );
    res.json({ success: true, data: [...shops, ...vehicles] });
  } catch (err) { next(err); }
});

expRouter.get('/', async (req, res, next) => {
  try {
    const { category_id, date_from, date_to, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let sql = `
      SELECT e.*, ec.name AS category_name, u.name AS created_by_name
      FROM expenses e
      JOIN expense_categories ec ON ec.id = e.category_id
      LEFT JOIN users u ON u.id = e.created_by
      WHERE 1=1`;
    const params = [];
    if (category_id) { sql += ' AND e.category_id = ?'; params.push(category_id); }
    if (date_from)   { sql += ' AND e.expense_date >= ?'; params.push(date_from); }
    if (date_to)     { sql += ' AND e.expense_date <= ?'; params.push(date_to); }
    sql += ' ORDER BY e.expense_date DESC, e.created_at DESC LIMIT ? OFFSET ?';
    params.push(+limit, offset);
    const [rows] = await db.query(sql, params);
    const countRow = await db.queryOne('SELECT COUNT(*) AS total FROM expenses');
    res.json({ success: true, data: rows, pagination: { page: +page, limit: +limit, total: Number(countRow.total) } });
  } catch (err) { next(err); }
});

expRouter.post('/',
  [body('category_id').isInt({ min: 1 }), body('expense_date').isDate(), body('amount').isFloat({ min: 0.01 })],
  validate,
  async (req, res, next) => {
    try {
      const { category_id, expense_date, amount, description, reference_type, reference_id } = req.body;
      const [result] = await db.query(
        'INSERT INTO expenses (category_id,expense_date,amount,description,reference_type,reference_id,created_by) VALUES (?,?,?,?,?,?,?)',
        [category_id, expense_date, amount, description||null, reference_type||null, reference_id||null, req.user.id]
      );
      res.status(201).json({ success: true, message: 'Expense recorded.', data: { id: result?.id } });
    } catch (err) { next(err); }
  }
);

expRouter.delete('/:id', adminOnly, async (req, res, next) => {
  try {
    await db.query('DELETE FROM expenses WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Expense deleted.' });
  } catch (err) { next(err); }
});

expRouter.get('/summary/monthly', async (req, res, next) => {
  try {
    const month = req.query.month || new Date().toISOString().slice(0, 7);
    const [yr, mn] = month.split('-');
    const periodStart = `${yr}-${mn}-01`;
    const periodEnd   = new Date(parseInt(yr), parseInt(mn), 0).toISOString().slice(0,10);
    const [rows] = await db.query(
      `SELECT ec.name AS category, COALESCE(SUM(e.amount),0) AS total
       FROM expense_categories ec
       LEFT JOIN expenses e ON e.category_id = ec.id AND e.expense_date BETWEEN $1 AND $2
       GROUP BY ec.id, ec.name ORDER BY total DESC`,
      [periodStart, periodEnd]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

module.exports = expRouter;
