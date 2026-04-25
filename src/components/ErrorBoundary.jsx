import { Component } from 'react'
import { supabase } from '../lib/supabase'

// Logs an error to the client_errors table in Supabase.
// Called by both the ErrorBoundary and the global unhandledrejection listener.
async function logClientError({ errorMessage, stackTrace, componentStack, pageUrl }) {
  try {
    // Best-effort attempt to get tenant_id and user_id from current auth session
    let userId = null
    let tenantId = null
    try {
      const { data: { session } } = await supabase.auth.getSession()
      userId = session?.user?.id ?? null
      if (userId) {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('company_id')
          .eq('user_id', userId)
          .single()
        tenantId = profile?.company_id ?? null
      }
    } catch {
      // ignore — we still want to log the error even if we can't resolve the user
    }

    await supabase.from('client_errors').insert({
      user_id: userId,
      tenant_id: tenantId,
      error_message: errorMessage?.slice(0, 2000) ?? 'Unknown error',
      stack_trace: stackTrace?.slice(0, 10000) ?? null,
      component_stack: componentStack?.slice(0, 5000) ?? null,
      page_url: pageUrl ?? window.location.href,
    })
  } catch {
    // Swallow — error logging must never throw
  }
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    logClientError({
      errorMessage: error?.message ?? String(error),
      stackTrace: error?.stack ?? null,
      componentStack: errorInfo?.componentStack ?? null,
      pageUrl: window.location.href,
    })
  }

  componentDidMount() {
    // Catch unhandled promise rejections globally
    this._onUnhandledRejection = (event) => {
      const reason = event.reason
      logClientError({
        errorMessage: `[promise] ${reason?.message ?? String(reason)}`,
        stackTrace: reason?.stack ?? null,
        componentStack: null,
        pageUrl: window.location.href,
      })
    }
    window.addEventListener('unhandledrejection', this._onUnhandledRejection)
  }

  componentWillUnmount() {
    if (this._onUnhandledRejection) {
      window.removeEventListener('unhandledrejection', this._onUnhandledRejection)
    }
  }

  render() {
    if (this.state.hasError) {
      const errorMsg = this.state.error?.message ?? 'An unexpected error occurred'
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
            maxWidth: 440,
            textAlign: 'center',
          }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>
              Something went wrong
            </h2>
            <p style={{ color: 'var(--color-text-muted, #999)', fontSize: 14, marginBottom: 24 }}>
              We've been notified. You can try reloading the page.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={() => window.location.reload()}
                style={{
                  padding: '10px 24px',
                  background: 'var(--color-primary, #2e8bff)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                Reload
              </button>
              <button
                onClick={() => {
                  // Open the feedback widget by dispatching a custom event
                  // The FeedbackButton listens for this
                  window.dispatchEvent(new CustomEvent('open-feedback', {
                    detail: { prefill: `[Auto] Error: ${errorMsg}` }
                  }))
                }}
                style={{
                  padding: '10px 24px',
                  background: 'none',
                  color: 'var(--color-primary, #2e8bff)',
                  border: '1px solid var(--color-border, #333)',
                  borderRadius: 8,
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                Send feedback
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
