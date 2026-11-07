import { Navigate } from "react-router-dom";

/**
 * קישורי /preview ישנים מופנים לדף הבית (אותה גרסת נחיתה).
 */
export default function HomePreview() {
  return <Navigate to="/" replace />;
}
