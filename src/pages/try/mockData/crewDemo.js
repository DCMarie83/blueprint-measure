// Canned data for the /try CREW demo. A worker clocks in from a shared link
// (no app, no account — mirrors RivetPay), and the GC approves the time
// (mirrors TimePage's Pending Approvals). No real tokens, no writes.

export const CREW_DEMO = {
  company: 'Riverside Painting Co.',
  worker: 'Marcus Reyes',
  job: 'Oakwood Office Repaint',
  clockInTime: '7:02 AM',
  // A styled stand-in for the /rivetpay/:token share link (no real token).
  shareLink: 'rivetdog.com/rivetpay/•••••',

  // Two punches waiting in the GC's approval queue.
  pending: [
    { id: 'p-1', worker: 'Marcus Reyes', job: 'Oakwood Office Repaint', date: 'Mon, Aug 3', time: '7:02 AM → 3:36 PM', hours: 8.5, source: 'clock-in', loc: true },
    { id: 'p-2', worker: 'Dana Whitfield', job: 'Maple Street Repaint', date: 'Mon, Aug 3', time: '8:00 AM → 2:30 PM', hours: 6.5, source: 'clock-in', loc: true },
  ],

  payoff: 'Every hour on your job, tracked and approved, without a single text message.',
}
