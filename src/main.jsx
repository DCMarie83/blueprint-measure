import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ErrorBoundary from './components/ErrorBoundary'
import App from './App'
import './styles/global.css'

// Instrumentation — must import before anything else that uses fetch/console
import './lib/consoleInstrumentation'
import './lib/fetchInstrumentation'

import { logError } from './lib/logError'
import { addBreadcrumb } from './lib/breadcrumbs'

// Global error listeners
window.addEventListener('error', (event) => {
  logError(event.error || event.message, 'error', {
    source: 'window_error',
    filename: event.filename,
    lineno: event.lineno,
  })
})

window.addEventListener('unhandledrejection', (event) => {
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
          <App />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
