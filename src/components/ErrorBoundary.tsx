import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props { children: ReactNode }
interface State { error: Error | null }

/**
 * Without this, any render-time throw leaves a blank white page and the user
 * has no idea whether the app died or their network did.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[nurj] render error', error, info.componentStack);
  }

  private reset = () => {
    this.setState({ error: null });
    window.location.assign('/');
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="loading-screen">
        <div className="error-boundary">
          <strong>Nurj hit an unexpected problem.</strong>
          <p>Your saved work is safe. Reloading the workspace usually clears this.</p>
          <button className="button button-primary" onClick={this.reset}>Reload Nurj</button>
        </div>
      </main>
    );
  }
}
