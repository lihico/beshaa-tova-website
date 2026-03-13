import { Link } from "react-router-dom";

export function MeetLihi() {
  return (
    <section className="bg-warm-gray-50 px-6 py-20 md:py-28">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col items-center gap-10 md:flex-row">
          <div className="flex-shrink-0">
            <img src="/illustrations/meet-lihi.png" alt="שני כוסות קפה וחוברת" className="h-48 w-48 rounded-2xl object-contain md:h-56 md:w-56" />
          </div>
          <div>
            <h2 className="mb-4 text-2xl font-bold text-foreground md:text-3xl">נעים מאוד. אני ליהי.</h2>
            <p className="mb-4 leading-relaxed text-muted-foreground">
              דוקטורנטית לפסיכולוגיה. לפני שנה התחתנתי. בתוך ההתארגנויות הלוגיסטיות - הדיג׳יי, סידורי השולחן והשמלה - רצינו שהחתונה תהיה הזדמנות להעמיק את הקשר ואת ההסתכלות המשותפת קדימה.
            </p>
            <p className="mb-4 leading-relaxed text-muted-foreground">
              אז קבענו לעצמנו דייט קבוע - פעם בשבוע יצאנו לבית קפה או לפארק, קראנו ספרים, שמענו פודקאסטים, ובכל פעם דיברנו על נושא אחר - איך נראית השבת, על איזה הרגלים לעולם לא נוותר, איך מדברים כשיש חיכוך, כסף, השגרה, והערכים המשותפים שלנו.
            </p>
            <p className="mb-4 leading-relaxed text-muted-foreground">
              המפגשים האלה היו כל כך משמעותיים עבורנו שהפכנו אותם לכתובה שעליה חתמנו לפני החופה. היום היא תלויה אצלנו בבית. יום אחד עברתי לידה, חשבתי על חברים שהתחתנו וסיפרו שטובעים בים של ספקים והחלטות קטנות, ואמרתי לעצמי - אני רוצה לתת את המתנה הזו לזוגות אחרים.
            </p>
            <p className="mb-4 font-medium leading-relaxed text-terracotta-700">
              להרחיב את ה&quot;בשעה טובה&quot; של האירוסין לשעות טובות, של שיחות עומק על הדברים החשובים באמת.
            </p>
            <Link to="/about" className="text-sm font-medium text-terracotta-600 transition-colors hover:text-terracotta-500">
              לקרוא את הסיפור המלא ←
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
