// backend/src/routes/reports.js
const router = require('express').Router();
const db     = require('../config/db');
const { authenticate, adminOnly } = require('../middleware/auth');

router.use(authenticate, adminOnly);

// ── P&L Report (month) ────────────────────────────────────────────────────────
router.get('/pl', async (req, res, next) => {
  try {
    const { month } = req.query;
    if (!month || !/^\d{4}-\d{2}$/.test(month))
      return res.status(400).json({ success: false, message: 'month param required (YYYY-MM).' });

    const [yr, mn] = month.split('-');
    const periodStart = `${yr}-${mn}-01`;
    const periodEnd   = new Date(parseInt(yr), parseInt(mn), 0).toISOString().slice(0,10);

    const milk = await db.queryOne(
      `SELECT COALESCE(SUM(quantity_liters),0) AS liters, COALESCE(SUM(total_amount),0) AS cost,
              COALESCE(AVG(fat_percentage),0) AS avg_fat, COUNT(*) AS records
       FROM milk_records WHERE collection_date BETWEEN $1 AND $2`,
      [periodStart, periodEnd]
    );

    const sales = await db.queryOne(
      `SELECT COALESCE(SUM(qty_liters),0) AS liters, COALESCE(SUM(amount),0) AS revenue,
              COUNT(*) AS transactions
       FROM bulk_ledger WHERE entry_date BETWEEN $1 AND $2`,
      [periodStart, periodEnd]
    ).catch(() => ({ liters:0, revenue:0, transactions:0 }));

    const received = await db.queryOne(
      `SELECT COALESCE(SUM(paid_amount),0) AS received
       FROM receipts WHERE receipt_date BETWEEN $1 AND $2`,
      [periodStart, periodEnd]
    ).catch(() => ({ received:0 }));

    const [expBreakdown] = await db.query(
      `SELECT ec.name AS category, COALESCE(SUM(e.amount),0) AS amount
       FROM expense_categories ec
       LEFT JOIN expenses e ON e.category_id = ec.id
         AND e.expense_date BETWEEN $1 AND $2
       GROUP BY ec.id, ec.name`,
      [periodStart, periodEnd]
    );

    const totalExpenses = expBreakdown.reduce((s, r) => s + parseFloat(r.amount), 0);
    const grossProfit   = parseFloat(sales?.revenue || 0) - parseFloat(milk.cost);
    const netProfit     = grossProfit - totalExpenses;

    const [farmerBreakdown] = await db.query(
      `SELECT f.name, f.farmer_code, SUM(mr.quantity_liters) AS liters,
              SUM(mr.total_amount) AS amount, AVG(mr.fat_percentage) AS avg_fat
       FROM milk_records mr JOIN farmers f ON f.id = mr.farmer_id
       WHERE mr.collection_date BETWEEN $1 AND $2
       GROUP BY mr.farmer_id, f.name, f.farmer_code ORDER BY amount DESC`,
      [periodStart, periodEnd]
    );

    const [salesBreakdown] = await db.query(
      `SELECT c.name AS company, SUM(bl.qty_liters) AS liters, SUM(bl.amount) AS revenue
       FROM bulk_ledger bl JOIN customers c ON c.id = bl.customer_id
       WHERE bl.entry_date BETWEEN $1 AND $2
       GROUP BY bl.customer_id, c.name ORDER BY revenue DESC`,
      [periodStart, periodEnd]
    ).catch(() => [[]]);

    res.json({
      success: true,
      data: {
        month,
        period: { from: periodStart, to: periodEnd },
        summary: {
          milk_purchase:  parseFloat(milk.cost).toFixed(2),
          milk_liters:    parseFloat(milk.liters).toFixed(2),
          sales_revenue:  parseFloat(sales.revenue).toFixed(2),
          sales_received: parseFloat(received?.received || 0).toFixed(2),
          sold_liters:    parseFloat(sales.liters).toFixed(2),
          total_expenses: totalExpenses.toFixed(2),
          gross_profit:   grossProfit.toFixed(2),
          net_profit:     netProfit.toFixed(2),
          margin_pct:     sales.revenue > 0
                           ? ((netProfit / parseFloat(sales.revenue)) * 100).toFixed(1)
                           : '0.0',
        },
        expense_breakdown: expBreakdown,
        farmer_breakdown:  farmerBreakdown,
        sales_breakdown:   salesBreakdown,
      },
    });
  } catch (err) { next(err); }
});

module.exports = router;
