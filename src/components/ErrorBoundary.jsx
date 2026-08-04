import { Component } from 'react';
import i18n from '../lib/i18n';
import { logError } from '../lib/logError';
import { SUPPORT } from '../lib/config';

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
            <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>{i18n.t('misc:errorBoundary.title')}</h1>
            <p style={{ color: 'var(--color-text-muted, #999)', fontSize: 14, marginBottom: '1.5rem' }}>
              {i18n.t('misc:errorBoundary.bodyBefore')}{' '}
              <a href={"mailto:" + SUPPORT.email} style={{ color: 'var(--color-primary, #2e8bff)' }}>
                {SUPPORT.email}
              </a>{' '}
              {i18n.t('misc:errorBoundary.bodyAfter')}
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
              {i18n.t('misc:errorBoundary.reload')}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
