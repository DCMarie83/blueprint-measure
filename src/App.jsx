import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useAuth } from './context/AuthContext'
import { supabase } from './lib/supabase'
import { addBreadcrumb } from './lib/breadcrumbs'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import TermsPage from './pages/TermsPage'
import PrivacyPage from './pages/PrivacyPage'
import RegisterPage from './pages/RegisterPage'
import DashboardPage from './pages/DashboardPage'
import SessionPage from './pages/SessionPage'
import AccuracyTestPage from './pages/AccuracyTestPage'
import ChangePasswordPage from './pages/ChangePasswordPage'
import AccountPage from './pages/AccountPage'
import SettingsPage from './pages/SettingsPage'
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
import UserDetailPage from './pages/admin/UserDetailPage'
import TeamPage from './pages/TeamPage'
import ProjectDetailPage from './pages/ProjectDetailPage'
import KanbanPage from './pages/KanbanPage'
import ClientsPage from './pages/ClientsPage'
import ClientDetailPage from './pages/ClientDetailPage'
import PricingPage from './pages/PricingPage'
import EstimateDetailPage from './pages/EstimateDetailPage'
import MaterialOrderBuilderPage from './pages/MaterialOrderBuilderPage'
import PortalPage from './pages/PortalPage'
import AcademyPage from './pages/AcademyPage'
import ReportsPage from './pages/ReportsPage'
import InvoiceListPage from './pages/InvoiceListPage'
import InvoiceDetailPage from './pages/InvoiceDetailPage'
import InvoiceForm from './components/invoices/InvoiceForm'
import InvoicePortalPage from './pages/InvoicePortalPage'
import PasswordRecoveryHandler from './components/PasswordRecoveryHandler'
import SubscriptionGate from './components/auth/SubscriptionGate'

// ProtectedRoute wraps pages that require login + completed setup.
// bypassSubscriptionGate: if true, skip the subscription check (for /settings, /account)
function ProtectedRoute({ children, bypassSubscriptionGate = false }) {
  const { user, loading, setupComplete } = useAuth()

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="spinner" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  if (sessionStorage.getItem('bpm_password_recovery_pending') === 'true') return <Navigate to="/change-password" replace />
  if (user.user_metadata?.force_password_change) return <Navigate to="/change-password" replace />
  if (setupComplete === false) return <Navigate to="/register" replace />
  if (bypassSubscriptionGate) return <>{children}<FeedbackButton /></>
  return <SubscriptionGate>{children}<FeedbackButton /></SubscriptionGate>
}

// AdminRoute wraps /admin. Requires login AND super-admin status from the database.
function AdminRoute({ children }) {
  const { user, loading, setupComplete, isSuperAdmin, superAdminChecked } = useAuth()

  if (loading || !superAdminChecked) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="spinner" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  if (setupComplete === false) return <Navigate to="/register" replace />
  if (!isSuperAdmin) return <Navigate to="/jobs" replace />
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
  if (setupComplete === true) return <Navigate to="/jobs" replace />
  return children
}

// ContractorAdminRoute — requires login + completed setup + contractor_admin or super_admin role.
// Role check is soft — RLS enforces real access. This just prevents non-admins from seeing the page.
function ContractorAdminRoute({ children }) {
  const { user, loading, setupComplete, isSuperAdmin, superAdminChecked } = useAuth()
  const [allowed, setAllowed] = useState(null)

  useEffect(() => {
    if (!user || loading || !superAdminChecked) return
    async function check() {
      if (isSuperAdmin) { setAllowed(true); return }
      const { data } = await supabase.from('user_profiles').select('role').eq('user_id', user.id).maybeSingle()
      setAllowed(data?.role === 'contractor_admin')
    }
    check()
  }, [user, loading, isSuperAdmin, superAdminChecked])

  if (loading || allowed === null) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="spinner" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  if (setupComplete === false) return <Navigate to="/register" replace />
  if (!allowed) return <Navigate to="/jobs" replace />
  return <>{children}<FeedbackButton /></>
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
    <PasswordRecoveryHandler />
    <Routes>
      {/* Public routes */}
      <Route
        path="/login"
        element={user ? <Navigate to="/dashboard" replace /> : <LoginPage />}
      />
      <Route
        path="/signup"
        element={user ? <Navigate to="/dashboard" replace /> : <SignupPage />}
      />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/portal/:token" element={<PortalPage />} />
      <Route path="/portal/invoice/:token" element={<InvoicePortalPage />} />

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
        path="/project/:projectId"
        element={<ProtectedRoute><ProjectDetailPage /></ProtectedRoute>}
      />
      <Route
        path="/session/:sessionId"
        element={<ProtectedRoute><SessionPage /></ProtectedRoute>}
      />
      <Route
        path="/settings"
        element={<ProtectedRoute bypassSubscriptionGate><SettingsPage /></ProtectedRoute>}
      />
      <Route
        path="/jobs"
        element={<ProtectedRoute><KanbanPage /></ProtectedRoute>}
      />
      <Route
        path="/clients"
        element={<ProtectedRoute><ClientsPage /></ProtectedRoute>}
      />
      <Route
        path="/clients/:id"
        element={<ProtectedRoute><ClientDetailPage /></ProtectedRoute>}
      />
      <Route
        path="/pricing"
        element={<ContractorAdminRoute><PricingPage /></ContractorAdminRoute>}
      />
      <Route
        path="/estimates/:id"
        element={<ProtectedRoute><EstimateDetailPage /></ProtectedRoute>}
      />
      <Route
        path="/materials/:orderId"
        element={<ProtectedRoute><MaterialOrderBuilderPage /></ProtectedRoute>}
      />
      <Route
        path="/invoices"
        element={<ProtectedRoute><InvoiceListPage /></ProtectedRoute>}
      />
      <Route
        path="/invoices/new"
        element={<ProtectedRoute><InvoiceForm /></ProtectedRoute>}
      />
      <Route
        path="/invoices/:id"
        element={<ProtectedRoute><InvoiceDetailPage /></ProtectedRoute>}
      />
      <Route
        path="/academy"
        element={<ProtectedRoute><AcademyPage /></ProtectedRoute>}
      />
      <Route
        path="/reports"
        element={<ProtectedRoute><ReportsPage /></ProtectedRoute>}
      />
      <Route
        path="/account"
        element={<Navigate to="/settings" replace />}
      />

      {/* Contractor admin team management */}
      <Route
        path="/dashboard/team"
        element={<ContractorAdminRoute><TeamPage /></ContractorAdminRoute>}
      />
      <Route
        path="/dashboard/team/:userId"
        element={<ContractorAdminRoute><UserDetailPage /></ContractorAdminRoute>}
      />
      <Route
        path="/dashboard/errors"
        element={<ContractorAdminRoute><ErrorsSection /></ContractorAdminRoute>}
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
        <Route path="users/:userId" element={<UserDetailPage />} />
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
