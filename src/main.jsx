import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ErrorBoundary from './components/ErrorBoundary'
import App from './App'
import './styles/global.css'

// This is the entry point of the app.
// BrowserRouter enables page navigation without full page reloads.
// AuthProvider wraps everything so login state is available everywhere.
// ErrorBoundary catches uncaught React errors and logs them to client_errors.
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
