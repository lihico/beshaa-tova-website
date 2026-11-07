/**
 * Backfill Google Calendar reminders for every couple in the tracking sheet.
 *
 * For each row that has a valid future wedding date and phone, creates two
 * events in Lihi's calendar:
 *   1) 7 days before the wedding  - "שבוע לפני" message + wa.me link
 *   2) The wedding day itself     - "מזל טוב" message + wa.me link
 *
 * Idempotent: before inserting, we look for an event on the same date whose
 * summary already mentions the couple's display name, and skip it.
 *
 * Usage:
 *   cd website
 *   node backfill-wedding-reminders.mjs                 # dry run
 *   node backfill-wedding-reminders.mjs --apply         # actually create events
 *   node backfill-wedding-reminders.mjs --apply --force # recreate even if exists
 *
 * Prerequisites:
 *   - LIHI_CALENDAR_ID set in .env.local
 *   - That calendar is shared with the service account as "make changes to events"
 */

import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { google } from 'googleapis';
import { config } from 'dotenv';

config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const FORCE = process.argv.includes('--force');
const ORDERS_SHEET_ID = 746414414;

function toISODate(d) {
  return d.toISOString().split('T')[0];
}
function addDays(d, days) {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}
function formatHe(d) {
  return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
}
function parseWeddingDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s || s === 'לא נקבע' || s === 'לא צוין') return null;
  // ISO (2026-08-15) or DD/MM/YYYY or DD.M.YYYY
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00`);
  const dmy = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return new Date(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T00:00:00`);
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t);
}
function normalizePhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('972')) return digits;
  if (digits.startsWith('0')) return '972' + digits.slice(1);
  return '972' + digits;
}
function waLink(phoneE164, message) {
  return `https://wa.me/${phoneE164}?text=${encodeURIComponent(message)}`;
}

function prewedMessage(p1, p2) {
  return `היי ${p1} ו${p2} 👋
שבוע לפני!
מה שלומכם? מתרגשת איתכם 💛
איך הולכים הארגונים? איך אתם?`;
}
function weddingDayMessage(p1, p2) {
  return `${p1} ו${p2}, מזל טוב! 🎉
היום היום.
אני מתרגשת איתכם מרחוק 💛

רציתי להשאיר לכם כמה דברים בכיס ליום הזה. לא כי צריך לעשות איתם משהו - רק שיהיו שם, אם יעלו:

🌬️ *באמת? אני בטוחה?*
אם עולה לכם מחשבה של "חייבים ש..." (איך רוקדים, עם מי עומדים בתמונה, מתי חותכים עוגה) - אפשר לעצור רגע ולשאול את עצמכם בלחישה: באמת? בטוחה? בטוח? לרוב התשובה היא "לא באמת, זה מה שחשבתי שצריך".

💫 *יש "ו", אין "אבל"*
חתונה זה לא להיות רק מאושרים. זה להרגיש הכל מהכל - ביום אחד, בבת אחת. מאושרים *ו*עייפים *ו*מתרגשים *ו*קצת חוששים *ו*שמחים על מי שאיתנו *ו*עצובים על מי שלא. הכל יכול להיות ביחד. לא צריך לבחור.

💛 *למה דווקא אחד בשני*
איפשהו בין הצלמים והדודים - אם יהיו 30 שניות של שקט, הסתכלו אחד בשני בעיניים. למה דווקא הוא. למה דווקא היא. זה הרגע של הערב.

שיהיה יום מושלם 🤍
ליהי`;
}

function buildEvent(kind, { p1, p2, phone, weddingDate }) {
  const isPreweek = kind === 'preweek';
  const date = isPreweek ? addDays(weddingDate, -7) : weddingDate;
  const msg = isPreweek ? prewedMessage(p1, p2) : weddingDayMessage(p1, p2);
  const wa = phone ? waLink(phone, msg) : null;
  const summary = isPreweek
    ? `💌 שבוע לפני החתונה: ${p1} ו${p2}`
    : `💍 יום החתונה: ${p1} ו${p2}`;
  const when = isPreweek
    ? `שבוע לפני החתונה של ${p1} ו${p2} (${formatHe(weddingDate)})`
    : `יום החתונה של ${p1} ו${p2}`;
  const description = [
    when,
    '',
    'הודעה מוכנה (ניתנת לעריכה):',
    '',
    msg,
    '',
    wa ? `שליחה ב-WhatsApp: ${wa}` : '(אין טלפון בגיליון - צריך להשלים ידנית)',
  ].join('\n');
  return { summary, description, date: toISODate(date) };
}

async function findExistingEvent(calendar, calendarId, date, displayName) {
  const timeMin = new Date(date + 'T00:00:00+03:00').toISOString();
  const timeMax = new Date(addDays(new Date(date + 'T00:00:00'), 1).toISOString().split('T')[0] + 'T00:00:00+03:00').toISOString();
  const res = await calendar.events.list({
    calendarId,
    timeMin,
    timeMax,
    singleEvents: true,
    q: displayName,
    maxResults: 10,
  });
  return (res.data.items || []).find((ev) =>
    (ev.summary || '').includes(displayName) && (ev.summary || '').match(/שבוע לפני|יום החתונה|💌|💍/),
  );
}

async function main() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
    console.error('❌ חסר GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY ב-.env.local');
    process.exit(1);
  }
  const calendarId = process.env.LIHI_CALENDAR_ID;
  if (!calendarId) {
    console.error('❌ חסר LIHI_CALENDAR_ID ב-.env.local (כתובת המייל של ליהי / primary / calendar id)');
    process.exit(1);
  }
  if (!process.env.GOOGLE_SPREADSHEET_ID) {
    console.error('❌ חסר GOOGLE_SPREADSHEET_ID ב-.env.local');
    process.exit(1);
  }

  const jwt = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets.readonly',
      'https://www.googleapis.com/auth/calendar',
    ],
  });
  const doc = new GoogleSpreadsheet(process.env.GOOGLE_SPREADSHEET_ID, jwt);
  await doc.loadInfo();
  const sheet = doc.sheetsById[ORDERS_SHEET_ID];
  if (!sheet) {
    console.error(`❌ לא מצאתי גיליון ${ORDERS_SHEET_ID}`);
    process.exit(1);
  }
  await sheet.loadHeaderRow();
  const rows = await sheet.getRows();
  const calendar = google.calendar({ version: 'v3', auth: jwt });

  try {
    // Service accounts don't get entries in calendarList, so use calendars.get instead
    await calendar.calendars.get({ calendarId });
  } catch (err) {
    if (APPLY) {
      console.error(`❌ אין גישה ליומן ${calendarId}`);
      console.error('   יש לשתף את היומן עם ה-service account:');
      console.error(`   ${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL}`);
      console.error('   בהגדרה "ביצוע שינויים באירועים"');
      process.exit(1);
    }
    console.warn(`⚠️  אין גישה ליומן ${calendarId} - ממשיכה ב-dry-run בלי בדיקת כפילויות\n`);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const summary = {
    created: [],
    skippedAlreadyExists: [],
    skippedPast: [],
    skippedNoDate: [],
    skippedInvalid: [],
  };

  console.log(`\n📅 יומן: ${calendarId}`);
  console.log(`📊 גיליון: ${sheet.title} (${rows.length} שורות)`);
  console.log(`🔧 מצב: ${APPLY ? (FORCE ? 'APPLY + FORCE' : 'APPLY') : 'DRY RUN'} (השתמשי ב---apply כדי ליצור בפועל)\n`);

  for (const row of rows) {
    const p1 = row.get('שם 1 (ממלא/ת)');
    const p2 = row.get('שם 2');
    const displayName = row.get('שמות תצוגה') || (p1 && p2 ? `${p1} ו${p2}` : p1 || '(ללא שם)');
    const rawDate = row.get('תאריך חתונה');
    const rawPhone = row.get('טלפון');
    const status = row.get('סטטוס') || '';

    if (!p1 && !p2) {
      continue;
    }

    const weddingDate = parseWeddingDate(rawDate);
    if (!weddingDate) {
      summary.skippedNoDate.push({ displayName, rawDate: rawDate || '(ריק)' });
      continue;
    }
    if (Number.isNaN(weddingDate.getTime())) {
      summary.skippedInvalid.push({ displayName, rawDate });
      continue;
    }

    const phone = normalizePhone(rawPhone);

    const events = [
      buildEvent('preweek', { p1, p2, phone, weddingDate }),
      buildEvent('day', { p1, p2, phone, weddingDate }),
    ];

    for (const ev of events) {
      const eventDate = new Date(ev.date + 'T00:00:00');
      if (eventDate < today) {
        summary.skippedPast.push({ displayName, summary: ev.summary, date: ev.date });
        continue;
      }

      let existing = null;
      if (!FORCE) {
        try {
          existing = await findExistingEvent(calendar, calendarId, ev.date, displayName);
        } catch (err) {
          // בדרך כלל זה קורה ב-dry run בלי שיתוף יומן - ממשיכים
        }
      }
      if (existing) {
        summary.skippedAlreadyExists.push({ displayName, date: ev.date, summary: existing.summary });
        continue;
      }

      if (!APPLY) {
        summary.created.push({ displayName, date: ev.date, summary: ev.summary, phone: phone || '(חסר)', dryRun: true });
        continue;
      }

      try {
        await calendar.events.insert({
          calendarId,
          requestBody: {
            summary: ev.summary,
            description: ev.description,
            start: { date: ev.date, timeZone: 'Asia/Jerusalem' },
            end: { date: toISODate(addDays(new Date(ev.date + 'T00:00:00'), 1)), timeZone: 'Asia/Jerusalem' },
            reminders: {
              useDefault: false,
              overrides: [
                { method: 'popup', minutes: 9 * 60 },
                { method: 'email', minutes: 24 * 60 },
              ],
            },
          },
        });
        summary.created.push({ displayName, date: ev.date, summary: ev.summary, phone: phone || '(חסר)' });
      } catch (err) {
        console.error(`   ❌ כשל ביצירת אירוע ל-${displayName} בתאריך ${ev.date}: ${err.message}`);
      }
    }
  }

  const section = (title, list, fmt) => {
    if (!list.length) return;
    console.log(`\n${title} (${list.length}):`);
    for (const item of list) console.log(`  ${fmt(item)}`);
  };

  section(APPLY ? '✅ נוצרו אירועים' : '📝 ייווצרו אירועים (dry run)', summary.created,
    (i) => `${i.displayName} | ${i.date} | ${i.summary} | טלפון: ${i.phone}`);
  section('⏭️  כבר קיימים (דולגים)', summary.skippedAlreadyExists,
    (i) => `${i.displayName} | ${i.date} | ${i.summary}`);
  section('⏭️  תאריך עבר', summary.skippedPast,
    (i) => `${i.displayName} | ${i.date} | ${i.summary}`);
  section('⏭️  בלי תאריך חתונה', summary.skippedNoDate,
    (i) => `${i.displayName} | "${i.rawDate}"`);
  section('⚠️  תאריך לא תקין', summary.skippedInvalid,
    (i) => `${i.displayName} | "${i.rawDate}"`);

  console.log(`\n📊 סיכום:`);
  console.log(`   ${APPLY ? 'נוצרו' : 'יווצרו'}: ${summary.created.length}`);
  console.log(`   דולגים (כבר קיים): ${summary.skippedAlreadyExists.length}`);
  console.log(`   דולגים (תאריך עבר): ${summary.skippedPast.length}`);
  console.log(`   דולגים (אין תאריך): ${summary.skippedNoDate.length}`);
  console.log(`   לא תקין: ${summary.skippedInvalid.length}`);
  if (!APPLY) {
    console.log(`\n💡 להרצה אמיתית: node backfill-wedding-reminders.mjs --apply`);
  }
}

main().catch((err) => {
  console.error('❌ שגיאה:', err);
  process.exit(1);
});
