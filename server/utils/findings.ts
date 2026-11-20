import {
  THRESHOLD_METRICS,
  METRIC_LABELS,
  type Thresholds,
  type AlertKind,
  type AlertSeverity,
} from '~~/shared/types/sentinel'
import { formatMetric, isScoreMetric } from '~~/shared/utils/format'
import { thresholdBreach } from '~~/shared/utils/thresholds'

export type MetricValues = Partial<Record<Metric, number | null>>

export interface Finding {
  metric: Metric
  kind: AlertKind
  severity: AlertSeverity
  actual: number
  limit: number
  message: string
}

/**
 * Absolute thresholds, two lines per metric (Google's colour bands): a score below / a timing
 * above the `fail` line is a fail, otherwise crossing the `warn` line is a warn.
 */
export function checkThresholds(values: MetricValues, thresholds: Thresholds): Finding[] {
  const findings: Finding[] = []
  for (const m of THRESHOLD_METRICS) {
    const v = values[m]
    const line = thresholds[m]
    if (v == null || line == null) continue
    const severity = thresholdBreach(m, v, line)
    if (!severity) continue
    const limit = line[severity]
    findings.push({
      metric: m,
      kind: 'threshold',
      severity,
      actual: v,
      limit,
      message: `${METRIC_LABELS[m]} ${formatMetric(m, v)} is ${isScoreMetric(m) ? 'below' : 'above'} the ${severity} line of ${formatMetric(m, limit)}`,
    })
  }
  return findings
}
