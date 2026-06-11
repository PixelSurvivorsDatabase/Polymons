import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import StudioApp from "./StudioApp";
import "./studio.css";
import "./previewBridge";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StudioApp />
  </StrictMode>,
);
