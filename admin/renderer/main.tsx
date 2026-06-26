import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import AdminApp from "./AdminApp";
import { ErrorBoundary } from "../../src/ErrorBoundary";
import "./admin.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <AdminApp />
    </ErrorBoundary>
  </StrictMode>,
);
