import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./Styles/Shared/global.css";
import "./Styles/responsive.css";
import "./Styles/Shared/theme.css";
import { initTheme } from "./Utils/Shared/useTheme";

/* Apply the saved (or system) theme before the first paint so the page
   never flashes the wrong colors. */
initTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
