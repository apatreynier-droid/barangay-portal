import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./Styles/Shared/global.css";
/* Shared responsive layer: imported after App.css so drawer/backdrop rules win
   over duplicated rail rules in the per-page stylesheets at <=768px. */
import "./Styles/responsive.css";
import { initTheme } from "./Utils/Shared/useTheme";

/* Apply the saved (or system) theme before the first paint so the page
   never flashes the wrong colors. */
initTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
