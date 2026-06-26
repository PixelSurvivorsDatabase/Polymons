import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./auth";
import { ErrorBoundary } from "./ErrorBoundary";
import "./styles.css";
import { registerPolymonsServiceWorker } from "./pwa";

if (import.meta.env.MODE === "android") {
  void import("./mobile").then(({ initializeNativeMobileShell }) =>
    initializeNativeMobileShell(),
  );
}

registerPolymonsServiceWorker();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <HashRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </HashRouter>
    </ErrorBoundary>
  </StrictMode>,
);
