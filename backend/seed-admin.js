/**
 * Run once: node seed-admin.js
 * Creates admin user: abdullahshahid9999@gmail.com / Pakistan@1947
 */
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  const hash = '$2b$12$.OfvLcNRqfoc1gkU29Az8eHsJQMgMjXMhx9LpwATTwn0kSt1DIati';

  // Upsert — safe to run multiple times
  const result = await pool.query(`
    INSERT INTO users (name, email, password_hash, role, is_active, email_verified, department, permissions)
    VALUES ($1, $2, $3, 'admin', true, true, 'admin', '["*"]')
    ON CONFLICT (email) DO UPDATE
      SET name          = EXCLUDED.name,
          password_hash = EXCLUDED.password_hash,
          role          = 'admin',
          is_active     = true,
          email_verified= true,
          department    = 'admin',
          permissions   = '["*"]'
    RETURNING id, name, email, role
  `, ['Ghulam Fareed', 'abdullahshahid9999@gmail.com', hash]);

  console.log('✅ Admin created/updated:', result.rows[0]);
  await pool.end();
}

main().catch(e => { console.error('❌ Error:', e.message); process.exit(1); });
