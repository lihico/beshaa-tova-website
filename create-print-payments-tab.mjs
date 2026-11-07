#!/usr/bin/env node

/**
 * create-print-payments-tab.mjs
 *
 * יוצר לשונית חדשה "תשלומי הדפסה - רן" בגוגל שיטס ומוסיף בה שורה.
 *
 * שימוש:
 *   node create-print-payments-tab.mjs --init                          # יוצר את הלשונית וכותב כותרות (אם לא קיימת)
 *   node create-print-payments-tab.mjs --add '{"date":"26.04.2026",...}' # מוסיף שורה
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env.local
const envPath = path.join(__dirname, '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) {
      let val = m[2];
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      process.env[m[1]] = val;
    }
  }
}

const SHEET_TITLE = 'תשלומי הדפסה - רן';
const HEADERS = [
  'תאריך תשלום',
  'ספק',
  'תיאור',
  'זוגות',
  'כמות חוברות',
  'סכום לפני מע"מ',
  'מע"מ (18%)',
  'סה"כ כולל מע"מ',
  'אמצעי תשלום',
  'הערות',
];

async function getDoc() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY || !process.env.GOOGLE_SPREADSHEET_ID) {
    console.error('❌ חסרים משתני סביבה ב-.env.local');
    process.exit(1);
  }
  const jwt = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const doc = new GoogleSpreadsheet(process.env.GOOGLE_SPREADSHEET_ID, jwt);
  await doc.loadInfo();
  return doc;
}

async function ensureSheet(doc) {
  let sheet = doc.sheetsByTitle[SHEET_TITLE];
  if (!sheet) {
    console.log(`📄 יוצר לשונית חדשה: ${SHEET_TITLE}`);
    sheet = await doc.addSheet({
      title: SHEET_TITLE,
      headerValues: HEADERS,
      rightToLeft: true,
    });
  } else {
    console.log(`✅ הלשונית "${SHEET_TITLE}" קיימת`);
    await sheet.loadHeaderRow();
    if (!sheet.headerValues || sheet.headerValues.length === 0) {
      await sheet.setHeaderRow(HEADERS);
    }
  }
  return sheet;
}

async function addRow(data) {
  const doc = await getDoc();
  const sheet = await ensureSheet(doc);
  await sheet.addRow(data);
  console.log('✅ נוספה שורה:', data['תיאור'] || data['ספק']);
}

async function updateRow(rowIndex, updates) {
  const doc = await getDoc();
  const sheet = await ensureSheet(doc);
  const rows = await sheet.getRows();
  const row = rows[rowIndex];
  if (!row) {
    console.error(`❌ לא נמצאה שורה ${rowIndex}`);
    process.exit(1);
  }
  for (const [k, v] of Object.entries(updates)) {
    row.set(k, v);
  }
  await row.save();
  console.log(`✅ עודכנה שורה ${rowIndex + 2}:`, updates);
}

async function listRows() {
  const doc = await getDoc();
  const sheet = await ensureSheet(doc);
  const rows = await sheet.getRows();
  rows.forEach((r, i) => {
    console.log(`[${i}] ${r.get('תאריך תשלום')} | ${r.get('ספק')} | ${r.get('תיאור')} | ${r.get('סה"כ כולל מע"מ')}`);
  });
}

const args = process.argv.slice(2);

if (args[0] === '--init') {
  const doc = await getDoc();
  await ensureSheet(doc);
  console.log('✅ הלשונית מוכנה.');
} else if (args[0] === '--add') {
  const data = JSON.parse(args[1]);
  await addRow(data);
} else if (args[0] === '--update') {
  const rowIndex = parseInt(args[1], 10);
  const updates = JSON.parse(args[2]);
  await updateRow(rowIndex, updates);
} else if (args[0] === '--list') {
  await listRows();
} else {
  console.log(`
שימוש:
  node create-print-payments-tab.mjs --init
  node create-print-payments-tab.mjs --add '{"תאריך תשלום":"26.04.2026","ספק":"רן","תיאור":"...",...}'
`);
}
