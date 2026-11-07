import { useParams, Link } from "react-router-dom";
import { VOUCHERS } from "@/data/vouchers";

export default function Voucher() {
  const { code } = useParams<{ code: string }>();
  const voucher = code ? VOUCHERS[code.toUpperCase()] : undefined;

  if (!voucher) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-6 py-24">
        <div className="text-center">
          <h1 className="mb-3 text-2xl font-bold text-foreground">שובר לא נמצא</h1>
          <p className="mb-6 text-muted-foreground">הקוד שהזנתם לא תואם לשובר פעיל.</p>
          <Link to="/" className="text-sm font-medium text-terracotta-500 underline underline-offset-4 hover:text-terracotta-600">
            חזרה לעמוד הבית
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-12 sm:px-6 sm:py-16">
      <div className="w-full max-w-[480px] overflow-hidden rounded-[20px] border border-terracotta-200 bg-white">
        {/* Header */}
        <div className="px-8 pt-6 pb-4 text-center">
          <img
            src="/logo-booklet.png"
            alt="בשעה טובה"
            className="mx-auto mb-3 block w-[110px]"
          />
          <div className="mb-3.5 text-[13px] font-medium tracking-[1.5px] text-terracotta-500 uppercase">
            שובר מתנה
          </div>
          <div className="mx-auto h-px w-10 bg-terracotta-200" />
        </div>

        {/* Couple */}
        <div className="px-8 pt-3.5 text-center">
          <div className="mb-1.5 text-[30px] font-bold leading-snug text-foreground max-sm:text-[26px]">
            {voucher.coupleNames}
          </div>
          <div className="mb-1 text-[15px] text-[#9B8E82]">
            קיבלתם שובר מתנה מ{voucher.giverName}
          </div>
          <div className="mt-4 text-sm text-[#9B8E82]">
            תאריך הפקת השובר: {voucher.issueDate}
          </div>
        </div>

        {/* Code */}
        <div className="mx-8 mt-8 rounded-[14px] border-[1.5px] border-dashed border-terracotta-200 bg-terracotta-50 px-5 py-5 text-center max-sm:mx-6 max-sm:mt-6">
          <div className="mb-2 text-[11px] font-semibold tracking-[1.5px] text-[#9B8E82] uppercase">
            קוד מימוש
          </div>
          <div className="inline-block text-2xl font-bold tracking-[2px] text-terracotta-600 max-sm:text-xl" dir="ltr">
            {voucher.code}
          </div>
          <div className="mt-2.5 text-xs text-[#9B8E82]">
            בתוקף עד {voucher.expiryDate}
          </div>
        </div>

        {/* Info */}
        <div className="px-8 pt-0 pb-6 text-center max-sm:px-6">
          <div className="mt-6 text-sm leading-relaxed text-[#9B8E82]">
            נכנסים לקישור... ממלאים שאלון קצר... והערכה מגיעה עד הבית
          </div>
        </div>

        {/* CTA */}
        <Link
          to={`/order?voucher=${voucher.code}`}
          className="mx-8 mb-4 block rounded-xl bg-terracotta-500 px-4 py-[15px] text-center text-base font-semibold text-white transition-colors hover:bg-terracotta-600 max-sm:mx-6 max-sm:mb-3"
        >
          למימוש השובר
        </Link>

        {/* Contact */}
        <div className="px-8 pb-6 text-center max-sm:px-6">
          <p className="mb-1.5 text-[13px] font-semibold text-foreground">יש שאלות? אנחנו כאן בשבילכם</p>
          <div className="flex items-center justify-center gap-2 text-[13px]">
            <a href="https://wa.me/972502023669" target="_blank" rel="noopener noreferrer" className="font-semibold text-terracotta-500 hover:text-terracotta-600">וואטסאפ</a>
            <span className="text-[#9B8E82]">·</span>
            <a href="mailto:beshaatova.il@gmail.com" className="font-semibold text-terracotta-500 hover:text-terracotta-600">מייל</a>
            <span className="text-[#9B8E82]">·</span>
            <a href="tel:+972502023669" className="font-semibold text-terracotta-500 hover:text-terracotta-600">טלפון</a>
          </div>
          <div className="mt-2 flex items-center justify-center gap-2 text-[13px]">
            <Link to="/" className="text-terracotta-500 hover:text-terracotta-600">לאתר בשעה טובה</Link>
            <span className="text-[#9B8E82]">·</span>
            <Link to="/faq" className="text-terracotta-500 hover:text-terracotta-600">שאלות נפוצות</Link>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-[#E5DDD7] px-8 py-5 text-center max-sm:px-6 max-sm:py-4">
          <div className="text-[13px] leading-relaxed text-[#9B8E82]">
            <span className="font-semibold text-terracotta-500">בשעה טובה</span> - ערכת שיח מותאמת אישית לזוגות לשיח על הדברים החשובים באמת.
          </div>
        </div>
      </div>
    </div>
  );
}
