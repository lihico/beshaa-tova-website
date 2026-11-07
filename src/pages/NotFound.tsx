import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

const ease = [0.25, 0.1, 0.25, 1] as const;

export default function NotFound() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease }}
      className="px-6 py-24 md:py-32"
    >
      <div className="mx-auto max-w-md text-center">
        <img
          src="/illustrations/404-booklet.png"
          alt=""
          className="mx-auto mb-8 h-40 w-40 object-contain illustration-fade"
        />
        <h1 className="mb-3 text-3xl font-bold text-foreground">
          הגעתם למקום שעוד לא כתבנו
        </h1>
        <p className="mb-8 text-muted-foreground">
          העמוד הזה לא קיים, אבל יש עוד הרבה מה לגלות.
        </p>
        <Button size="lg" asChild>
          <Link to="/">חזרה לעמוד הבית</Link>
        </Button>
      </div>
    </motion.div>
  );
}
