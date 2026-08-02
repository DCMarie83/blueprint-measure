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

  // Two punches waiting in the GC's approval queue (mirrors TimePage columns:
  // Worker / Job / Date / Time / Hours / Loc / Source).
  pending: [
    { id: 'p-1', worker: 'Marcus Reyes', job: 'Oakwood Office Repaint', date: 'Aug 3', time: '7:02 AM → 3:36 PM', hours: 8.5, loc: true, source: 'clock-in' },
    { id: 'p-2', worker: 'Dana Whitfield', job: 'Maple Street Repaint', date: 'Aug 3', time: '8:00 AM → 2:30 PM', hours: 6.5, loc: true, source: 'clock-in' },
  ],

  payoff: 'Every hour on your job, tracked and approved, without a single text message.',

  // Pay statement artifact (mirrors generatePayStatementPDF.js). GC-generated;
  // there is NO worker phone view of this — the worker only ever clocks in.
  payStatement: {
    company: 'Riverside Painting Co.',
    address: ['1420 Industrial Pkwy, Suite 3', 'Austin, TX 78701', '(512) 555-0147'],
    worker: 'Marcus Reyes',
    period: { from: 'Jul 21, 2026', to: 'Aug 3, 2026' },
    rate: 32,
    totalHours: 76.5,
    gross: 2448,
    byJob: [
      { job: 'Oakwood Office Repaint', hours: 52.0, pay: 1664 },
      { job: 'Maple Street Repaint', hours: 24.5, pay: 784 },
    ],
    detail: [
      { date: 'Jul 21', job: 'Oakwood Office Repaint', hours: 8.0, pay: 256 },
      { date: 'Jul 22', job: 'Oakwood Office Repaint', hours: 8.5, pay: 272 },
      { date: 'Jul 24', job: 'Maple Street Repaint', hours: 7.0, pay: 224 },
      { date: 'Jul 28', job: 'Oakwood Office Repaint', hours: 8.0, pay: 256 },
      { date: 'Jul 30', job: 'Maple Street Repaint', hours: 8.0, pay: 256 },
      { date: 'Aug 1', job: 'Oakwood Office Repaint', hours: 9.0, pay: 288 },
      { date: 'Aug 3', job: 'Oakwood Office Repaint', hours: 8.5, pay: 272 },
    ],
  },
}
