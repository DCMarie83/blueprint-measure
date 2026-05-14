import AppHeader from '../components/AppHeader'
import { useDashboardData } from '../hooks/useDashboardData'
import GreetingStrip from '../components/dashboard/GreetingStrip'
import QuickActionsRow from '../components/dashboard/QuickActionsRow'
import GettingStartedChecklist from '../components/dashboard/GettingStartedChecklist'
import PipelinePreview from '../components/dashboard/PipelinePreview'
import StatsTiles from '../components/dashboard/StatsTiles'
import RecentActivity from '../components/dashboard/RecentActivity'
import ContinueWorking from '../components/dashboard/ContinueWorking'
import TipsPanel from '../components/dashboard/TipsPanel'
import styles from './DashboardPage.module.css'

export default function DashboardPage() {
  const {
    loading, error,
    firstName, todayDate,
    isNewUser, hasZeroJobs,
    checklist, pipeline, stats, recentActivity, tip,
  } = useDashboardData()

  return (
    <div className={styles.page}>
      <AppHeader />
      <main className={styles.main}>
        {loading ? (
          <div className={styles.loading}>Loading…</div>
        ) : error ? (
          <div className={styles.loading} style={{ color: 'var(--color-danger)' }}>{error}</div>
        ) : (
          <div className={styles.sections}>
            <GreetingStrip firstName={firstName} />
            <QuickActionsRow />
            {isNewUser && checklist && !checklist.allComplete && (
              <GettingStartedChecklist checklist={checklist} />
            )}
            {pipeline && <PipelinePreview pipeline={pipeline} hasZeroJobs={hasZeroJobs} />}
            <ContinueWorking />
            {stats && <StatsTiles stats={stats} />}
            {recentActivity && <RecentActivity recentActivity={recentActivity} />}
            <TipsPanel tip={tip} />
          </div>
        )}
      </main>
    </div>
  )
}
