import React from 'react';
import { captureError } from '../lib/observability';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  failed: boolean;
}

/**
 * Last line of defence for rendering errors. Shows a sentence in pt-BR (never the raw
 * error) and reports the exception to Sentry when error reporting is enabled.
 */
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    captureError(error, { componentStack: info.componentStack ?? '' });
  }

  render(): React.ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-xl font-semibold text-gray-900">Algo não funcionou como esperado</h1>
          <p className="text-sm text-gray-600">
            Recarregue a página para continuar. Se o problema continuar, tente de novo mais tarde.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Recarregar página
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
