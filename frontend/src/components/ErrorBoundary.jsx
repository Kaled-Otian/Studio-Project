import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          minHeight: '100dvh', background: '#0a0f1a', color: '#f8fafc',
          fontFamily: "'Inter', system-ui, sans-serif", padding: '24px'
        }}>
          <div style={{ textAlign: 'center', maxWidth: '420px' }}>
            <div style={{ fontSize: '3rem', marginBottom: '16px' }}>⚠️</div>
            <h2 style={{ margin: '0 0 8px', fontSize: '1.25rem', fontWeight: 600 }}>Something went wrong</h2>
            <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '24px' }}>
              An unexpected error occurred. Please refresh the page to try again.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '10px 24px', borderRadius: '8px', border: 'none',
                background: '#c87212', color: '#fff', fontWeight: 600,
                cursor: 'pointer', fontSize: '0.9rem'
              }}
            >
              Refresh Page
            </button>
            {this.state.error && (
              <details style={{ marginTop: '20px', textAlign: 'left', background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '8px', fontSize: '0.75rem', color: '#64748b' }}>
                <summary style={{ cursor: 'pointer', marginBottom: '8px' }}>Error Details</summary>
                <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{this.state.error.toString()}</pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
