import { Link } from "react-router-dom";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    question: 'מה זה "בשעה טובה"?',
    answer: "ערכה פיזית של דייטים מובנים לזוגות לפני חתונה. בכל מפגש - נושא אחר (כסף, אינטימיות, משפחות, חלומות, קונפליקטים). אתם בוחרים מה רלוונטי, קובעים ערב, ומקבלים מסגרת מובנית לשיחות עומק.",
  },
  {
    question: "זה כמו טיפול זוגי?",
    answer: "ממש לא. הערכה היא לא טיפול ולא מחליפה טיפול. כאן יש לכם הזדמנות לגעת בנושאים חשובים לא מתוך משבר - אלא מתוך הסתכלות משותפת על החיים שלכם כזוג. זה לגמרי שלכם, בקצב שלכם וללא הנחיה.",
  },
  {
    question: "כמה מפגשים יש בערכה?",
    answer: "11 נושאים (10 + מפגש סיכום וכתובה). תבחרו כמה שמעניין אתכם - 5-8 זה אידיאלי, אבל אין מינימום או מקסימום. המחיר לא משתנה.",
  },
  {
    question: "איך מזמינים?",
    answer: "ממלאים שאלון התאמה קצר באתר, אני חוזרת אליכם לוודא פרטים, משלמים, ומקבלים ערכה מותאמת אישית עד הבית.",
  },
];

export function FaqPreview() {
  return (
    <section className="px-6 py-20 md:py-28">
      <div className="mx-auto max-w-2xl">
        <h2 className="mb-4 text-center text-3xl font-bold text-foreground md:text-4xl">שאלות ותשובות</h2>
        <p className="mx-auto mb-10 max-w-md text-center text-muted-foreground">תשובות לשאלות שאנחנו שומעים הכי הרבה</p>

        <Accordion type="single" collapsible className="w-full">
          {faqs.map((faq, i) => (
            <AccordionItem key={i} value={`item-${i}`}>
              <AccordionTrigger className="text-right text-base font-medium">{faq.question}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">{faq.answer}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        <div className="mt-8 text-center">
          <Link to="/faq" className="text-sm font-medium text-terracotta-600 transition-colors hover:text-terracotta-500">
            לשאלות ותשובות ←
          </Link>
        </div>
      </div>
    </section>
  );
}
