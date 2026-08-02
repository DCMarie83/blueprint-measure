// Canned data for the /try ESTIMATE demo. Commercial repaint, single-price
// (no Good/Better/Best — mirrors the real builder where rate_better/rate_best
// are always 0). Units drawn from the real 5-unit set (sf/lf/each/lump_sum).
// One lump_sum line shows that unit's reconfigured row (no qty).

export const ESTIMATE_DEMO = {
  job: 'Oakwood Office Repaint',
  client: 'Beltline Property Group',

  // category groups the rows exactly like LineItemsTable's GroupRows.
  lineItems: [
    { id: 'li-1', category: 'Prep', description: 'Wall prep & patch', unit: 'sf', quantity: 3200, rate: 0.45, total: 1440 },
    { id: 'li-2', category: 'Prep', description: 'Trim caulk & sand', unit: 'lf', quantity: 640, rate: 1.25, total: 800 },
    { id: 'li-3', category: 'Paint', description: 'Primer coat', unit: 'sf', quantity: 3200, rate: 0.55, total: 1760 },
    { id: 'li-4', category: 'Paint', description: 'Wall paint (2 coats)', unit: 'sf', quantity: 3200, rate: 0.95, total: 3040 },
    { id: 'li-5', category: 'Paint', description: 'Ceiling paint', unit: 'sf', quantity: 2800, rate: 0.60, total: 1680 },
    { id: 'li-6', category: 'Finishes', description: 'Door & trim enamel', unit: 'each', quantity: 18, rate: 85, total: 1530 },
    { id: 'li-7', category: 'General', description: 'Mobilization & setup', unit: 'lump_sum', quantity: null, rate: 1200, total: 1200 },
  ],

  total: 11450,
  payoff: "Six seconds. By hand that's the better part of an hour.",
}
