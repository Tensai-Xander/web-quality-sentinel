import {
  SCORE_METRICS,
  TIMING_METRICS,
  THRESHOLD_METRICS,
  METRIC_LABELS,
  type Metric,
  type Thresholds,
  type RegressionRules,
  type AlertKind,
  type AlertSeverity,
} from '~~/shared/types/sentinel'
import { median } from './psi'
import { formatMetric, isScoreMetric } from '~~/shared/utils/format'
import { thresholdBreach } from '~~/shared/utils/thresholds'

export type MetricValues = Partial<Record<Metric, number | null>>

export interface Finding {
  metric: Metric
  kind: AlertKind
  severity: AlertSeverity
  actual: number
  limit: number | null
  baseline: number | null
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
      baseline: null,
      message: `${METRIC_LABELS[m]} ${formatMetric(m, v)} is ${isScoreMetric(m) ? 'below' : 'above'} the ${severity} line of ${formatMetric(m, limit)}`,
    })
  }
  return findings
}

/** Baseline = per-metric median over the previous runs. */
export function computeBaseline(history: MetricValues[]): MetricValues {
  const base: MetricValues = {}
  for (const m of [...SCORE_METRICS, ...TIMING_METRICS]) {
    base[m] = median(history.map((h) => h[m] ?? null))
  }
  return base
}

/** Relative regressions versus the baseline. Requires at least 2 historical runs to avoid noise. */
export function checkRegressions(
  values: MetricValues,
  history: MetricValues[],
  rules: RegressionRules
): Finding[] {
  if (history.length < 2) return []
  const baseline = computeBaseline(history)
  const findings: Finding[] = []

  for (const m of SCORE_METRICS) {
    const v = values[m]
    const b = baseline[m]
    if (v == null || b == null) continue
    const drop = b - v
    if (drop >= rules.scoreDrop) {
      findings.push({
        metric: m,
        kind: 'regression',
        severity: drop >= rules.scoreDrop * 2 ? 'fail' : 'warn',
        actual: v,
        limit: null,
        baseline: b,
        message: `${METRIC_LABELS[m]} dropped from ${formatMetric(m, b)} (baseline) to ${formatMetric(m, v)} (−${Math.round(drop)} pts)`,
      })
    }
  }

  for (const m of TIMING_METRICS) {
    const v = values[m]
    const b = baseline[m]
    if (v == null || b == null || b <= 0) continue
    const delta = v - b
    const pct = (delta / b) * 100
    const floor = rules.minDelta[m] ?? 0
    if (pct >= rules.timingIncreasePct && delta >= floor) {
      findings.push({
        metric: m,
        kind: 'regression',
        severity: pct >= rules.timingIncreasePct * 2 ? 'fail' : 'warn',
        actual: v,
        limit: null,
        baseline: b,
        message: `${METRIC_LABELS[m]} went from ${formatMetric(m, b)} (baseline) to ${formatMetric(m, v)} (+${Math.round(pct)}%)`,
      })
    }
  }
  return findings
}
