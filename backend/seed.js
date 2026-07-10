/**
 * seed.js — Run this ONCE after schema.sql to create test users and sample data
 * Usage: node seed.js
 *
 * Creates:
 *   Admin: admin@dairyerp.test  / Admin@1234
 *   Staff: staff@dairyerp.test  / Staff@1234
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const db     = require('./src/config/db');

async function seed() {
  console.log('\n🌱 Starting database seed...\n');

  // ── Users ─────────────────────────────────────────────────
  const adminHash = await bcrypt.hash('Admin@1234', 12);
  const staffHash = await bcrypt.hash('Staff@1234', 12);

  await db.query(`
    INSERT INTO users (name, email, password_hash, role, is_active, email_verified)
    VALUES
      ('System Admin',  'admin@dairyerp.test', ?, 'admin', 1, 1),
      ('Field Staff',   'staff@dairyerp.test', ?, 'staff', 1, 1)
    ON DUPLICATE KEY UPDATE
      password_hash    = VALUES(password_hash),
      email_verified   = 1,
      is_active        = 1
  `, [adminHash, staffHash]);

  console.log('✅ Users created:');
  console.log('   Admin → admin@dairyerp.test / Admin@1234');
  console.log('   Staff → staff@dairyerp.test / Staff@1234');

  // ── Farmers ───────────────────────────────────────────────
  const farmers = [
    ['FRM-0001', 'Muhammad Ali',   '0311-1234567', 'Village Chak 5, Faisalabad',   48.00, 6.0, 9.0, 0.50, 0.30],
    ['FRM-0002', 'Ahmed Raza',     '0322-9876543', 'Chak 12 North, Sahiwal',        46.50, 5.8, 8.8, 0.45, 0.28],
    ['FRM-0003', 'Fatima Bibi',    '0333-5555444', 'Village Khanewal Road, Multan', 47.00, 6.2, 9.2, 0.52, 0.31],
    ['FRM-0004', 'Tariq Mehmood',  '0301-7778888', 'Chak 22 Left, Lahore',          49.00, 6.5, 9.5, 0.55, 0.33],
    ['FRM-0005', 'Sajida Perveen', '0344-2223333', 'Near Bypass, Gujranwala',       45.00, 5.5, 8.5, 0.40, 0.25],
  ];

  for (const f of farmers) {
    await db.query(`
      INSERT INTO farmers
        (farmer_code, name, phone, address, base_rate, ideal_fat, ideal_snf, fat_correction, snf_correction, created_by)
      VALUES (?,?,?,?,?,?,?,?,?,1)
      ON DUPLICATE KEY UPDATE name = VALUES(name)
    `, f);
  }
  console.log(`✅ ${farmers.length} farmers created`);

  // ── Sample milk records (last 3 days) ─────────────────────
  const [farmerRows] = await db.query('SELECT id, base_rate, ideal_fat, ideal_snf, fat_correction, snf_correction FROM farmers LIMIT 5');
  const days = [0, 1, 2].map(d => {
    const dt = new Date();
    dt.setDate(dt.getDate() - d);
    return dt.toISOString().slice(0, 10);
  });

  let milkCount = 0;
  for (const date of days) {
    for (const shift of ['morning', 'evening']) {
      for (const f of farmerRows) {
        const fat = (5.5 + Math.random() * 1.5).toFixed(2);
        const snf = (8.5 + Math.random() * 1.5).toFixed(2);
        const qty = (8  + Math.random() * 12).toFixed(2);
        const rate = Math.max(0,
          parseFloat(f.base_rate)
          + (parseFloat(fat) - parseFloat(f.ideal_fat)) * parseFloat(f.fat_correction)
          + (parseFloat(snf) - parseFloat(f.ideal_snf)) * parseFloat(f.snf_correction)
        ).toFixed(2);
        const total = (parseFloat(qty) * parseFloat(rate)).toFixed(2);

        try {
          await db.query(`
            INSERT IGNORE INTO milk_records
              (farmer_id, collection_date, shift, quantity_liters, fat_percentage, snf_percentage,
               base_rate, fat_correction, snf_correction, computed_rate, total_amount, recorded_by)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,2)
          `, [f.id, date, shift, qty, fat, snf,
              f.base_rate, f.fat_correction, f.snf_correction, rate, total]);
          milkCount++;
        } catch {}
      }
    }
  }
  console.log(`✅ ${milkCount} milk records created`);

  // ── Company + Contract ────────────────────────────────────
  const [[compExist]] = await db.query("SELECT id FROM companies WHERE name = 'Nestle Pakistan' LIMIT 1");
  let companyId;
  if (!compExist) {
    const [r] = await db.query(`
      INSERT INTO companies (name, contact_name, phone, address, created_by)
      VALUES ('Nestle Pakistan', 'Procurement Dept', '042-111-637853', 'Lahore', 1)
    `);
    companyId = r.insertId;
  } else {
    companyId = compExist.id;
  }

  await db.query(`
    INSERT INTO sales_contracts (company_id, contract_ref, rate_per_liter, start_date, status, created_by)
    VALUES (?, 'NESTLE-2024-001', 55.00, CURDATE(), 'active', 1)
    ON DUPLICATE KEY UPDATE rate_per_liter = VALUES(rate_per_liter)
  `, [companyId]);
  console.log('✅ Sample company & contract created');

  // ── Shop ──────────────────────────────────────────────────
  await db.query(`
    INSERT INTO shops (shop_name, location, ownership_type, owner_name, monthly_rent, created_by)
    VALUES ('Main Collection Center', 'Chak 5, Faisalabad', 'rented', 'Haji Abdul Rehman', 15000.00, 1)
    ON DUPLICATE KEY UPDATE location = VALUES(location)
  `);
  console.log('✅ Sample shop created');

  // ── Employee ──────────────────────────────────────────────
  const [[empExist]] = await db.query("SELECT id FROM employees WHERE emp_code = 'EMP-0001' LIMIT 1");
  if (!empExist) {
    await db.query(`
      INSERT INTO employees (emp_code, name, phone, designation, department, base_salary, join_date, created_by)
      VALUES ('EMP-0001', 'Bilal Ahmed', '0312-9999888', 'Collection Staff', 'Field Operations', 22000.00, CURDATE(), 1)
    `);
  }
  console.log('✅ Sample employee created');

  // ── Sample expense ────────────────────────────────────────
  const [[dieselCat]] = await db.query("SELECT id FROM expense_categories WHERE name = 'Diesel' LIMIT 1");
  if (dieselCat) {
    await db.query(`
      INSERT INTO expenses (category_id, expense_date, amount, description, created_by)
      VALUES (?, CURDATE(), 3500.00, 'Fuel for collection vehicle — morning route', 1)
    `, [dieselCat.id]);
    console.log('✅ Sample expense created');
  }

  console.log('\n✨ Seed complete!\n');
  console.log('┌──────────────────────────────────────────────────┐');
  console.log('│              TEST LOGIN CREDENTIALS               │');
  console.log('├──────────────────────────────────────────────────┤');
  console.log('│  ADMIN  →  admin@dairyerp.test  /  Admin@1234    │');
  console.log('│  STAFF  →  staff@dairyerp.test  /  Staff@1234    │');
  console.log('└──────────────────────────────────────────────────┘\n');

  process.exit(0);
}

seed().catch(err => {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});
