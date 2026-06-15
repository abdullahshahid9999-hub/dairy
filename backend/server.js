require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const morgan    = require('morgan');
const rateLimit = require('express-rate-limit');
const passport  = require('passport');
const fs        = require('fs');

require('./src/config/passport');

['tmp', 'logs'].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

const app = express();

// ── Trust proxy (Render sits behind a load balancer) ───────────────────
app.set('trust proxy', 1);

// ── Security headers ───────────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// ── CORS ───────────────────────────────────────────────────────────────
const rawOrigins = process.env.ALLOWED_ORIGINS
  || process.env.CLIENT_URL
  || 'http://localhost:5173';

const allowedOrigins = rawOrigins
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

// 🔥 BULLETPROOF FIX: Agar environment variables mein vercel link missing ho, toh yeh line khud add kar degi
if (!allowedOrigins.includes('https://brimi.vercel.app')) {
  allowedOrigins.push('https://brimi.vercel.app');
}

console.log('✅ CORS allowed origins:');
allowedOrigins.forEach(o => console.log(`   • ${o}`));

const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.warn(`⛔ CORS blocked: ${origin}`);
    // callback(null, false) rakhein taake 500 error crash na ho
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// ── Rate limiting ──────────────────────────────────────────────────────
const generalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
  max:      parseInt(process.env.RATE_LIMIT_MAX       || '300'),
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, message: 'Too many requests. Try again later.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      parseInt(process.env.AUTH_RATE_LIMIT_MAX || '20'),
  message:  { success: false, message: 'Too many login attempts. Try again in 15 minutes.' },
});

app.use('/api/', generalLimiter);
app.use('/api/auth/login',    authLimiter);
app.use('/api/auth/register', authLimiter);

// ── Body parsing ───────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── HTTP logging ───────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// ── Passport (Google OAuth) ────────────────────────────────────────────
app.use(passport.initialize());

// ── API routes ─────────────────────────────────────────────────────────
app.use('/api/auth',      require('./src/routes/auth'));
app.use('/api/farmers',   require('./src/routes/farmers'));
app.use('/api/milk',      require('./src/routes/milk'));
app.use('/api/billing',   require('./src/routes/billing'));
app.use('/api/sales',     require('./src/routes/sales'));
app.use('/api/vehicles',  require('./src/routes/vehicles'));
app.use('/api/shops',     require('./src/routes/shops'));
app.use('/api/hr',        require('./src/routes/hr'));
app.use('/api/expenses',  require('./src/routes/expenses'));
app.use('/api/reports',   require('./src/routes/reports'));
app.use('/api/audit',     require('./src/routes/audit'));
const { dashRouter, staffDashRouter } = require('./src/routes/dashboard');
app.use('/api/dashboard', dashRouter);
app.use('/api/staff/dashboard', staffDashRouter);

const settingsRoutes = require('./src/routes/settings');
app.use('/api/settings', settingsRoutes);
app.use('/api/customers', require('./src/routes/customers'));
app.use('/api/products',  require('./src/routes/products'));
app.use('/api/receipts',  require('./src/routes/receipts'));
app.use('/api/invoices',  require('./src/routes/invoices'));

// ── Health check ───────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    success:  true,
    status:   'ok',
    version:  '3.0.0',
    env:      process.env.NODE_ENV || 'development',
    origins:  allowedOrigins,
    ts:       new Date().toISOString(),
  });
});

// DEBUG — check exact DB state (remove after fixing)
app.get('/api/debug', async (_req, res) => {
  const { pool } = require('./src/config/db');
  try {
    const users = await pool.query(
      `SELECT u.id, u.email, u.role, u.department, u.shop_id AS u_shop,
              e.id AS emp_id, e.department AS e_dept, e.shop_id AS e_shop,
              s.shop_name
       FROM users u
       LEFT JOIN employees e ON e.user_id = u.id
       LEFT JOIN shops s ON s.id = COALESCE(e.shop_id, u.shop_id)
       WHERE u.role = 'staff'`
    );
    const cols = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'users' AND column_name IN ('department','permissions','shop_id')`
    );
    const ecols = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'employees' AND column_name = 'shop_id'`
    );
    res.json({
      user_columns_exist: cols.rows.map(r => r.column_name),
      employee_shop_col:  ecols.rows.length > 0,
      staff_users:        users.rows
    });
  } catch(e) { res.json({ error: e.message }); }
});

// One-time public setup endpoint — safe to call multiple times (IF NOT EXISTS) [v2]
app.get('/api/setup', async (_req, res) => {
  const { pool } = require('./src/config/db');
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
    try { await pool.query(sql); results.push({ ok: true, sql: sql.slice(0, 70) }); }
    catch (e) { results.push({ ok: false, sql: sql.slice(0, 70), err: e.message }); }
  }
  const failed = results.filter(r => !r.ok);
  res.json({ success: true, message: `Migration: ${results.length - failed.length} ok, ${failed.length} failed`, results });
});

app.get('/', (_req, res) => {
  res.json({ message: 'Dairy ERP API is running', health: '/api/health' });
});

// ── Error handlers (must be last) ─────────────────────────────────────
const { notFound, errorHandler } = require('./src/middleware/errorHandler');
app.use(notFound);
app.use(errorHandler);

// ── Auto-migration — runs on every start, safe (IF NOT EXISTS) ─────────
async function runAutoMigration() {
  const { pool } = require('./src/config/db');
  const steps = [
    // users table
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS department  VARCHAR(50)  DEFAULT 'sales'`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB        DEFAULT '[]'::jsonb`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS shop_id     BIGINT       REFERENCES shops(id) ON DELETE SET NULL`,
    // employees table
    `ALTER TABLE employees ADD COLUMN IF NOT EXISTS shop_id BIGINT REFERENCES shops(id) ON DELETE SET NULL`,
    // milk_records
    `ALTER TABLE milk_records ADD COLUMN IF NOT EXISTS shop_id            BIGINT REFERENCES shops(id) ON DELETE SET NULL`,
    `ALTER TABLE milk_records ADD COLUMN IF NOT EXISTS collection_time    TIME`,
    `ALTER TABLE milk_records ADD COLUMN IF NOT EXISTS lactometer_reading NUMERIC(6,2)`,
    `ALTER TABLE milk_records ADD COLUMN IF NOT EXISTS snf_computed       NUMERIC(6,4)`,
    `ALTER TABLE milk_records ADD COLUMN IF NOT EXISTS sp_gravity         NUMERIC(8,6)`,
    `ALTER TABLE milk_records ADD COLUMN IF NOT EXISTS standardised_ts    NUMERIC(8,4)`,
    `ALTER TABLE milk_records ADD COLUMN IF NOT EXISTS ts_value           NUMERIC(8,4)`,
    // receipts
    `ALTER TABLE receipts ADD COLUMN IF NOT EXISTS shop_id BIGINT REFERENCES shops(id) ON DELETE SET NULL`,
    // indexes (safe to re-run)
    `CREATE INDEX IF NOT EXISTS idx_employees_shop  ON employees(shop_id)`,
    `CREATE INDEX IF NOT EXISTS idx_milk_shop       ON milk_records(shop_id)`,
    `CREATE INDEX IF NOT EXISTS idx_receipts_shop   ON receipts(shop_id)`,
  ];
  let ok = 0, fail = 0;
  for (const sql of steps) {
    try { await pool.query(sql); ok++; }
    catch (e) { console.error('Migration step failed:', e.message); fail++; }
  }
  console.log(`✅ Auto-migration done — ${ok} ok, ${fail} failed`);
}

// ── Start server ───────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3000');
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🥛 Dairy ERP API  →  http://localhost:${PORT}`);
  console.log(`🌍 Env: ${process.env.NODE_ENV || 'development'}\n`);
  runAutoMigration().catch(e => console.error('Auto-migration error:', e.message));
});

// ── Graceful shutdown ──────────────────────────────────────────────────
const shutdown = (sig) => {
  console.log(`\n${sig} received — shutting down gracefully…`);
  server.close(() => { console.log('Server closed.'); process.exit(0); });
  setTimeout(() => process.exit(1), 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('uncaughtException',  err => { console.error('Uncaught Exception:', err.message); process.exit(1); });
process.on('unhandledRejection', err => { console.error('Unhandled Rejection:', err);        process.exit(1); });

module.exports = server;
// force-1781499105
