import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const ease = [0.25, 0.1, 0.25, 1] as const;

const col1 = ["אולם", "צלם", "DJ", "שמלה", "הזמנות"];
const col2 = ["קייטרינג", "עיצוב אירוע", "סידורי הושבה", "טבעות", "פרחים"];
const col3 = ["חופה", "ריקוד פתיחה", "מסיבת רווקות", "איפור"];
const allCols = [col1, col2, col3];
const TOTAL_ITEMS = col1.length + col2.length + col3.length;
const CHECKED_COUNT = 11;

function shuffledIndices(n: number): number[] {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const DEFAULT_SEEN_KEY = "bst_hero_seen";

const INITIAL_PAUSE = 300;
const CHECKLIST_DELAY = 800;
const ITEM_DELAY = 40;
const PAUSE_AFTER_LIST = 400;
const QUESTION_HOLD = 800;

type Phase = 0 | 1 | 2 | 3 | 4;

type WeddingChecklistIntroProps = {
  /** sessionStorage key for "skip animation on return visit" (default shared with `/`) */
  sessionSeenKey?: string;
};

/**
 * Hero hook: wedding checklist fills with checkmarks, then contrast line about what really matters.
 * Used on `/` (HeroV2) and `/v3` before the product hero.
 */
export function WeddingChecklistIntro({ sessionSeenKey = DEFAULT_SEEN_KEY }: WeddingChecklistIntroProps) {
  const forceReplay = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("replay") !== null;
  const alreadySeen = !forceReplay && (typeof sessionStorage !== "undefined" && sessionStorage.getItem(sessionSeenKey) === "1");

  const [phase, setPhase] = useState<Phase>(alreadySeen ? 4 : 0);
  const [struckSet, setStruckSet] = useState<Set<number>>(() => {
    const indices = shuffledIndices(TOTAL_ITEMS);
    return alreadySeen ? new Set(indices.slice(0, CHECKED_COUNT)) : new Set();
  });
  const [order] = useState(() => shuffledIndices(TOTAL_ITEMS));

  useEffect(() => {
    if (alreadySeen) return;
    const timers: ReturnType<typeof setTimeout>[] = [];

    timers.push(setTimeout(() => setPhase(1), INITIAL_PAUSE));
    const strikeStart = INITIAL_PAUSE + CHECKLIST_DELAY;
    for (let i = 0; i < CHECKED_COUNT; i++) {
      timers.push(setTimeout(() => {
        setStruckSet(prev => new Set([...prev, order[i]]));
      }, strikeStart + (i + 1) * ITEM_DELAY));
    }
    const questionTime = strikeStart + CHECKED_COUNT * ITEM_DELAY + PAUSE_AFTER_LIST;
    timers.push(setTimeout(() => setPhase(2), questionTime));
    const checkTime = questionTime + QUESTION_HOLD;
    timers.push(setTimeout(() => setPhase(3), checkTime));
    const revealTime = checkTime + 600;
    timers.push(setTimeout(() => {
      setPhase(4);
      try { sessionStorage.setItem(sessionSeenKey, "1"); } catch {}
    }, revealTime));

    return () => timers.forEach(clearTimeout);
  }, [alreadySeen, order, sessionSeenKey]);

  const skipIntro = () => {
    if (phase >= 4) return;
    setPhase(4);
    const indices = shuffledIndices(TOTAL_ITEMS);
    setStruckSet(new Set(indices.slice(0, CHECKED_COUNT)));
    try { sessionStorage.setItem(sessionSeenKey, "1"); } catch {}
  };

  const showChecklist = phase >= 1;

  const getGlobalIdx = (colIdx: number, itemIdx: number) => {
    let offset = 0;
    for (let c = 0; c < colIdx; c++) offset += allCols[c].length;
    return offset + itemIdx;
  };

  return (
    <section
      className="relative bg-gradient-to-b from-terracotta-50/60 via-terracotta-50/30 to-white px-5 pb-2 pt-2 md:px-16 md:pb-4 md:pt-6"
      onClick={phase < 4 ? skipIntro : undefined}
      style={{ overflowX: "clip" as const, ...(phase < 4 ? { cursor: "pointer" } : {}) }}
    >
      <div className="relative z-10 mx-auto max-w-3xl">
        {!showChecklist && (
          <div className="flex min-h-[28vh] items-center justify-center md:min-h-[45vh]" />
        )}

        {showChecklist && (
          <div className="text-center">
            <div className="flex min-h-0 flex-col items-center justify-center py-2 md:min-h-[38vh] md:py-0">
              <motion.h2
                initial={alreadySeen ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease }}
                className="mb-2 text-base font-bold text-foreground md:mb-4 md:text-xl"
              >
                בתוך כל ארגון החתונה...
              </motion.h2>

              <div className="relative mx-auto w-full max-w-[310px] sm:max-w-[340px] md:max-w-[460px]">
                <motion.div
                  initial={alreadySeen ? false : { opacity: 0, scale: 0.85, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.5, ease }}
                  className="origin-center -rotate-2 rounded-lg bg-[#f9efd2] px-3 py-3 shadow-[0_2px_16px_rgba(0,0,0,0.06)] sm:px-4 sm:py-4 md:px-6 md:py-5"
                  style={{ border: "1px solid #e8e0d4" }}
                >
                  <p
                    className="mb-3 text-center text-[0.9rem] font-medium text-terracotta-400/80"
                    style={{ fontFamily: "'Playpen Sans Hebrew', cursive" }}
                  >
                    צ׳קליסט לחתונה
                  </p>

                  <div className="grid grid-cols-3 gap-x-3 gap-y-2.5 sm:gap-x-4">
                    {allCols.map((col, colIdx) => (
                      <div key={colIdx} className="flex flex-col gap-2.5">
                        {col.map((item, i) => {
                          const globalIdx = getGlobalIdx(colIdx, i);
                          const checked = struckSet.has(globalIdx);
                          return (
                            <div key={item} className="flex items-center gap-1.5">
                              <span
                                className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border transition-colors duration-150 md:h-4 md:w-4 ${checked ? "border-terracotta-400 bg-terracotta-50" : "border-warm-gray-300 bg-white"}`}
                              >
                                {checked && (
                                  <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 md:h-3 md:w-3" fill="none">
                                    <path d="M2.5 6.5L5 9L9.5 3.5" stroke="var(--color-terracotta-500)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                )}
                              </span>
                              <span
                                className="text-[0.7rem] leading-tight sm:text-[0.75rem] md:text-sm text-warm-gray-600"
                                style={{ fontFamily: "'Playpen Sans Hebrew', cursive" }}
                              >
                                {item}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>

                  <AnimatePresence>
                    {phase >= 2 && (
                      <motion.div
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, ease }}
                        className="mt-3 border-t border-dashed border-warm-gray-300/60 pt-2.5"
                      >
                        <div className="flex items-center justify-center">
                          <span
                            className="relative text-sm font-semibold text-terracotta-700 sm:text-base md:text-lg"
                            style={{ fontFamily: "'Playpen Sans Hebrew', cursive" }}
                          >
                            <motion.span
                              className="absolute inset-0 -mx-1 rounded-sm bg-yellow-200/70"
                              style={{ top: "30%", height: "55%" }}
                              initial={{ scaleX: 0, transformOrigin: "right" }}
                              animate={{ scaleX: 1 }}
                              transition={{ duration: 0.3, delay: 0.4, ease }}
                            />
                            <span className="relative">
                              לא מפספסים את מה שחשוב באמת.
                            </span>
                          </span>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
