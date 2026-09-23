import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./App.css";
/* Shared responsive layer: imported after App.css so drawer/backdrop rules win
   over duplicated rail rules in the per-page stylesheets at <=768px. */
import "./Styles/responsive.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
