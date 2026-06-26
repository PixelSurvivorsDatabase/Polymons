import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import StudioApp from "./StudioApp";
import UpdateBanner from "./UpdateBanner";
import { ErrorBoundary } from "../../src/ErrorBoundary";
import "./studio.css";
import "./previewBridge";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <StudioApp />
      <UpdateBanner />
    </ErrorBoundary>
  </StrictMode>,
);
