const express = require('express');
const router  = express.Router();
const db      = require('../config/db');
const { authenticate, adminOnly } = require('../middleware/auth');

// Keys that must never be exposed on the public settings endpoint
const PRIVATE_KEYS = ['admin_whatsapp'];

// GET all settings (public) — excludes private/sensitive keys
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT key, value FROM settings ORDER BY key');
    const settings = {};
    rows.forEach(r => {
      if (!PRIVATE_KEYS.includes(r.key)) settings[r.key] = r.value;
    });
    res.json({ success: true, settings });
  } catch (err) { res.status(500).json({ success: false, message: 'Failed' }); }
});

// POST /logo — MUST be before /:key
router.post('/logo', authenticate, adminOnly, async (req, res) => {
  const { logo, name } = req.body;
  if (!logo) return res.status(400).json({ success: false, message: 'logo required' });
  const isDataUri = logo.startsWith('data:image/');
  const isUrl = logo.startsWith('http://') || logo.startsWith('https://');
  if (!isDataUri && !isUrl) return res.status(400).json({ success: false, message: 'Must be data URI or https URL' });
  if (logo.length > 700000) return res.status(400).json({ success: false, message: 'Logo too large (max ~500KB)' });
  try {
    await db.query(
      `INSERT INTO settings (key,value,updated_by,updated_at) VALUES ('logo_url',$1,$2,NOW())
       ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_by=EXCLUDED.updated_by,updated_at=NOW()`,
      [logo, req.user.id]
    );
    if (name) {
      await db.query(
        `INSERT INTO settings (key,value,updated_by,updated_at) VALUES ('logo_name',$1,$2,NOW())
         ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_by=EXCLUDED.updated_by,updated_at=NOW()`,
        [name, req.user.id]
      );
    }
    res.json({ success: true, message: 'Logo saved' });
  } catch (err) { console.error(err); res.status(500).json({ success: false, message: 'Failed to save logo' }); }
});

// DELETE /logo — MUST be before /:key
router.delete('/logo', authenticate, adminOnly, async (req, res) => {
  try {
    await db.query(`UPDATE settings SET value='',updated_by=$1,updated_at=NOW() WHERE key='logo_url'`, [req.user.id]);
    res.json({ success: true, message: 'Logo reset' });
  } catch (err) { res.status(500).json({ success: false, message: 'Failed' }); }
});

// GET single setting (public — except private keys, which require admin auth)
router.get('/:key', async (req, res) => {
  try {
    if (PRIVATE_KEYS.includes(req.params.key)) {
      return authenticate(req, res, () => adminOnly(req, res, async () => {
        const row = await db.queryOne('SELECT key,value FROM settings WHERE key=$1', [req.params.key]);
        if (!row) return res.status(404).json({ success: false, message: 'Not found' });
        res.json({ success: true, key: row.key, value: row.value });
      }));
    }
    const row = await db.queryOne('SELECT key,value FROM settings WHERE key=$1', [req.params.key]);
    if (!row) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, key: row.key, value: row.value });
  } catch (err) { res.status(500).json({ success: false, message: 'Failed' }); }
});

// PUT update setting
router.put('/:key', authenticate, adminOnly, async (req, res) => {
  const { value } = req.body;
  if (value === undefined) return res.status(400).json({ success: false, message: 'value required' });
  try {
    await db.query(
      `INSERT INTO settings (key,value,updated_by,updated_at) VALUES ($1,$2,$3,NOW())
       ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_by=EXCLUDED.updated_by,updated_at=NOW()`,
      [req.params.key, value, req.user.id]
    );
    res.json({ success: true, message: 'Saved' });
  } catch (err) { res.status(500).json({ success: false, message: 'Failed' }); }
});

module.exports = router;
