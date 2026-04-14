import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import SessionPage from './pages/SessionPage'
import AdminPage from './pages/AdminPage'

// The only email address that can access /admin.
const ADMIN_EMAIL = 'main@ngautomationhub.com'

// ProtectedRoute wraps pages that require a login.
// If the user isn't logged in, they get sent to /login automatically.
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="spinner" />
      </div>
    )
  }

  return user ? children : <Navigate to="/login" replace />
}

// AdminRoute wraps /admin. Requires login AND the hardcoded admin email.
// Any other logged-in user gets silently redirected to /dashboard.
function AdminRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="spinner" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  if (user.email !== ADMIN_EMAIL) return <Navigate to="/dashboard" replace />
  return children
}

export default function App() {
  const { user, loading } = useAuth()

  if (loading) return null

  return (
    <Routes>
      {/* Public route — login page */}
      <Route
        path="/login"
        element={user ? <Navigate to="/dashboard" replace /> : <LoginPage />}
      />

      {/* Protected routes — require login */}
      <Route
        path="/dashboard"
        element={<ProtectedRoute><DashboardPage /></ProtectedRoute>}
      />
      <Route
        path="/session/:sessionId"
        element={<ProtectedRoute><SessionPage /></ProtectedRoute>}
      />

      {/* Admin route — only accessible to ADMIN_EMAIL */}
      <Route
        path="/admin"
        element={<AdminRoute><AdminPage /></AdminRoute>}
      />

      {/* Default: redirect to dashboard (or login if not authed) */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
