import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
// i18n runtime — initialize before App renders so the first paint has the
// resolved language and document.documentElement.lang is already stamped.
import './lib/i18n'
import { AuthProvider } from './context/AuthContext'
import { ImpersonationProvider } from './context/ImpersonationContext'
import { ThemeProvider } from './context/ThemeContext'
import { PlansProvider } from './context/PlansContext'
import ErrorBoundary from './components/ErrorBoundary'
import App from './App'
import './styles/global.css'
import './styles/tokens.css'

// Instrumentation — must import before anything else that uses fetch/console
import './lib/consoleInstrumentation'
import './lib/fetchInstrumentation'

import { logError } from './lib/logError'
import { addBreadcrumb } from './lib/breadcrumbs'

// auth-js lock-acquire timeouts (e.g. NavigatorLockAcquireTimeoutError) are
// recoverable lock-recovery noise, not failures — keep them out of System Errors.
function isAuthLockTimeout(err) {
  return !!err && (err.isAcquireTimeout === true || /LockAcquireTimeoutError/.test(err.name || ''))
}

// Global error listeners
window.addEventListener('error', (event) => {
  if (isAuthLockTimeout(event.error)) return
  logError(event.error || event.message, 'error', {
    source: 'window_error',
    filename: event.filename,
    lineno: event.lineno,
  })
})

window.addEventListener('unhandledrejection', (event) => {
  if (isAuthLockTimeout(event.reason)) return
  const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason))
  logError(error, 'error', { source: 'unhandled_rejection' })
})

// Click breadcrumbs
document.addEventListener('click', (event) => {
  const target = event.target.closest('button, a, [role="button"]')
  if (!target) return
  const label = (target.innerText || target.getAttribute('aria-label') || target.id || '').trim().slice(0, 80)
  addBreadcrumb({
    category: 'click',
    message: `Clicked "${label || '[unlabeled]'}"`,
    data: { tag: target.tagName.toLowerCase(), id: target.id || null },
  })
}, true)

// Form submit breadcrumbs
document.addEventListener('submit', (event) => {
  const form = event.target
  addBreadcrumb({
    category: 'form',
    message: `Form submitted: ${form.id || form.getAttribute('name') || '[unnamed]'}`,
    data: { id: form.id || null, method: form.method || 'GET' },
  })
}, true)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <ImpersonationProvider>
            <PlansProvider>
              <ThemeProvider>
                <App />
              </ThemeProvider>
            </PlansProvider>
          </ImpersonationProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
