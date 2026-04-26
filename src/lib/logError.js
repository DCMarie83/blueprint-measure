// Stub logError function — will be replaced by full implementation in P3.5
// For now, logs to console.error with a clear prefix so we know which calls
// would have been logged.
export function logError(err, context = {}) {
  console.error('[logError]', {
    message: err?.message || String(err),
    stack: err?.stack,
    context,
    severity: context.severity || 'error',
    timestamp: new Date().toISOString(),
  })
  // TODO: P3.5 — write to client_errors table with severity column
}
