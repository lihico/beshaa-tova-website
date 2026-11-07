export type CafeTheme = "default" | "toms";

export interface CafeBranch {
  name: string;
  address: string;
  mapUrl?: string;
  phone?: string;
  hours?: string[];
}

export interface CafePartner {
  slug: string;
  name: string;
  logoUrl: string;
  heroUrl?: string;
  /** תמונה לכרטיס "זוג כוסות קפה" בדף השיתוף. ברירת מחדל: תמונת בר-קפה. */
  coffeeOfferUrl?: string;
  exteriorUrl?: string;
  city: string;
  branches?: CafeBranch[];
  /** שורות שעות לתצוגה בדף השיתוף (למשל סניף יחיד). */
  openingHours?: string[];
  /** ערכת עיצוב מותאמת למותג בית הקפה */
  theme?: CafeTheme;
  instagramHandle?: string;
  /** טקסט הטבה מותאם - ברירת מחדל: "זוג כוסות קפה" */
  offerText?: string;
  /** טקסט הטבה קצר ל-hero */
  offerTextShort?: string;
  /** תיאור ההטבה בשאלות נפוצות */
  offerFaqAnswer?: string;
}

export const CAFE_PARTNERS: Record<string, CafePartner> = {
  barcafe: {
    slug: "barcafe",
    name: "בר-קפה",
    logoUrl: "/cafes/barcafe-logo.png",
    heroUrl: "/illustrations/cafe-hero.png",
    coffeeOfferUrl: "/cafes/barcafe-coffee-pair.png",
    exteriorUrl: "/cafes/barcafe-exterior.png",
    city: "רמת גן",
    branches: [
      { name: "רוקח", address: "רוקח 58, רמת גן", mapUrl: "https://maps.google.com/?q=רוקח+58+רמת+גן" },
      { name: "רש\"י", address: "רש\"י 23, רמת גן", mapUrl: "https://maps.google.com/?q=רשי+23+רמת+גן" },
    ],
    instagramHandle: "@barcafe_58",
  },
  cafefiori: {
    slug: "cafefiori",
    name: "Cafe Fiori",
    logoUrl: "/cafes/cafefiori-logo.png",
    heroUrl: "/illustrations/cafe-hero.png",
    coffeeOfferUrl: "/cafes/cafefiori-iced-coffee-cans.png",
    exteriorUrl: "/cafes/cafefiori-espresso.png",
    city: "תל אביב",
    branches: [
      {
        name: "Cafe Fiori",
        address: "יום טוב 20, תל אביב-יפו",
        mapUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("יום טוב 20, תל אביב-יפו")}`,
      },
    ],
    openingHours: [
      "א׳-ה׳: 7:30 - 18:00",
      "יום ו׳: 7:30 - עד חצי שעה לפני כניסת שבת",
    ],
    instagramHandle: "@cafefiori_",
  },
  tre: {
    slug: "tre",
    name: "TRE",
    logoUrl: "/cafes/tre-logo.png",
    heroUrl: "/illustrations/cafe-hero.png",
    coffeeOfferUrl: "/cafes/tre-iced-coffee.png",
    city: "רמת גן",
    branches: [
      {
        name: "TRE",
        address: "ביאליק 55, רמת גן",
        mapUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("ביאליק 55, רמת גן")}`,
      },
    ],
    openingHours: [],
    instagramHandle: "@tre.cafe",
    offerText: "שתי כוסות קפה או כוס יין",
    offerTextShort: "שתי כוסות קפה או כוס יין לדייט הראשון - עלינו",
    offerFaqAnswer: "שתי כוסות קפה (חם או קר) או כוס יין לבחירתכם, לדייט הראשון שלכם - עלינו.",
  },
};

export function getCafe(slug: string): CafePartner | undefined {
  return CAFE_PARTNERS[slug];
}
