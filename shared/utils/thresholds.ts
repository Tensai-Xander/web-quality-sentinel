import {
  THRESHOLD_METRICS,
  type ThresholdLine,
  type ThresholdMetric,
  type ThresholdOverrides,
  type Thresholds,
} from '../types/sentinel'
import { isScoreMetric } from './format'

/** Global lines, then site and page overrides, line by line. */
export function mergeThresholds(
  base: Thresholds,
  ...overrides: (ThresholdOverrides | undefined)[]
) {
  const out = {} as Thresholds
  for (const m of THRESHOLD_METRICS) {
    out[m] = Object.assign({}, base[m], ...overrides.map((o) => o?.[m] ?? {})) as ThresholdLine
  }
  return out
}

/** Which line a value crosses, if any (scores: below the line, timings: above it). */
export function thresholdBreach(
  metric: ThresholdMetric,
  value: number,
  line: ThresholdLine
): 'warn' | 'fail' | null {
  const worse = (limit: number) => (isScoreMetric(metric) ? value < limit : value > limit)
  if (worse(line.fail)) return 'fail'
  if (worse(line.warn)) return 'warn'
  return null
}
