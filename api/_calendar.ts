import { google } from "googleapis";
import { JWT } from "google-auth-library";

/**
 * Utilities for creating two Google Calendar reminders per couple:
 *   1) One week before the wedding - to send a pre-wedding message.
 *   2) The wedding day itself       - to send a wedding-day greeting.
 *
 * If the Calendar API is unavailable or the user's calendar isn't shared with
 * the service account, we fall back to producing .ics attachments that Lihi
 * can double-click in her email to add manually.
 */

type CalendarEvent = {
  summary: string;
  description: string;
  date: string;
};

export type ReminderOutcome = {
  addedToCalendar: boolean;
  events: CalendarEvent[];
  icsContent: string | null;
  error?: string;
};

function toISODate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function formatHeDate(d: Date): string {
  return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
}

function whatsappLink(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, "");
  const normalized = digits.startsWith("0")
    ? "972" + digits.slice(1)
    : digits.startsWith("972")
    ? digits
    : "972" + digits;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

/**
 * A generic message template Lihi can tweak before sending.
 * Kept deliberately short and warm - not dramatic.
 */
function prewedMessage(partner1: string, partner2: string): string {
  return `היי ${partner1} ו${partner2} 👋
שבוע לפני!
מה שלומכם? מתרגשת איתכם 💛
איך הולכים הארגונים? איך אתם?`;
}

function weddingDayMessage(partner1: string, partner2: string): string {
  return `${partner1} ו${partner2}, מזל טוב! 🎉
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

function buildEventDescription(params: {
  partner1: string;
  partner2: string;
  phone: string;
  weddingDate: Date;
  kind: "preweek" | "day";
}): string {
  const { partner1, partner2, phone, weddingDate, kind } = params;
  const msg = kind === "preweek"
    ? prewedMessage(partner1, partner2)
    : weddingDayMessage(partner1, partner2);
  const wa = whatsappLink(phone, msg);
  const when = kind === "preweek"
    ? `שבוע לפני החתונה של ${partner1} ו${partner2} (${formatHeDate(weddingDate)})`
    : `יום החתונה של ${partner1} ו${partner2}`;

  return [
    when,
    "",
    "הודעה מוכנה (ניתנת לעריכה):",
    "",
    msg,
    "",
    `שליחה ב-WhatsApp: ${wa}`,
  ].join("\n");
}

function buildIcs(events: CalendarEvent[]): string {
  const now = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

  const body = events.map((e, i) => {
    const start = e.date.replace(/-/g, "");
    const endDate = addDays(new Date(e.date + "T00:00:00"), 1);
    const end = toISODate(endDate).replace(/-/g, "");
    const uid = `${now}-${i}@beshaa-tova.co.il`;
    const safeDesc = e.description.replace(/\r?\n/g, "\\n").replace(/,/g, "\\,");
    const safeSummary = e.summary.replace(/,/g, "\\,");
    return [
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${end}`,
      `SUMMARY:${safeSummary}`,
      `DESCRIPTION:${safeDesc}`,
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "TRIGGER:PT0M",
      `DESCRIPTION:${safeSummary}`,
      "END:VALARM",
      "END:VEVENT",
    ].join("\r\n");
  }).join("\r\n");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//beshaa-tova//wedding-reminders//HE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    body,
    "END:VCALENDAR",
  ].join("\r\n");
}

/**
 * Main entry point: given a couple's wedding date, create two reminder events
 * in Lihi's Google Calendar. Returns a consistent outcome object regardless
 * of whether the actual calendar write succeeded.
 */
export async function createWeddingReminders(params: {
  partner1: string;
  partner2: string;
  phone: string;
  weddingDate: string | Date;
}): Promise<ReminderOutcome> {
  const { partner1, partner2, phone } = params;
  const weddingDate = new Date(
    typeof params.weddingDate === "string"
      ? params.weddingDate + "T00:00:00"
      : params.weddingDate,
  );

  if (Number.isNaN(weddingDate.getTime())) {
    return {
      addedToCalendar: false,
      events: [],
      icsContent: null,
      error: "Invalid wedding date",
    };
  }

  const prewedDate = addDays(weddingDate, -7);

  const events: CalendarEvent[] = [
    {
      summary: `💌 שבוע לפני החתונה: ${partner1} ו${partner2}`,
      description: buildEventDescription({
        partner1, partner2, phone, weddingDate, kind: "preweek",
      }),
      date: toISODate(prewedDate),
    },
    {
      summary: `💍 יום החתונה: ${partner1} ו${partner2}`,
      description: buildEventDescription({
        partner1, partner2, phone, weddingDate, kind: "day",
      }),
      date: toISODate(weddingDate),
    },
  ];

  const icsContent = buildIcs(events);

  const calendarId = process.env.LIHI_CALENDAR_ID;
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY || !calendarId) {
    return {
      addedToCalendar: false,
      events,
      icsContent,
      error: "Calendar credentials not configured",
    };
  }

  try {
    const auth = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      scopes: ["https://www.googleapis.com/auth/calendar"],
    });

    const calendar = google.calendar({ version: "v3", auth });

    for (const e of events) {
      await calendar.events.insert({
        calendarId,
        requestBody: {
          summary: e.summary,
          description: e.description,
          start: { date: e.date, timeZone: "Asia/Jerusalem" },
          end: { date: toISODate(addDays(new Date(e.date + "T00:00:00"), 1)), timeZone: "Asia/Jerusalem" },
          reminders: {
            useDefault: false,
            overrides: [
              { method: "popup", minutes: 9 * 60 },
              { method: "email", minutes: 24 * 60 },
            ],
          },
        },
      });
    }

    return { addedToCalendar: true, events, icsContent };
  } catch (err) {
    return {
      addedToCalendar: false,
      events,
      icsContent,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Produce an HTML block describing what was (or wasn't) added to the calendar,
 * suitable for embedding inside Lihi's order-notification email.
 */
export function buildReminderEmailBlock(params: {
  outcome: ReminderOutcome;
  partner1: string;
  partner2: string;
  phone: string;
}): string {
  const { outcome, partner1, partner2, phone } = params;

  if (outcome.events.length === 0) {
    return "";
  }

  const prewedMsg = prewedMessage(partner1, partner2);
  const dayMsg = weddingDayMessage(partner1, partner2);
  const waPreweek = whatsappLink(phone, prewedMsg);
  const waDay = whatsappLink(phone, dayMsg);

  const header = outcome.addedToCalendar
    ? `<p style="margin: 16px 0 8px; padding: 10px 14px; background: #F0FDF4; border-radius: 8px; font-size: 14px;">
         ✅ נוספו 2 תזכורות ליומן שלך: <strong>שבוע לפני</strong> ו<strong>ביום החתונה</strong>.
       </p>`
    : `<p style="margin: 16px 0 8px; padding: 10px 14px; background: #FEF3C7; border-radius: 8px; font-size: 14px;">
         ⚠️ לא הצלחנו להוסיף אוטומטית ליומן (${outcome.error || "תאריך חסר"}).
         מצורף קובץ <code>reminders.ics</code> - לחצי עליו לפתיחה ב-Google Calendar ולהוספה בלחיצה.
       </p>`;

  return `
    <div style="margin-top: 20px; padding: 16px; background: #FDF8F5; border: 1px dashed #E8D1C4; border-radius: 10px;">
      <h3 style="margin: 0 0 8px; color: #A85638;">תזכורות ליומן</h3>
      ${header}
      <p style="margin: 12px 0 4px; font-weight: 700;">קישורים מהירים ל-WhatsApp:</p>
      <ul style="margin: 4px 0; padding-right: 20px; line-height: 1.8;">
        <li><a href="${waPreweek}">שליחת ההודעה של <strong>שבוע לפני</strong></a></li>
        <li><a href="${waDay}">שליחת הברכה ב<strong>יום החתונה</strong></a></li>
      </ul>
      <details style="margin-top: 10px;">
        <summary style="cursor: pointer; font-weight: 700;">לראות את טקסט ההודעות</summary>
        <p style="margin: 8px 0 4px; font-weight: 700;">שבוע לפני:</p>
        <pre style="white-space: pre-wrap; background: #fff; padding: 10px; border-radius: 6px; font-family: inherit; font-size: 14px;">${prewedMsg}</pre>
        <p style="margin: 12px 0 4px; font-weight: 700;">יום החתונה:</p>
        <pre style="white-space: pre-wrap; background: #fff; padding: 10px; border-radius: 6px; font-family: inherit; font-size: 14px;">${dayMsg}</pre>
      </details>
    </div>
  `;
}
