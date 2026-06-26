import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import PlayerApp from "./PlayerApp";
import UpdateBanner from "./UpdateBanner";
import { ErrorBoundary } from "../../src/ErrorBoundary";
import "../../src/styles.css";
import "./player.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <PlayerApp />
      <UpdateBanner />
    </ErrorBoundary>
  </StrictMode>,
);
