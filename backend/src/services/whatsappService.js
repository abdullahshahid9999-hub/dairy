// backend/src/services/whatsappService.js
//
// Sends WhatsApp notifications via Meta's WhatsApp Cloud API.
// Configure these in .env (see .env.example):
//   WHATSAPP_TOKEN          — permanent access token from Meta Business app
//   WHATSAPP_PHONE_ID       — the "Phone number ID" from Meta dashboard (NOT the phone number itself)
//   WHATSAPP_API_VERSION    — optional, defaults to v21.0
//
// The admin's own WhatsApp number lives in the `settings` table (key: admin_whatsapp),
// editable from the admin panel — NOT hardcoded here.
//
// IMPORTANT: Meta requires business-initiated messages to use a pre-approved
// message *template* (not free-form text) unless the recipient messaged you
// in the last 24 hours. You must create and get these templates approved in
// Meta Business Manager before this will work:
//   - purchase_alert_admin   (vars: {{1}}=farmer name, {{2}}=liters, {{3}}=amount, {{4}}=date)
//   - purchase_alert_supplier (vars: {{1}}=farmer name, {{2}}=liters, {{3}}=rate, {{4}}=amount, {{5}}=date)
//
// Until templates are approved, calls below will fail — failures are caught
// and logged, never thrown, so they NEVER block or break a purchase/sale record.
//
// Required templates (create + get approved in Meta Business Manager):
//   - purchase_alert_admin     (vars: farmer name, liters, amount, date)
//   - purchase_alert_supplier  (vars: farmer name, liters, rate, amount, date)
//   - sale_alert_admin         (vars: company name, liters, amount, date)
//   - sale_alert_company       (vars: company name, liters, rate, amount, date)

const db = require('../config/db');

const WHATSAPP_TOKEN     = process.env.WHATSAPP_TOKEN     || null;
const WHATSAPP_PHONE_ID  = process.env.WHATSAPP_PHONE_ID  || null;
const API_VERSION        = process.env.WHATSAPP_API_VERSION || 'v21.0';
const ENABLED            = Boolean(WHATSAPP_TOKEN && WHATSAPP_PHONE_ID);

function isConfigured() {
  return ENABLED;
}

// Normalizes a Pakistani number to E.164-ish digits Meta expects (no '+', no spaces/dashes).
// Accepts: 03001234567, +923001234567, 923001234567, 0300-1234567
function normalizePhone(raw) {
  if (!raw) return null;
  let digits = String(raw).replace(/[^\d]/g, '');
  if (digits.startsWith('0')) digits = '92' + digits.slice(1);   // 0300... -> 92300...
  if (!digits.startsWith('92')) digits = '92' + digits;          // bare 300... -> 92300...
  return digits;
}

async function getAdminWhatsApp() {
  try {
    const row = await db.queryOne(`SELECT value FROM settings WHERE key='admin_whatsapp'`);
    return normalizePhone(row?.value);
  } catch {
    return null;
  }
}

async function logAttempt({ recipient, recipientType, templateName, relatedTable, relatedId, success, errorDetail }) {
  try {
    await db.query(
      `INSERT INTO whatsapp_logs (recipient, recipient_type, template_name, related_table, related_id, success, error_detail)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [recipient, recipientType, templateName, relatedTable || null, relatedId || null, success, errorDetail || null]
    );
  } catch (e) {
    // Logging must never crash the actual notification flow
    console.error('[whatsapp] Failed to write log:', e.message);
  }
}

async function sendTemplateMessage(toRaw, templateName, languageCode, params = [], meta = {}) {
  const to = normalizePhone(toRaw);
  if (!ENABLED) {
    console.warn('[whatsapp] Skipped — WHATSAPP_TOKEN/WHATSAPP_PHONE_ID not configured.');
    return { skipped: true, reason: 'not_configured' };
  }
  if (!to) {
    console.warn('[whatsapp] Skipped — no valid recipient phone number.');
    return { skipped: true, reason: 'no_recipient' };
  }

  const body = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode || 'en' },
      components: params.length
        ? [{ type: 'body', parameters: params.map(p => ({ type: 'text', text: String(p) })) }]
        : [],
    },
  };

  try {
    const res = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${WHATSAPP_PHONE_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );
    const data = await res.json();
    if (!res.ok) {
      console.error('[whatsapp] Send failed:', JSON.stringify(data));
      await logAttempt({ recipient: to, recipientType: meta.recipientType, templateName, relatedTable: meta.relatedTable, relatedId: meta.relatedId, success: false, errorDetail: JSON.stringify(data) });
      return { success: false, error: data };
    }
    await logAttempt({ recipient: to, recipientType: meta.recipientType, templateName, relatedTable: meta.relatedTable, relatedId: meta.relatedId, success: true });
    return { success: true, data };
  } catch (err) {
    console.error('[whatsapp] Network/error sending message:', err.message);
    await logAttempt({ recipient: to, recipientType: meta.recipientType, templateName, relatedTable: meta.relatedTable, relatedId: meta.relatedId, success: false, errorDetail: err.message });
    return { success: false, error: err.message };
  }
}

/**
 * Notify admin + supplier (farmer) when a milk purchase (collection) is recorded.
 * Never throws — caller should fire-and-forget this.
 */
async function notifyPurchase({ farmerName, farmerPhone, liters, rate, amount, date, recordId }) {
  const adminPhone = await getAdminWhatsApp();
  const results = {};

  if (adminPhone) {
    results.admin = await sendTemplateMessage(
      adminPhone,
      'purchase_alert_admin',
      'en',
      [farmerName, liters, amount, date],
      { recipientType: 'admin', relatedTable: 'milk_records', relatedId: recordId }
    );
  } else {
    results.admin = { skipped: true, reason: 'admin_number_not_set' };
  }

  if (farmerPhone) {
    results.supplier = await sendTemplateMessage(
      farmerPhone,
      'purchase_alert_supplier',
      'en',
      [farmerName, liters, rate, amount, date],
      { recipientType: 'supplier', relatedTable: 'milk_records', relatedId: recordId }
    );
  } else {
    results.supplier = { skipped: true, reason: 'no_farmer_phone' };
  }

  return results;
}

/**
 * Notify admin + company when a milk sale is recorded.
 * Never throws — caller should fire-and-forget this.
 */
async function notifySale({ companyName, companyPhone, liters, rate, amount, date, recordId }) {
  const adminPhone = await getAdminWhatsApp();
  const results = {};

  if (adminPhone) {
    results.admin = await sendTemplateMessage(
      adminPhone,
      'sale_alert_admin',
      'en',
      [companyName, liters, amount, date],
      { recipientType: 'admin', relatedTable: 'milk_sales', relatedId: recordId }
    );
  } else {
    results.admin = { skipped: true, reason: 'admin_number_not_set' };
  }

  if (companyPhone) {
    results.company = await sendTemplateMessage(
      companyPhone,
      'sale_alert_company',
      'en',
      [companyName, liters, rate, amount, date],
      { recipientType: 'company', relatedTable: 'milk_sales', relatedId: recordId }
    );
  } else {
    results.company = { skipped: true, reason: 'no_company_phone' };
  }

  return results;
}

module.exports = { isConfigured, normalizePhone, getAdminWhatsApp, sendTemplateMessage, notifyPurchase, notifySale };
