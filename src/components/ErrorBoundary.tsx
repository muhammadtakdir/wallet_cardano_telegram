"use client";

import React from "react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("=== ERROR BOUNDARY CAUGHT ERROR ===");
    console.error("Error:", error);
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);
    console.error("Component stack:", errorInfo.componentStack);
    console.error("=== END ERROR DETAILS ===");
    
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-red-50 dark:bg-red-900/20 p-4">
          <div className="max-w-2xl mx-auto">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
              <h1 className="text-2xl font-bold text-red-600 mb-4">
                ⚠️ Something went wrong
              </h1>
              
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  Error Message:
                </h2>
                <pre className="bg-red-100 dark:bg-red-900/30 p-3 rounded-lg text-sm text-red-800 dark:text-red-200 overflow-auto">
                  {this.state.error?.message || "Unknown error"}
                </pre>
              </div>

              <div className="mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  Error Type:
                </h2>
                <pre className="bg-gray-100 dark:bg-gray-900 p-3 rounded-lg text-sm text-gray-800 dark:text-gray-200 overflow-auto">
                  {this.state.error?.name || "Error"}
                </pre>
              </div>

              {this.state.error?.stack && (
                <div className="mb-4">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    Stack Trace:
                  </h2>
                  <pre className="bg-gray-100 dark:bg-gray-900 p-3 rounded-lg text-xs text-gray-800 dark:text-gray-200 overflow-auto max-h-48">
                    {this.state.error.stack}
                  </pre>
                </div>
              )}

              {this.state.errorInfo?.componentStack && (
                <div className="mb-4">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    Component Stack:
                  </h2>
                  <pre className="bg-gray-100 dark:bg-gray-900 p-3 rounded-lg text-xs text-gray-800 dark:text-gray-200 overflow-auto max-h-48">
                    {this.state.errorInfo.componentStack}
                  </pre>
                </div>
              )}

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    this.setState({ hasError: false, error: null, errorInfo: null });
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Try Again
                </button>
                <button
                  onClick={() => {
                    localStorage.clear();
                    window.location.reload();
                  }}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  Clear Data & Reload
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
