const express = require('express');
const db      = require('../config/db');
const { authenticate, adminOnly } = require('../middleware/auth');

const pad = n => String(n).padStart(2, '0');
const fmt = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

function getPeriod(tenure, date_from, date_to) {
  const today = new Date();
  if (tenure === 'custom' && date_from && date_to) return { start: date_from, end: date_to };
  const end = fmt(today);
  if (tenure === '7d')  { const s = new Date(today); s.setDate(s.getDate()-6);  return { start: fmt(s), end }; }
  if (tenure === '30d') { const s = new Date(today); s.setDate(s.getDate()-29); return { start: fmt(s), end }; }
  return { start: end, end };
}

// Safe query wrapper — never throws, returns fallback
async function safeQuery(fn, fallback) {
  try { return await fn(); }
  catch (e) { console.error('Dashboard safe query failed:', e.message); return fallback; }
}

// ── Admin Dashboard ───────────────────────────────────────────────────────────
const dashRouter = express.Router();
dashRouter.use(authenticate, adminOnly);

dashRouter.get('/', async (req, res, next) => {
  try {
    const { tenure = '1d', date_from, date_to } = req.query;
    const { start, end } = getPeriod(tenure, date_from, date_to);

    // Check if centre_name column exists
    const centreCheck = await safeQuery(
      () => db.queryOne(`SELECT COUNT(*) AS c FROM information_schema.columns WHERE table_name='farmers' AND column_name='centre_name'`),
      { c: 0 }
    );
    const hasCentre  = parseInt(centreCheck?.c || 0) > 0;
    const centreExpr = hasCentre ? `COALESCE(f.centre_name, f.name)` : `f.name`;

    // Milk purchase KPIs
    const milkStats = await safeQuery(
      () => db.queryOne(
        `SELECT COALESCE(SUM(quantity_liters),0) AS total_liters,
                COALESCE(SUM(total_amount),0) AS purchase_cost,
                COALESCE(AVG(fat_percentage),0) AS avg_fat,
                COUNT(DISTINCT farmer_id) AS active_farmers,
                COUNT(*) AS record_count
         FROM milk_records WHERE collection_date BETWEEN $1 AND $2`,
        [start, end]
      ),
      { total_liters: 0, purchase_cost: 0, avg_fat: 0, active_farmers: 0, record_count: 0 }
    );

    // Sales KPIs — from receipts table (actual cash/walkin/bulk/household sales)
    const salesStats = await safeQuery(
      () => db.queryOne(
        `SELECT COALESCE(SUM(total_amount),0) AS total_revenue,
                COALESCE(SUM(paid_amount),0)  AS received,
                COALESCE(SUM(milk_qty),0)      AS sold_liters
         FROM receipts WHERE receipt_date BETWEEN $1 AND $2`,
        [start, end]
      ),
      { total_revenue: 0, received: 0, sold_liters: 0 }
    );

    // Expenses
    const expStats = await safeQuery(
      () => db.queryOne(
        `SELECT COALESCE(SUM(amount),0) AS total_expenses FROM expenses WHERE expense_date BETWEEN $1 AND $2`,
        [start, end]
      ),
      { total_expenses: 0 }
    );

    // Stock — milk purchased minus milk sold, floored at 0
    const stockRow = await safeQuery(
      () => db.queryOne(
        `SELECT GREATEST(0,
           COALESCE((SELECT SUM(quantity_liters) FROM milk_records WHERE collection_date <= $1),0)
         - COALESCE((SELECT SUM(milk_qty) FROM receipts WHERE receipt_date <= $1 AND milk_qty > 0),0)
         ) AS stock_liters`,
        [end]
      ),
      { stock_liters: 0 }
    );

    // Purchase breakdown
    const purchaseBreakdown = await safeQuery(async () => {
      const [rows] = await db.query(
        `SELECT f.name AS farmer_name, ${centreExpr} AS centre_name, f.farmer_code,
                COALESCE(f.address,'—') AS location,
                SUM(mr.quantity_liters) AS liters,
                COALESCE(SUM(mr.total_amount),0) AS amount,
                AVG(mr.fat_percentage) AS avg_fat,
                COUNT(*) AS records
         FROM milk_records mr JOIN farmers f ON f.id = mr.farmer_id
         WHERE mr.collection_date BETWEEN $1 AND $2
         GROUP BY mr.farmer_id, f.name, ${hasCentre ? 'f.centre_name,' : ''} f.farmer_code, f.address
         ORDER BY liters DESC`,
        [start, end]
      );
      return rows;
    }, []);

    // Top farmers
    const topFarmers = await safeQuery(async () => {
      const [rows] = await db.query(
        `SELECT f.name, ${centreExpr} AS centre_name, f.farmer_code,
                SUM(mr.quantity_liters) AS liters,
                COALESCE(SUM(mr.total_amount),0) AS amount
         FROM milk_records mr JOIN farmers f ON f.id = mr.farmer_id
         WHERE mr.collection_date BETWEEN $1 AND $2
         GROUP BY mr.farmer_id, f.name, ${hasCentre ? 'f.centre_name,' : ''} f.farmer_code
         ORDER BY liters DESC LIMIT 5`,
        [start, end]
      );
      return rows;
    }, []);

    // Monthly trend
    const milkTrend = await safeQuery(async () => {
      const [rows] = await db.query(
        `SELECT TO_CHAR(collection_date,'YYYY-MM') AS month,
                SUM(quantity_liters) AS liters,
                COALESCE(SUM(total_amount),0) AS cost
         FROM milk_records
         WHERE collection_date >= (CURRENT_DATE - INTERVAL '5 months')
         GROUP BY TO_CHAR(collection_date,'YYYY-MM')
         ORDER BY month`
      );
      return rows;
    }, []);

    const profit = parseFloat(salesStats?.total_revenue || 0)
                 - parseFloat(milkStats?.purchase_cost  || 0)
                 - parseFloat(expStats?.total_expenses  || 0);

    res.json({
      success: true,
      data: {
        tenure,
        period: { from: start, to: end },
        kpi: {
          total_liters:   parseFloat(milkStats?.total_liters   || 0),
          purchase_cost:  parseFloat(milkStats?.purchase_cost  || 0),
          avg_fat:        parseFloat(milkStats?.avg_fat        || 0),
          active_farmers: parseInt(milkStats?.active_farmers   || 0),
          record_count:   parseInt(milkStats?.record_count     || 0),
          total_revenue:  parseFloat(salesStats?.total_revenue || 0),
          sold_liters:    parseFloat(salesStats?.sold_liters   || 0),
          total_expenses: parseFloat(expStats?.total_expenses  || 0),
          stock_liters:   parseFloat(stockRow?.stock_liters    || 0).toFixed(1),
          profit:         profit.toFixed(2),
          margin: parseFloat(salesStats?.total_revenue || 0) > 0
            ? ((profit / parseFloat(salesStats.total_revenue)) * 100).toFixed(1) : '0.0',
        },
        purchase_breakdown: purchaseBreakdown || [],
        top_farmers:        topFarmers        || [],
        milk_trend:         milkTrend         || [],
      },
    });
  } catch (err) {
    console.error('Admin dashboard CRASH:', err.message, err.stack);
    res.status(500).json({ success: false, message: 'Dashboard error: ' + err.message });
  }
});

// ── Staff Dashboard ───────────────────────────────────────────────────────────
const staffDashRouter = express.Router();
staffDashRouter.use(authenticate);

staffDashRouter.get('/', async (req, res, next) => {
  try {
    const { tenure = '1d', date_from, date_to } = req.query;
    const { start, end } = getPeriod(tenure, date_from, date_to);
    const userId = req.user.id;

    const centreCheck = await safeQuery(
      () => db.queryOne(`SELECT COUNT(*) AS c FROM information_schema.columns WHERE table_name='farmers' AND column_name='centre_name'`),
      { c: 0 }
    );
    const hasCentre  = parseInt(centreCheck?.c || 0) > 0;
    const centreExpr = hasCentre ? `COALESCE(f.centre_name, f.name)` : `f.name`;

    const kpi = await safeQuery(
      () => db.queryOne(
        `SELECT COALESCE(SUM(quantity_liters),0) AS total_liters,
                COALESCE(AVG(fat_percentage),0)  AS avg_fat,
                COUNT(*) AS entries
         FROM milk_records WHERE recorded_by = $1 AND collection_date BETWEEN $2 AND $3`,
        [userId, start, end]
      ),
      { total_liters: 0, avg_fat: 0, entries: 0 }
    );

    const details = await safeQuery(async () => {
      const [rows] = await db.query(
        `SELECT mr.id, mr.collection_date, mr.collection_time,
                mr.quantity_liters, mr.fat_percentage,
                mr.lactometer_reading, mr.ts_value,
                mr.snf_computed, mr.sp_gravity,
                ${centreExpr} AS centre_name,
                f.name AS farmer_name, f.farmer_code
         FROM milk_records mr
         JOIN farmers f ON f.id = mr.farmer_id
         WHERE mr.recorded_by = $1 AND mr.collection_date BETWEEN $2 AND $3
         ORDER BY mr.collection_date DESC, mr.created_at DESC NULLS LAST`,
        [userId, start, end]
      );
      return rows;
    }, []);

    res.json({
      success: true,
      data: {
        tenure,
        period: { from: start, to: end },
        kpi: {
          total_liters: parseFloat(kpi?.total_liters || 0),
          avg_fat:      parseFloat(kpi?.avg_fat      || 0),
          entries:      parseInt(kpi?.entries        || 0),
        },
        details: details || [],
      },
    });
  } catch (err) {
    console.error('Staff dashboard CRASH:', err.message, err.stack);
    res.status(500).json({ success: false, message: 'Staff dashboard error: ' + err.message });
  }
});

module.exports = { dashRouter, staffDashRouter };
