// backend/src/routes/auth.js
const router   = require('express').Router();
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const db       = require('../config/db');

const JWT_SECRET      = process.env.JWT_SECRET             || null;
const REFRESH_SECRET  = process.env.REFRESH_TOKEN_SECRET   || null;
const JWT_EXPIRES     = process.env.JWT_EXPIRES_IN         || '15m';
const REFRESH_EXPIRES = process.env.REFRESH_TOKEN_EXPIRES_IN      || '7d';
const REFRESH_LONG    = process.env.REFRESH_TOKEN_LONG_EXPIRES_IN || '30d';

function makeAccessToken(user) {
  if (!JWT_SECRET) throw new Error('JWT_SECRET not set');
  return jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}
function makeRefreshToken(user, rememberMe = false) {
  if (!REFRESH_SECRET) throw new Error('REFRESH_TOKEN_SECRET not set');
  return jwt.sign({ id: user.id, type: 'refresh' }, REFRESH_SECRET, { expiresIn: rememberMe ? REFRESH_LONG : REFRESH_EXPIRES });
}
const DEPT_PERMS_LOGIN = {
  sales:    ['sales','customers','products','dashboard'],
  purchase: ['milk','customers_view','dashboard'],
};
const safeUser = (u) => {
  const deptPerms = DEPT_PERMS_LOGIN[u.department] || [];
  const extraPerms = Array.isArray(u.permissions) ? u.permissions
    : (typeof u.permissions === 'string' ? JSON.parse(u.permissions || '[]') : []);
  const perms = u.role === 'admin' ? ['*'] : [...new Set([...deptPerms, ...extraPerms])];
  return {
    id: u.id, name: u.name, email: u.email, role: u.role,
    avatar_url: u.avatar_url || null,
    department: u.department || null,
    shop_id:    u.shop_id    || null,
    shop_name:  u.shop_name  || null,
    perms,
  };
};

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ success: false, errors: errors.array().map(e => ({ field: e.path, message: e.msg })) });
  next();
};

// POST /api/auth/register
router.post('/register',
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').trim().isEmail().normalizeEmail().withMessage('Valid email required'),
    body('password').isLength({ min: 8 }).withMessage('Password min 8 chars')
      .matches(/[A-Z]/).withMessage('Needs uppercase').matches(/[0-9]/).withMessage('Needs a number'),
  ],
  validate,
  async (req, res) => {
    try {
      const { name, email, password } = req.body;
      const existing = await db.queryOne('SELECT id FROM users WHERE email = $1', [email]);
      if (existing) return res.status(409).json({ success: false, message: 'Email already registered.' });

      const hash = await bcrypt.hash(password, 12);
      const result = await db.queryOne(
        `INSERT INTO users (name, email, password_hash, role, is_active, email_verified) VALUES ($1,$2,$3,'staff',true,true)`,
        [name, email, hash]
      );
      const newUser = await db.queryOne('SELECT id, name, email, role FROM users WHERE id = $1', [result?.id]);

      const accessToken  = makeAccessToken(newUser);
      const refreshToken = makeRefreshToken(newUser);
      const rtHash = await bcrypt.hash(refreshToken, 10);
      await db.query('UPDATE users SET refresh_token_hash = $1 WHERE id = $2', [rtHash, newUser.id]);

      return res.status(201).json({ success: true, message: 'Account created.', data: { accessToken, refreshToken, user: safeUser(newUser) } });
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ success: false, message: 'Email already registered.' });
      console.error('[POST /register]', err.message);
      return res.status(500).json({ success: false, message: 'Registration failed.' });
    }
  }
);

// POST /api/auth/login
router.post('/login',
  [
    body('email').trim().isEmail().normalizeEmail().withMessage('Valid email required'),
    body('password').notEmpty().withMessage('Password required'),
    body('rememberMe').optional().isBoolean(),
  ],
  validate,
  async (req, res) => {
    try {
      const { email, password, rememberMe = false } = req.body;
      const user = await db.queryOne(
        `SELECT u.id, u.name, u.email, u.password_hash, u.role, u.avatar_url, u.is_active,
                u.email_verified, u.refresh_token_hash, u.department, u.permissions,
                COALESCE(e.shop_id, u.shop_id) AS shop_id,
                s.shop_name
         FROM users u
         LEFT JOIN employees e ON e.user_id = u.id AND e.is_active = true
         LEFT JOIN shops s ON s.id = COALESCE(e.shop_id, u.shop_id)
         WHERE u.email = $1`,
        [email]
      );

      const invalidMsg = 'Invalid email or password.';
      if (!user) return res.status(401).json({ success: false, message: invalidMsg });
      if (!user.is_active) return res.status(403).json({ success: false, message: 'Account deactivated. Contact admin.' });

      if (!user.password_hash) {
        return res.status(400).json({ success: false, message: 'This account uses Google login.' });
      }

      let passwordMatch = false;
      const isHashed = user.password_hash.startsWith('$2a$') || user.password_hash.startsWith('$2b$');
      if (isHashed) {
        passwordMatch = await bcrypt.compare(password, user.password_hash);
      } else {
        passwordMatch = (password === user.password_hash);
        if (passwordMatch) {
          const upgraded = await bcrypt.hash(password, 12);
          await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [upgraded, user.id]);
        }
      }

      if (!passwordMatch) return res.status(401).json({ success: false, message: invalidMsg });

      const accessToken  = makeAccessToken(user);
      const refreshToken = makeRefreshToken(user, rememberMe);
      const rtHash = await bcrypt.hash(refreshToken, 10);
      await db.query('UPDATE users SET refresh_token_hash = $1 WHERE id = $2', [rtHash, user.id]);

      return res.json({ success: true, message: 'Login successful.', data: { accessToken, refreshToken, user: safeUser(user) } });
    } catch (err) {
      console.error('[POST /login]', err.message);
      return res.status(500).json({ success: false, message: 'Login failed.' });
    }
  }
);

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(401).json({ success: false, message: 'Refresh token required.' });
    if (!REFRESH_SECRET) return res.status(500).json({ success: false, message: 'Server config error.' });

    let payload;
    try { payload = jwt.verify(refreshToken, REFRESH_SECRET); }
    catch (e) {
      const msg = e.name === 'TokenExpiredError' ? 'Session expired.' : 'Invalid refresh token.';
      return res.status(401).json({ success: false, message: msg });
    }

    const user = await db.queryOne(
      'SELECT id, name, email, role, is_active, refresh_token_hash FROM users WHERE id = $1',
      [payload.id]
    );
    if (!user || !user.is_active || !user.refresh_token_hash) {
      return res.status(401).json({ success: false, message: 'Session revoked.' });
    }
    const valid = await bcrypt.compare(refreshToken, user.refresh_token_hash);
    if (!valid) return res.status(401).json({ success: false, message: 'Invalid session.' });

    const newAccessToken  = makeAccessToken(user);
    const newRefreshToken = makeRefreshToken(user);
    const newRtHash = await bcrypt.hash(newRefreshToken, 10);
    await db.query('UPDATE users SET refresh_token_hash = $1 WHERE id = $2', [newRtHash, user.id]);

    return res.json({ success: true, data: { accessToken: newAccessToken, refreshToken: newRefreshToken } });
  } catch (err) {
    console.error('[POST /refresh]', err.message);
    return res.status(500).json({ success: false, message: 'Token refresh failed.' });
  }
});

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (token && JWT_SECRET) {
      try {
        const payload = jwt.verify(token, JWT_SECRET);
        await db.query('UPDATE users SET refresh_token_hash = NULL WHERE id = $1', [payload.id]);
      } catch {}
    }
    return res.json({ success: true, message: 'Logged out.' });
  } catch { return res.json({ success: true, message: 'Logged out.' }); }
});

// GET /api/auth/me
router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'No token.' });
    if (!JWT_SECRET) return res.status(500).json({ success: false, message: 'Server config error.' });

    let payload;
    try { payload = jwt.verify(token, JWT_SECRET); }
    catch (e) { return res.status(401).json({ success: false, message: e.name === 'TokenExpiredError' ? 'Token expired.' : 'Invalid token.' }); }

    const user = await db.queryOne(
      `SELECT u.id, u.name, u.email, u.role, u.avatar_url, u.email_verified, u.created_at,
              u.department, u.permissions,
              COALESCE(e.shop_id, u.shop_id) AS shop_id,
              s.shop_name
       FROM users u
       LEFT JOIN employees e ON e.user_id = u.id AND e.is_active = true
       LEFT JOIN shops s ON s.id = COALESCE(e.shop_id, u.shop_id)
       WHERE u.id = $1 AND u.is_active = true`,
      [payload.id]
    );
    if (!user) return res.status(401).json({ success: false, message: 'User not found.' });

    // Build perms same way as auth middleware
    const DEPT_PERMS = {
      sales:    ['sales','customers','products','dashboard'],
      purchase: ['milk','customers_view','dashboard'],
    };
    if (user.role === 'admin') {
      user.perms = ['*'];
    } else {
      const deptPerms = DEPT_PERMS[user.department] || [];
      const extraPerms = Array.isArray(user.permissions) ? user.permissions
        : (typeof user.permissions === 'string' ? JSON.parse(user.permissions || '[]') : []);
      user.perms = [...new Set([...deptPerms, ...extraPerms])];
    }

    return res.json({ success: true, data: user });
  } catch (err) {
    console.error('[GET /me]', err.message);
    return res.status(500).json({ success: false, message: 'Could not fetch user.' });
  }
});

module.exports = router;
