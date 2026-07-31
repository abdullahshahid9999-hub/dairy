const jwt = require('jsonwebtoken');
const db  = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET || null;

// Department → allowed pages map
const DEPT_PERMS = {
  sales:    ['sales','customers','dashboard'],
  purchase: ['milk','customers_view','dashboard'],
};

async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer '))
    return res.status(401).json({ success:false, message:'Authentication required.' });
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await db.queryOne(
      `SELECT u.id,u.name,u.email,u.role,u.is_active,u.department,u.permissions,
              e.id AS emp_id
       FROM users u
       LEFT JOIN employees e ON e.user_id=u.id
       WHERE u.id=$1`,
      [payload.id]
    );
    if (!user || !user.is_active)
      return res.status(401).json({ success:false, message:'Account deactivated.' });

    // Build effective permissions
    if (user.role === 'admin') {
      user.perms = ['*'];
    } else {
      const deptPerms = DEPT_PERMS[user.department] || [];
      const extraPerms = Array.isArray(user.permissions) ? user.permissions
        : (typeof user.permissions === 'string' ? JSON.parse(user.permissions || '[]') : []);
      user.perms = [...new Set([...deptPerms, ...extraPerms])];
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name==='TokenExpiredError') return res.status(401).json({ success:false, message:'Session expired.' });
    return res.status(401).json({ success:false, message:'Invalid token.' });
  }
}

function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin')
    return res.status(403).json({ success:false, message:'Admin access required.' });
  next();
}

function requirePerm(perm) {
  return (req, res, next) => {
    if (req.user?.role === 'admin') return next();
    if (req.user?.perms?.includes(perm) || req.user?.perms?.includes('*'))
      return next();
    return res.status(403).json({ success:false, message:`Access denied. Required: ${perm}` });
  };
}

const requireAdmin = adminOnly;

module.exports = { authenticate, adminOnly, requireAdmin, requirePerm };
