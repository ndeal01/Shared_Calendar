import { Component } from 'react';

// Catches render/lifecycle errors anywhere below it in the tree and shows a
// friendly fallback instead of leaving the user with a blank white screen.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('Unhandled app error', error, info);
  }

  handleReload = () => {
    this.setState({ hasError: false });
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
          <div className="max-w-md rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-teal-600">Oops</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-900">Something went wrong</h2>
            <p className="mt-2 text-sm text-slate-600">
              An unexpected error occurred. Try reloading the page — your data is safe.
            </p>
            <button
              type="button"
              onClick={this.handleReload}
              className="mt-4 rounded-full bg-teal-600 px-4 py-2 text-sm font-semibold text-white"
            >
              Reload app
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
