import { Component, type ErrorInfo, type ReactNode } from "react";
import "./ErrorBoundary.css";

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  failed: boolean;
};

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Polymons UI crashed.", error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="fatal-error" role="alert">
        <div>
          <span>Polymons hit a problem</span>
          <h1>This page could not finish loading.</h1>
          <p>Your account and projects are safe. Reload to try again.</p>
          <button type="button" onClick={() => window.location.reload()}>
            Reload Polymons
          </button>
        </div>
      </main>
    );
  }
}
