import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuth } from './context/AuthContext'
import { addBreadcrumb } from './lib/breadcrumbs'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import DashboardPage from './pages/DashboardPage'
import SessionPage from './pages/SessionPage'
import AccuracyTestPage from './pages/AccuracyTestPage'
import ChangePasswordPage from './pages/ChangePasswordPage'
import AccountPage from './pages/AccountPage'
import FeedbackButton from './components/feedback/FeedbackButton'

// Admin layout + sections
import AdminLayout from './pages/admin/AdminLayout'
import OverviewSection from './pages/admin/OverviewSection'
import CompaniesSection from './pages/admin/CompaniesSection'
import UsersSection from './pages/admin/UsersSection'
import PlansSection from './pages/admin/PlansSection'
import TestLogsSection from './pages/admin/TestLogsSection'
import FeedbackSection from './pages/admin/FeedbackSection'
import ErrorsSection from './pages/admin/ErrorsSection'
import SystemSection from './pages/admin/SystemSection'

const ADMIN_EMAIL = 'main@ngautomationhub.com'

// ProtectedRoute wraps pages that require login + completed setup.
function ProtectedRoute({ children }) {
  const { user, loading, setupComplete } = useAuth()

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="spinner" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  if (user.user_metadata?.force_password_change) return <Navigate to="/change-password" replace />
  if (setupComplete === false) return <Navigate to="/register" replace />
  return <>{children}<FeedbackButton /></>
}

// AdminRoute wraps /admin. Requires login AND the hardcoded admin email.
function AdminRoute({ children }) {
  const { user, loading, setupComplete } = useAuth()

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="spinner" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  if (setupComplete === false) return <Navigate to="/register" replace />
  if (user.email !== ADMIN_EMAIL) return <Navigate to="/dashboard" replace />
  return children
}

// RegisterRoute — only accessible if setup is NOT complete.
function RegisterRoute({ children }) {
  const { user, loading, setupComplete } = useAuth()

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="spinner" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  if (setupComplete === true) return <Navigate to="/dashboard" replace />
  return children
}

function RouteBreadcrumbs() {
  const location = useLocation()
  useEffect(() => {
    addBreadcrumb({
      category: 'navigation',
      message: `Navigated to ${location.pathname}`,
      data: { pathname: location.pathname, search: location.search },
    })
  }, [location.pathname, location.search])
  return null
}

export default function App() {
  const { user, loading } = useAuth()

  if (loading) return null

  return (
    <>
    <RouteBreadcrumbs />
    <Routes>
      {/* Public route — login page */}
      <Route
        path="/login"
        element={user ? <Navigate to="/dashboard" replace /> : <LoginPage />}
      />

      {/* Registration / setup — only for users who haven't completed setup */}
      <Route
        path="/register"
        element={<RegisterRoute><RegisterPage /></RegisterRoute>}
      />

      {/* Protected routes — require login + completed setup */}
      <Route
        path="/dashboard"
        element={<ProtectedRoute><DashboardPage /></ProtectedRoute>}
      />
      <Route
        path="/session/:sessionId"
        element={<ProtectedRoute><SessionPage /></ProtectedRoute>}
      />
      <Route
        path="/account"
        element={<ProtectedRoute><AccountPage /></ProtectedRoute>}
      />

      {/* Password change */}
      <Route path="/change-password" element={<ChangePasswordPage />} />

      {/* Admin routes */}
      <Route
        path="/admin"
        element={<AdminRoute><AdminLayout /></AdminRoute>}
      >
        <Route index element={<Navigate to="/admin/overview" replace />} />
        <Route path="overview" element={<OverviewSection />} />
        <Route path="companies" element={<CompaniesSection />} />
        <Route path="users" element={<UsersSection />} />
        <Route path="plans" element={<PlansSection />} />
        <Route path="test-logs" element={<TestLogsSection />} />
        <Route path="feedback" element={<FeedbackSection />} />
        <Route path="errors" element={<ErrorsSection />} />
        <Route path="system" element={<SystemSection />} />
      </Route>
      <Route
        path="/accuracy-test"
        element={<AdminRoute><AccuracyTestPage /></AdminRoute>}
      />

      {/* Default: redirect to dashboard */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
    </>
  )
}
