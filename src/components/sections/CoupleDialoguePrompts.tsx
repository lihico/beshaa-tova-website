import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

/** שאלות ומשפטים מהשיח - רוטציה (דף `/preview`) */
export type DialoguePromptItem =
  | string
  | {
      lead: string;
      rest: string;
    };

export const DIALOGUE_PROMPT_ITEMS: DialoguePromptItem[] = [
  {
    lead: "כשאתה משאיר לי פתק אתה לא יודע כמה אני מתרגשת,",
    rest: "כי...",
  },
  "איך זה התקבע שמישהו מאיתנו תמיד אחראי על החשבונות?",
  { lead: "זה מדליק אותי", rest: "כשאת..." },
  {
    lead: "אני רוצה שבחמש השנים הקרובות",
    rest: "אנחנו...",
  },
  "מה עולה אצלך כשאומרים לנו \"עוד מעט אצלכם\"?",
  {
    lead: "כשאת עוברת תקופה קשה,",
    rest: "מה את צריכה ממני?",
  },
  {
    lead: "כשאתה נעלב, אתה נסגר",
    rest: "וקשה לי להגיע אליך...",
  },
  "איך היית רוצה שייראו השבתות שלנו?",
  {
    lead: "משהו שאני חייבת להסביר לך",
    rest: "לגבי המשפחה שלי...",
  },
];

/** קצב ההקלדה (מ״ש לאות), השהיה על משפט מלא, וזמן דעיכה לפני הבא */
/** קצב כתב-יד; ההשהיה בין משפטים קצרה כדי שהרוטציה תזרום */
const TYPE_MS = 54;
const HOLD_MS = 1000;
const LEAVE_MS = 150;

/** Playpen — כמו הצ׳קליסט; מודגש — מובחן מ־Noto בשאר העמוד */
const PROMPT_FONT = "font-['Playpen_Sans_Hebrew',cursive] font-bold";

/** גודל בסיס היה ~0.95rem — לפחות פי 3 (~2.85rem); במסכים צרים clamp כדי שלא ייחתך */
/** במובייל צר: תקרה קצת נמוכה יותר + vmin עדין כדי שלא ייצא מסך */
const PROMPT_TEXT = `${PROMPT_FONT} m-0 max-w-full text-pretty break-words leading-snug text-terracotta-700 text-[clamp(1.45rem,6.5vmin,2.45rem)] sm:text-[clamp(1.65rem,7vmin,2.75rem)] md:text-[clamp(2rem,4.5vmin,3.06rem)]`;
const PROMPT_TEXT_SECOND = `${PROMPT_FONT} m-0 max-w-full text-pretty break-words leading-snug text-terracotta-600 text-[clamp(1.35rem,6vmin,2.45rem)] sm:text-[clamp(1.55rem,6.8vmin,2.75rem)] md:text-[clamp(1.9rem,4.2vmin,3.06rem)]`;

/** דעיכת-פנים עדינה לכל אות חדשה - מרכך את ההופעה כך שירגיש כמו כתיבה, לא הבהוב */
const CHAR_ANIM = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.14, ease: "easeOut" } },
} as const;

type Segment = { text: string; className: string };

function toSegments(item: DialoguePromptItem): Segment[] {
  if (typeof item === "string") {
    return [{ text: item, className: PROMPT_TEXT }];
  }
  return [
    { text: item.lead, className: PROMPT_TEXT },
    { text: item.rest, className: PROMPT_TEXT_SECOND },
  ];
}

function fullText(item: DialoguePromptItem): string {
  return typeof item === "string" ? item : `${item.lead} ${item.rest}`;
}

/**
 * שאלות מהשיח - אחרי הצ׳קליסט בהתחלה.
 * מוצג בהמשך דף הבית כדי לא להאריך את ההירו.
 */
export function CoupleDialoguePrompts() {
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const reduceMotion = useReducedMotion();
  const items = DIALOGUE_PROMPT_ITEMS;
  const count = items.length;

  const item = items[index];
  const segments = toSegments(item);
  const total = segments.reduce((sum, s) => sum + s.text.length, 0);

  useEffect(() => {
    // כבוד ל־prefers-reduced-motion: להציג מלא, בלי הקלדה
    if (reduceMotion) {
      setTyped(total);
      setLeaving(false);
      const holdId = window.setTimeout(
        () => setIndex((i) => (i + 1) % count),
        HOLD_MS + 1000,
      );
      return () => window.clearTimeout(holdId);
    }

    setTyped(0);
    setLeaving(false);
    let curr = 0;
    const timers: number[] = [];

    const typeId = window.setInterval(() => {
      curr += 1;
      setTyped(curr);
      if (curr >= total) {
        window.clearInterval(typeId);
        const holdId = window.setTimeout(() => {
          setLeaving(true);
          const leaveId = window.setTimeout(
            () => setIndex((i) => (i + 1) % count),
            LEAVE_MS,
          );
          timers.push(leaveId);
        }, HOLD_MS);
        timers.push(holdId);
      }
    }, TYPE_MS);

    return () => {
      window.clearInterval(typeId);
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [index, total, reduceMotion, count]);

  let remaining = typed;
  const visible = segments.map((seg) => {
    const take = Math.max(0, Math.min(seg.text.length, remaining));
    remaining -= seg.text.length;
    return { ...seg, shown: seg.text.slice(0, take) };
  });

  return (
    <section
      className="scroll-mt-24 overflow-x-clip border-t border-warm-gray-200/90 bg-gradient-to-b from-[#faf8f5] via-[#faf8f5] to-terracotta-50/25 px-4 py-5 sm:px-5 md:py-6"
      id="dialogue-prompts"
      aria-labelledby="dialogue-prompts-heading"
    >
      <div className="mx-auto max-w-3xl px-2 sm:px-4">
        <h2 id="dialogue-prompts-heading" className="sr-only">
          שאלות מהשיח
        </h2>

        {/* הכרזה נגישה - הטקסט המלא, לא אות-אות */}
        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {fullText(item)}
        </p>

        <div className="relative mx-auto flex min-h-[11rem] items-center justify-center px-1 py-2 md:min-h-[10rem] md:py-3">
          <motion.div
            aria-hidden="true"
            animate={{ opacity: leaving ? 0 : 1 }}
            transition={{ duration: leaving ? LEAVE_MS / 1000 : 0.15, ease: "easeOut" }}
            className="w-full space-y-3 text-center md:space-y-4"
          >
            {visible.map((seg, i) => (
              <p key={i} className={seg.className}>
                {Array.from(seg.shown).map((ch, j) => (
                  <motion.span
                    key={j}
                    variants={CHAR_ANIM}
                    initial="hidden"
                    animate="visible"
                  >
                    {ch}
                  </motion.span>
                ))}
              </p>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
