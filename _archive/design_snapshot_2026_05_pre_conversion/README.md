# ארכיון עיצוב אתר — לפני עדכון המרה והפריוויו

**תאריך צילום:** מאי 2026  
**קומיט מקור:** `ad999d9fe2ed416199d2398795c32b928e9bd02c` (אב של `449d6ad`)  
**מה השתנה אחר כך:** דף `/preview`, רכיב `CoupleDialoguePrompts`, התאמות `HeroV2` (מסלול conversion), צבעים/צ׳קליסט מובייל, עדכוני סקשנים, ביקורת ליבי ב־SocialProof, ועוד.

## מה יש כאן

עותקים של קבצי המקור לפני השינוי הגדול, עם אותה מבנה יחסי תחת `website/`:

- דף הבית **`src/pages/HomeV2.tsx`** (ללא `/preview`)
- **`src/App.tsx`** — ללא נתיב `/preview`
- סקשנים: HeroV2/3, WeddingChecklistIntro, SocialProof, HowItWorksV2, WhatsInside, InlineCTA, PricingCTA, TrustAndFaq
- StickyMobileCTA, Order ודפים עם טקסט שעודכן
- **`index.html`** (לפני `viewport-fit=cover`)

קבצים שלא היו בפרויקט בקומיט הזה (נוספו רק אחרי):  
`CoupleDialoguePrompts.tsx`, `HomePreview.tsx`.

## איך משחזרים

לא להחליף ידנית את הקוד הנוכחי בלי לעבור על סיכום שינויים.

אפשר להשוות או להחליף קובץ ספציפי:

```bash
git show ad999d9fe2ed416199d2398795c32b928e9bd02c:website/src/components/sections/HeroV2.tsx
```

או להעתיק קובץ מהארכיון חזרה ל־`website/src/...` ואז `npm run build` בתיקיית `website/`.
