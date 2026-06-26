import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "../../src/ErrorBoundary";
import StudioApp from "../renderer/StudioApp";
import { initializeMobileStudioBridge } from "../renderer/mobileBridge";
import "../renderer/studio.css";

async function bootstrap() {
  await initializeMobileStudioBridge();
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <ErrorBoundary>
        <StudioApp />
      </ErrorBoundary>
    </StrictMode>,
  );
}

void bootstrap();
