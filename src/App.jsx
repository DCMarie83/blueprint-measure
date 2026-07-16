import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useAuth } from './context/AuthContext'
import { useIsLite } from './hooks/useIsLite'
import { supabase } from './lib/supabase'
import { addBreadcrumb } from './lib/breadcrumbs'
import { useConversionTracker } from './hooks/useConversionTracker'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import LiteSignupPage from './pages/LiteSignupPage'
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
import AcademyAdminPage from './pages/admin/AcademyAdminPage'
import ResourcesAdminPage from './pages/admin/ResourcesAdminPage'
import FoundersSection from './pages/admin/FoundersSection'
import ImpersonationLogSection from './pages/admin/ImpersonationLogSection'
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
import RivetPayLinkPage from './pages/RivetPayLinkPage'
import AcademyPage from './pages/AcademyPage'
import TimePage from './pages/TimePage'
import CrewMemberPage from './pages/CrewMemberPage'
import ResourcesPage from './pages/ResourcesPage'
import ReportsPage from './pages/ReportsPage'
import InvoiceListPage from './pages/InvoiceListPage'
import InvoiceDetailPage from './pages/InvoiceDetailPage'
import InvoiceForm from './components/invoices/InvoiceForm'
import InvoicePortalPage from './pages/InvoicePortalPage'
import PasswordRecoveryHandler from './components/PasswordRecoveryHandler'
import ImpersonationBanner from './components/ImpersonationBanner'
import SubscriptionGate from './components/auth/SubscriptionGate'
import RecurlyCheckout from './pages/RecurlyCheckout'
import BillingSuccessPage from './pages/BillingSuccessPage'
import BillingCancelPage from './pages/BillingCancelPage'

// Time & Pay Lite surfaces
import LogPage from './pages/lite/LogPage'
import LiteJobsPage from './pages/lite/LiteJobsPage'
import LiteJobDetailPage from './pages/lite/LiteJobDetailPage'
import GCsPage from './pages/lite/GCsPage'
import GCCatalogPage from './pages/lite/GCCatalogPage'

// ProtectedRoute wraps pages that require login + completed setup.
// bypassSubscriptionGate: if true, skip the subscription check (for /settings, /account, /subscribe)
// hideFeedback: if true, don't mount the floating FeedbackButton — used by
// /subscribe, where the fab overlaps the Recurly card iframe on mobile and
// competes with the single card-entry action.
function ProtectedRoute({ children, bypassSubscriptionGate = false, hideFeedback = false }) {
  const { user, loading, setupComplete, company, companyLoading, companyResolved, isSuperAdmin } = useAuth()
  useConversionTracker()

  // Hold the spinner while auth is loading, a company fetch is in flight, OR
  // an authenticated user's company is still UNKNOWN (companyResolved starts
  // false and only flips true once the profile->company fetch chain settles).
  // Without the third clause there is a first-render window where company is
  // null-because-not-fetched-yet, the card wall's `company &&` clause skips,
  // and protected pages flash before the /subscribe redirect.
  if (loading || companyLoading || (user && !companyResolved)) {
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

  // Card-required gate: new trialing signups without a Recurly subscription
  // must add a card before accessing the app. bypassSubscriptionGate routes
  // (like /subscribe itself) are exempt so the checkout page can render.
  if (!bypassSubscriptionGate && !isSuperAdmin && company
    && company.card_required === true
    && company.subscription_status === 'trialing'
    && !company.recurly_subscription_id) {
    return <Navigate to="/subscribe" replace />
  }

  if (bypassSubscriptionGate) return <>{children}{!hideFeedback && <FeedbackButton />}</>
  return <SubscriptionGate>{children}{!hideFeedback && <FeedbackButton />}</SubscriptionGate>
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

// FamilyGate — the ONE place plan-family routing lives. Sits INSIDE
// ProtectedRoute (so login + company are already resolved) and blocks the
// wrong family by deep link, not just by hiding nav.
//   allow="contractor"  → Lite tenants are redirected (to /log)
//   allow="lite"        → contractor tenants are redirected (to /dashboard)
// Holds a spinner until useIsLite resolves so neither family flashes the
// other's UI or gets bounced before the plan row loads.
function FamilyGate({ allow, redirectTo, children }) {
  const { isLite, resolved } = useIsLite()

  if (!resolved) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="spinner" />
      </div>
    )
  }

  if (allow === 'contractor' && isLite) return <Navigate to={redirectTo} replace />
  if (allow === 'lite' && !isLite) return <Navigate to={redirectTo} replace />
  return children
}

// /jobs is shared by both families but renders different surfaces: the kanban
// board for contractors, a flat job list for Lite. Branch instead of redirect.
function JobsRouter() {
  const { isLite, resolved } = useIsLite()

  if (!resolved) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="spinner" />
      </div>
    )
  }

  return isLite ? <LiteJobsPage /> : <KanbanPage />
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
    <ImpersonationBanner />
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
      <Route
        path="/signup/lite"
        element={user ? <Navigate to="/dashboard" replace /> : <LiteSignupPage />}
      />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/portal/:token" element={<PortalPage />} />
      <Route path="/portal/invoice/:token" element={<InvoicePortalPage />} />
      <Route path="/rivetpay/:token" element={<RivetPayLinkPage />} />

      {/* Registration / setup — only for users who haven't completed setup */}
      <Route
        path="/register"
        element={<RegisterRoute><RegisterPage /></RegisterRoute>}
      />

      {/* Protected routes — require login + completed setup */}
      <Route
        path="/dashboard"
        element={<ProtectedRoute><FamilyGate allow="contractor" redirectTo="/log"><DashboardPage /></FamilyGate></ProtectedRoute>}
      />
      <Route
        path="/project/:projectId"
        element={<ProtectedRoute><FamilyGate allow="contractor" redirectTo="/log"><ProjectDetailPage /></FamilyGate></ProtectedRoute>}
      />
      <Route
        path="/session/:sessionId"
        element={<ProtectedRoute><FamilyGate allow="contractor" redirectTo="/log"><SessionPage /></FamilyGate></ProtectedRoute>}
      />
      <Route
        path="/settings"
        element={<ProtectedRoute bypassSubscriptionGate><SettingsPage /></ProtectedRoute>}
      />
      <Route
        path="/subscribe"
        element={<ProtectedRoute bypassSubscriptionGate hideFeedback><RecurlyCheckout /></ProtectedRoute>}
      />
      <Route
        path="/subscribe-recurly"
        element={<Navigate to="/subscribe" replace />}
      />
      <Route
        path="/billing/success"
        element={<ProtectedRoute bypassSubscriptionGate><BillingSuccessPage /></ProtectedRoute>}
      />
      <Route
        path="/billing/cancel"
        element={<ProtectedRoute bypassSubscriptionGate><BillingCancelPage /></ProtectedRoute>}
      />
      <Route
        path="/jobs"
        element={<ProtectedRoute><JobsRouter /></ProtectedRoute>}
      />
      <Route
        path="/clients"
        element={<ProtectedRoute><FamilyGate allow="contractor" redirectTo="/log"><ClientsPage /></FamilyGate></ProtectedRoute>}
      />
      <Route
        path="/clients/:id"
        element={<ProtectedRoute><FamilyGate allow="contractor" redirectTo="/log"><ClientDetailPage /></FamilyGate></ProtectedRoute>}
      />
      <Route
        path="/pricing"
        element={<ContractorAdminRoute><FamilyGate allow="contractor" redirectTo="/log"><PricingPage /></FamilyGate></ContractorAdminRoute>}
      />
      <Route
        path="/estimates/:id"
        element={<ProtectedRoute><FamilyGate allow="contractor" redirectTo="/log"><EstimateDetailPage /></FamilyGate></ProtectedRoute>}
      />
      <Route
        path="/materials/:orderId"
        element={<ProtectedRoute><FamilyGate allow="contractor" redirectTo="/log"><MaterialOrderBuilderPage /></FamilyGate></ProtectedRoute>}
      />

      {/* Time & Pay Lite — sub-facing surfaces (contractor tenants redirected to /dashboard) */}
      <Route
        path="/log"
        element={<ProtectedRoute><FamilyGate allow="lite" redirectTo="/dashboard"><LogPage /></FamilyGate></ProtectedRoute>}
      />
      <Route
        path="/log/job/:id"
        element={<ProtectedRoute><FamilyGate allow="lite" redirectTo="/dashboard"><LiteJobDetailPage /></FamilyGate></ProtectedRoute>}
      />
      <Route
        path="/gcs"
        element={<ProtectedRoute><FamilyGate allow="lite" redirectTo="/dashboard"><GCsPage /></FamilyGate></ProtectedRoute>}
      />
      <Route
        path="/gcs/:clientId/catalog"
        element={<ProtectedRoute><FamilyGate allow="lite" redirectTo="/dashboard"><GCCatalogPage /></FamilyGate></ProtectedRoute>}
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
        path="/time"
        element={<ProtectedRoute><FamilyGate allow="contractor" redirectTo="/log"><TimePage /></FamilyGate></ProtectedRoute>}
      />
      <Route
        path="/time/crew/:id"
        element={<ContractorAdminRoute><CrewMemberPage /></ContractorAdminRoute>}
      />
      <Route
        path="/academy"
        element={<ProtectedRoute><AcademyPage /></ProtectedRoute>}
      />
      <Route
        path="/resources"
        element={<ProtectedRoute><FamilyGate allow="contractor" redirectTo="/log"><ResourcesPage /></FamilyGate></ProtectedRoute>}
      />
      <Route
        path="/reports"
        element={<ProtectedRoute><FamilyGate allow="contractor" redirectTo="/log"><ReportsPage /></FamilyGate></ProtectedRoute>}
      />
      <Route
        path="/account"
        element={<Navigate to="/settings" replace />}
      />

      {/* Contractor admin team management */}
      <Route
        path="/dashboard/team"
        element={<ContractorAdminRoute><FamilyGate allow="contractor" redirectTo="/log"><TeamPage /></FamilyGate></ContractorAdminRoute>}
      />
      <Route
        path="/dashboard/team/:userId"
        element={<ContractorAdminRoute><FamilyGate allow="contractor" redirectTo="/log"><UserDetailPage /></FamilyGate></ContractorAdminRoute>}
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
        <Route path="academy" element={<AcademyAdminPage />} />
        <Route path="resources" element={<ResourcesAdminPage />} />
        <Route path="founders" element={<FoundersSection />} />
        <Route path="impersonation-log" element={<ImpersonationLogSection />} />
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
