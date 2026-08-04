import { Routes, Route, Navigate, useLocation, Outlet } from 'react-router-dom'
import { useState, useEffect, lazy, Suspense } from 'react'
import { useAuth } from './context/AuthContext'
import { useIsLite } from './hooks/useIsLite'
import { supabase } from './lib/supabase'
import { addBreadcrumb } from './lib/breadcrumbs'
import { useConversionTracker } from './hooks/useConversionTracker'
import { initAnalytics } from './lib/analytics'
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
import MaterialsCatalogSection from './pages/admin/MaterialsCatalogSection'
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
import SmartBidPage from './pages/SmartBidPage'
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
import GCInvoiceReviewPage from './pages/GCInvoiceReviewPage'
import PasswordRecoveryHandler from './components/PasswordRecoveryHandler'
import ImpersonationBanner from './components/ImpersonationBanner'
import SubscriptionGate from './components/auth/SubscriptionGate'
import RecurlyCheckout from './pages/RecurlyCheckout'
import BillingSuccessPage from './pages/BillingSuccessPage'
import BillingCancelPage from './pages/BillingCancelPage'
import AppLayout from './components/AppLayout'

// Time & Pay Lite surfaces
import LiteHomePage from './pages/lite/LiteHomePage'
import LogPage from './pages/lite/LogPage'
import LiteJobsPage from './pages/lite/LiteJobsPage'
import LiteJobDetailPage from './pages/lite/LiteJobDetailPage'
import GCsPage from './pages/lite/GCsPage'
import GCCatalogPage from './pages/lite/GCCatalogPage'
import LiteInvoicesPage from './pages/lite/LiteInvoicesPage'
import LiteInvoiceDetailPage from './pages/lite/LiteInvoiceDetailPage'
import LiteBusinessInfoPage from './pages/lite/LiteBusinessInfoPage'
import LiteReportsPage from './pages/lite/LiteReportsPage'

// Public "Try It Yourself" demo (/try) — lazy-split so the whole demo stays
// out of the main bundle. This is the app's first React.lazy boundary; the
// static TryLoading is the Suspense fallback and must be immediately available.
import TryLoading from './pages/try/TryLoading'
const TryLayout = lazy(() => import('./pages/try/TryLayout'))
const TryHub = lazy(() => import('./pages/try/TryHub'))
const TrySubFlow = lazy(() => import('./pages/try/TrySubFlow'))
const TryGcMenu = lazy(() => import('./pages/try/TryGcMenu'))
const TryEstimateFlow = lazy(() => import('./pages/try/TryEstimateFlow'))
const TryCrewFlow = lazy(() => import('./pages/try/TryCrewFlow'))
const TryInvoicingPeek = lazy(() => import('./pages/try/TryInvoicingPeek'))
const TryReportingPeek = lazy(() => import('./pages/try/TryReportingPeek'))
const TryBlueprintPeek = lazy(() => import('./pages/try/TryBlueprintPeek'))
const TryClientsPeek = lazy(() => import('./pages/try/TryClientsPeek'))
const TryJobsFlow = lazy(() => import('./pages/try/TryJobsFlow'))
const TrySubInvoiceReveal = lazy(() => import('./pages/try/TrySubInvoiceReveal'))
const TryEstimateReveal = lazy(() => import('./pages/try/TryEstimateReveal'))
const TryPayStatementReveal = lazy(() => import('./pages/try/TryPayStatementReveal'))
const TryEndScreen = lazy(() => import('./pages/try/TryEndScreen'))

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

  // Outlet mode: when used as a parent layout route (no children), render the
  // matched child route via <Outlet/>. Existing children call sites are unchanged.
  const body = children ?? <Outlet />
  if (bypassSubscriptionGate) return <>{body}{!hideFeedback && <FeedbackButton />}</>
  return <SubscriptionGate>{body}{!hideFeedback && <FeedbackButton />}</SubscriptionGate>
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
  return children ?? <Outlet />
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
  return children ?? <Outlet />
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
  return <>{children ?? <Outlet />}<FeedbackButton /></>
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
  return children ?? <Outlet />
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

// /invoices is shared by both families: the contractor list vs the Lite list,
// and likewise for the detail page. Branch instead of redirect so the Lite nav's
// Invoices link and deep links to a specific invoice both land correctly.
function InvoicesRouter() {
  const { isLite, resolved } = useIsLite()
  if (!resolved) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="spinner" />
      </div>
    )
  }
  return isLite ? <LiteInvoicesPage /> : <InvoiceListPage />
}

function InvoiceDetailRouter() {
  const { isLite, resolved } = useIsLite()
  if (!resolved) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="spinner" />
      </div>
    )
  }
  return isLite ? <LiteInvoiceDetailPage /> : <InvoiceDetailPage />
}

function ReportsRouter() {
  const { isLite, resolved } = useIsLite()
  if (!resolved) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="spinner" />
      </div>
    )
  }
  return isLite ? <LiteReportsPage /> : <ReportsPage />
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

// /founders is a marketing entry point that must funnel to signup while carrying
// its tracking query string intact (e.g. /founders?utm_source=x → /signup?utm_source=x).
function FoundersRedirect() {
  const location = useLocation()
  return <Navigate to={{ pathname: '/signup', search: location.search }} replace />
}

export default function App() {
  const { user, loading } = useAuth()

  // Initialize product analytics once, at the app root — NEVER from AuthContext
  // or any auth listener (onAuthStateChange must stay synchronous). No-ops until
  // POSTHOG_KEY is configured.
  useEffect(() => { initAnalytics() }, [])

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
      <Route path="/founders" element={<FoundersRedirect />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/portal/:token" element={<PortalPage />} />
      <Route path="/portal/invoice/:token" element={<InvoicePortalPage />} />
      <Route path="/gc/invoice/:token" element={<GCInvoiceReviewPage />} />
      <Route path="/rivetpay/:token" element={<RivetPayLinkPage />} />

      {/* Public "Try It Yourself" demo — fully public (no ProtectedRoute, no
          gate, no user-redirect). Lazy-loaded behind a single Suspense
          boundary; TryLayout renders once and children swap via <Outlet/>. */}
      <Route
        path="/try"
        element={
          <Suspense fallback={<TryLoading />}>
            <TryLayout />
          </Suspense>
        }
      >
        <Route index element={<TryHub />} />
        <Route path="sub" element={<TrySubFlow />} />
        <Route path="sub/reveal" element={<TrySubInvoiceReveal />} />
        <Route path="gc" element={<TryGcMenu />} />
        <Route path="gc/estimate" element={<TryEstimateFlow />} />
        <Route path="gc/estimate/reveal" element={<TryEstimateReveal />} />
        <Route path="gc/crew" element={<TryCrewFlow />} />
        <Route path="gc/crew/reveal" element={<TryPayStatementReveal />} />
        <Route path="gc/jobs" element={<TryJobsFlow />} />
        <Route path="gc/clients" element={<TryClientsPeek />} />
        <Route path="gc/invoicing" element={<TryInvoicingPeek />} />
        <Route path="gc/reporting" element={<TryReportingPeek />} />
        <Route path="gc/blueprint" element={<TryBlueprintPeek />} />
        <Route path="done" element={<TryEndScreen />} />
      </Route>

      {/* Registration / setup — only for users who haven't completed setup */}
      <Route
        path="/register"
        element={<RegisterRoute><RegisterPage /></RegisterRoute>}
      />

      {/* Protected routes — require login + completed setup.

          Header-bearing pages now nest under <AppLayout/> (renders AppHeader once
          + <Outlet/>), grouped by EXACT guard signature so every route keeps its
          original guard chain and props. The guards run as parent layout routes
          (Outlet mode) so they resolve BEFORE the header paints. Routes that must
          NOT show the app header stay flat with their original guard chain. */}

      {/* Stay OUTSIDE the app layout (no AppHeader) — prior guard chains verbatim. */}
      <Route
        path="/session/:sessionId"
        element={<ProtectedRoute><FamilyGate allow="contractor" redirectTo="/log"><SessionPage /></FamilyGate></ProtectedRoute>}
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
        path="/account"
        element={<Navigate to="/settings" replace />}
      />
      <Route
        path="/dashboard/team/:userId"
        element={<ContractorAdminRoute><FamilyGate allow="contractor" redirectTo="/log"><UserDetailPage /></FamilyGate></ContractorAdminRoute>}
      />
      <Route
        path="/dashboard/errors"
        element={<ContractorAdminRoute><ErrorsSection /></ContractorAdminRoute>}
      />

      {/* Group A — ProtectedRoute (plain) + AppLayout */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/jobs" element={<JobsRouter />} />
          <Route path="/invoices" element={<InvoicesRouter />} />
          <Route path="/invoices/:id" element={<InvoiceDetailRouter />} />
          <Route path="/reports" element={<ReportsRouter />} />
          <Route path="/academy" element={<AcademyPage />} />
          <Route path="/resources" element={<ResourcesPage />} />
        </Route>
      </Route>

      {/* Group B — ProtectedRoute bypassSubscriptionGate + AppLayout */}
      <Route element={<ProtectedRoute bypassSubscriptionGate />}>
        <Route element={<AppLayout />}>
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/billing/success" element={<BillingSuccessPage />} />
          <Route path="/billing/cancel" element={<BillingCancelPage />} />
        </Route>
      </Route>

      {/* Group C — ProtectedRoute + FamilyGate allow=contractor redirectTo=/home + AppLayout */}
      <Route element={<ProtectedRoute />}>
        <Route element={<FamilyGate allow="contractor" redirectTo="/home" />}>
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
          </Route>
        </Route>
      </Route>

      {/* Group D — ProtectedRoute + FamilyGate allow=contractor redirectTo=/log + AppLayout */}
      <Route element={<ProtectedRoute />}>
        <Route element={<FamilyGate allow="contractor" redirectTo="/log" />}>
          <Route element={<AppLayout />}>
            <Route path="/project/:projectId" element={<ProjectDetailPage />} />
            <Route path="/clients" element={<ClientsPage />} />
            <Route path="/clients/:id" element={<ClientDetailPage />} />
            <Route path="/projects/:projectId/smart-bid" element={<SmartBidPage />} />
            <Route path="/estimates/:id" element={<EstimateDetailPage />} />
            <Route path="/materials/:orderId" element={<MaterialOrderBuilderPage />} />
            <Route path="/time" element={<TimePage />} />
          </Route>
        </Route>
      </Route>

      {/* Group E — ProtectedRoute + FamilyGate allow=contractor redirectTo=/invoices + AppLayout */}
      <Route element={<ProtectedRoute />}>
        <Route element={<FamilyGate allow="contractor" redirectTo="/invoices" />}>
          <Route element={<AppLayout />}>
            <Route path="/invoices/new" element={<InvoiceForm />} />
          </Route>
        </Route>
      </Route>

      {/* Group F — ProtectedRoute + FamilyGate allow=lite redirectTo=/dashboard + AppLayout */}
      <Route element={<ProtectedRoute />}>
        <Route element={<FamilyGate allow="lite" redirectTo="/dashboard" />}>
          <Route element={<AppLayout />}>
            <Route path="/home" element={<LiteHomePage />} />
            <Route path="/log" element={<LogPage />} />
            <Route path="/log/job/:id" element={<LiteJobDetailPage />} />
            <Route path="/gcs" element={<GCsPage />} />
            <Route path="/business" element={<LiteBusinessInfoPage />} />
            <Route path="/gcs/:clientId/catalog" element={<GCCatalogPage />} />
          </Route>
        </Route>
      </Route>

      {/* Group G — ContractorAdminRoute (plain) + AppLayout */}
      <Route element={<ContractorAdminRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/time/crew/:id" element={<CrewMemberPage />} />
        </Route>
      </Route>

      {/* Group H — ContractorAdminRoute + FamilyGate allow=contractor redirectTo=/log + AppLayout */}
      <Route element={<ContractorAdminRoute />}>
        <Route element={<FamilyGate allow="contractor" redirectTo="/log" />}>
          <Route element={<AppLayout />}>
            <Route path="/pricing" element={<PricingPage />} />
            <Route path="/dashboard/team" element={<TeamPage />} />
          </Route>
        </Route>
      </Route>

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
        <Route path="materials-catalog" element={<MaterialsCatalogSection />} />
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
