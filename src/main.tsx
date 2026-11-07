import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { App } from "./App";
import { captureTouch } from "./lib/attribution";
import "./index.css";

// Before the first render: /gift redirects to /order and drops the query string.
captureTouch();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
      <Analytics />
      <SpeedInsights />
    </BrowserRouter>
  </StrictMode>
);
