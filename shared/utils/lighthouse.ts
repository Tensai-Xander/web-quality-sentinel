/** Lighthouse's metric audits are measurements, not things to fix: never listed as issues. */
const METRIC_AUDIT_IDS = new Set([
  'first-contentful-paint',
  'largest-contentful-paint',
  'total-blocking-time',
  'cumulative-layout-shift',
  'speed-index',
  'interactive',
  'max-potential-fid',
])

export const isMetricAudit = (auditId: string) => METRIC_AUDIT_IDS.has(auditId)
