import { useDashboardData } from '../hooks/useDashboardData'
import GreetingStrip from '../components/dashboard/GreetingStrip'
import QuickActionsRow from '../components/dashboard/QuickActionsRow'
import GettingStartedChecklist from '../components/dashboard/GettingStartedChecklist'
import PipelinePreview from '../components/dashboard/PipelinePreview'
import StatsTiles from '../components/dashboard/StatsTiles'
import RecentActivity from '../components/dashboard/RecentActivity'
import ContinueWorking from '../components/dashboard/ContinueWorking'
import TipsPanel from '../components/dashboard/TipsPanel'
import Logo from '../components/brand/Logo'
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
      
      <main className={styles.main}>
        {loading ? (
          <div className={styles.loading}>Sniffing around...</div>
        ) : error ? (
          <div className={styles.loading} style={{ color: 'var(--color-danger)' }}>{error}</div>
        ) : (
          <div className={styles.sections}>
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              paddingTop: 24,
              paddingBottom: 24,
            }}>
              <Logo variant="full" style={{ maxWidth: 320, height: 'auto' }} />
            </div>
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
