/**
 * Creates Google Calendar reminders 2 weeks before each couple's wedding.
 * Run: cd website && node create-wedding-reminders.mjs
 *
 * Prerequisites:
 * - Share your Google Calendar with the service account email:
 *   beshaa-tova-service@beshaa-tova.iam.gserviceaccount.com
 *   (Settings > Share with specific people > Add > give "Make changes to events")
 */

import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import { config } from 'dotenv';

config({ path: '.env.local' });

const couples = [
  { name: 'אופק ויובל', wedding: '2026-05-01' },
  { name: 'טל ועמיר', wedding: '2026-05-10' },
  { name: 'זיו ואביטל', wedding: '2026-05-14' },
  { name: 'שלו ואור', wedding: '2026-05-18' },
  { name: 'אורטל ויהודה', wedding: '2026-05-24' },
  { name: 'עומרי ודנה', wedding: '2026-06-26' },
  { name: "ג'ולי וגל", wedding: '2026-06-29' },
  { name: 'ניר ומאיה', wedding: '2026-08-15' },
  { name: 'עמר וניצן', wedding: '2026-08-23' },
  { name: 'אביה ויאיר', wedding: '2026-09-01' },
  { name: 'שחר ומעיין', wedding: '2026-10-15' },
  { name: 'נעם ונתנאל', wedding: '2026-11-01' },
];

const CALENDAR_ID = process.argv[2] || 'primary';

async function main() {
  const auth = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });

  const calendar = google.calendar({ version: 'v3', auth });

  // Verify access
  try {
    await calendar.calendarList.get({ calendarId: CALENDAR_ID });
  } catch (err) {
    console.error('\n❌ אין גישה ליומן!');
    console.error('צריך לשתף את היומן עם ה-service account:');
    console.error('  beshaa-tova-service@beshaa-tova.iam.gserviceaccount.com\n');
    console.error('איך:');
    console.error('  1. פתחי Google Calendar');
    console.error('  2. הגדרות > הגדרות של היומן שלי > [היומן] > שיתוף עם אנשים מסוימים');
    console.error('  3. הוסיפי את הכתובת למעלה עם הרשאת "ביצוע שינויים באירועים"');
    console.error('\nאחרי השיתוף, הריצי שוב את הסקריפט.\n');
    process.exit(1);
  }

  const today = new Date();
  let created = 0;
  let skipped = 0;

  for (const couple of couples) {
    const weddingDate = new Date(couple.wedding + 'T00:00:00');
    const reminderDate = new Date(weddingDate);
    reminderDate.setDate(reminderDate.getDate() - 14);

    if (reminderDate < today) {
      console.log(`⏭️  ${couple.name} - התזכורת (${formatDate(reminderDate)}) כבר עברה, מדלגת`);
      skipped++;
      continue;
    }

    const event = {
      summary: `🔔 שבועיים לחתונה של ${couple.name}!`,
      description: `החתונה של ${couple.name} ב-${formatDate(weddingDate)}.\nלבדוק: האם קיבלו את הערכה? האם יש משוב? צריך לעזור עם כתובה?`,
      start: {
        date: couple.wedding.replace(/-(\d{2})$/, (_, d) => `-${String(Number(d) - 14).padStart(2, '0')}`),
        date: formatISO(reminderDate),
        timeZone: 'Asia/Jerusalem',
      },
      end: {
        date: formatISO(reminderDate),
        timeZone: 'Asia/Jerusalem',
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 0 },
          { method: 'email', minutes: 0 },
        ],
      },
    };

    try {
      await calendar.events.insert({
        calendarId: CALENDAR_ID,
        requestBody: event,
      });
      console.log(`✅ ${couple.name} - תזכורת נוצרה ל-${formatDate(reminderDate)} (חתונה: ${formatDate(weddingDate)})`);
      created++;
    } catch (err) {
      console.error(`❌ ${couple.name} - שגיאה: ${err.message}`);
    }
  }

  console.log(`\nסה"כ: ${created} תזכורות נוצרו, ${skipped} דולגו (עברו)`);
}

function formatDate(d) {
  return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
}

function formatISO(d) {
  return d.toISOString().split('T')[0];
}

main().catch(console.error);
