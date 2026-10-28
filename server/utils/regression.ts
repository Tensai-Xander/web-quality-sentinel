import {
  SCORE_METRICS,
  TIMING_METRICS,
  METRIC_LABELS,
  type Metric,
  type Thresholds,
  type RegressionRules,
  type AlertKind,
  type AlertSeverity,
} from '~~/shared/types/sentinel'
import { median } from './psi'
import { formatMetric } from '~~/shared/utils/format'

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

/** Absolute thresholds: scores must be >= min, timings must be <= max. */
export function checkThresholds(values: MetricValues, thresholds: Thresholds): Finding[] {
  const findings: Finding[] = []
  for (const m of SCORE_METRICS) {
    const v = values[m]
    const min = thresholds[m]
    if (v != null && min != null && v < min) {
      findings.push({
        metric: m,
        kind: 'threshold',
        severity: v < min - 10 ? 'fail' : 'warn',
        actual: v,
        limit: min,
        baseline: null,
        message: `${METRIC_LABELS[m]} ${formatMetric(m, v)} is below the minimum of ${min}`,
      })
    }
  }
  for (const m of ['lcp', 'cls', 'tbt', 'fcp'] as const) {
    const v = values[m]
    const max = thresholds[m]
    if (v != null && max != null && v > max) {
      findings.push({
        metric: m,
        kind: 'threshold',
        severity: v > max * 1.5 ? 'fail' : 'warn',
        actual: v,
        limit: max,
        baseline: null,
        message: `${METRIC_LABELS[m]} ${formatMetric(m, v)} exceeds the maximum of ${formatMetric(m, max)}`,
      })
    }
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
