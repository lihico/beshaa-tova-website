import { Navigate } from "react-router-dom";

export default function Gift() {
  return <Navigate to="/order?flow=gift" replace />;
}
