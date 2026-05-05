import { Component } from 'react';
import { logError } from '../lib/logError';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    error.componentStack = info?.componentStack;
    logError(error, 'critical', { source: 'react_error_boundary' });
  }

  handleReset = () => {
    this.setState({ hasError: false });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: 24,
        }}>
          <div style={{
            background: 'var(--color-surface, #1e1e2e)',
            border: '1px solid var(--color-border, #333)',
            borderRadius: 12,
            padding: '40px 32px',
            maxWidth: 480,
            textAlign: 'center',
          }}>
            <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Something went wrong</h1>
            <p style={{ color: 'var(--color-text-muted, #999)', fontSize: 14, marginBottom: '1.5rem' }}>
              We've been notified and are looking into it. Please try again, or contact{' '}
              <a href="mailto:hello@blueprintmeasure.com" style={{ color: 'var(--color-primary, #2e8bff)' }}>
                hello@blueprintmeasure.com
              </a>{' '}
              if it persists.
            </p>
            <button
              onClick={this.handleReset}
              style={{
                padding: '0.75rem 1.5rem',
                fontSize: '1rem',
                background: 'var(--color-primary, #2563eb)',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
