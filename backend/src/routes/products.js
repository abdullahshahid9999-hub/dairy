const router = require('express').Router();
const { body } = require('express-validator');
const db = require('../config/db');
const { validate } = require('../middleware/validate');
const { authenticate, adminOnly } = require('../middleware/auth');

router.use(authenticate);

router.get('/', async (_req, res, next) => {
  try {
    const [rows] = await db.query('SELECT * FROM products WHERE is_active=TRUE ORDER BY name');
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.post('/', adminOnly,
  [body('name').trim().notEmpty(), body('price').isFloat({min:0}), body('unit_type').isIn(['kg','liter','piece'])],
  validate,
  async (req, res, next) => {
    try {
      const { name, price, unit_type, stock_qty=0 } = req.body;
      const [r] = await db.query(
        'INSERT INTO products (name,price,unit_type,stock_qty,created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id',
        [name, price, unit_type, stock_qty, req.user.id]
      );
      res.status(201).json({ success: true, data: { id: r?.id } });
    } catch (err) { next(err); }
  }
);

router.put('/:id', adminOnly, async (req, res, next) => {
  try {
    const { name, price, unit_type, stock_qty } = req.body;
    await db.query('UPDATE products SET name=$1,price=$2,unit_type=$3,stock_qty=$4 WHERE id=$5',
      [name, price, unit_type, stock_qty, req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.patch('/:id/stock', adminOnly, async (req, res, next) => {
  try {
    const { delta } = req.body; // positive = add stock, negative = reduce
    await db.query('UPDATE products SET stock_qty = GREATEST(0, stock_qty + $1) WHERE id=$2', [delta, req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.delete('/:id', adminOnly, async (req, res, next) => {
  try {
    await db.query('UPDATE products SET is_active=FALSE WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
