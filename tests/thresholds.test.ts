import { describe, expect, it } from 'vitest'
import config from '~~/sentinel.config'
import { mergeThresholds, thresholdBreach } from '~~/shared/utils/thresholds'

describe('thresholdBreach', () => {
  const score = { warn: 90, fail: 50 }
  const lcp = { warn: 2500, fail: 4000 }
  it('scores: below warn → warn, below fail → fail, on the line → nothing', () => {
    expect(thresholdBreach('performance', 90, score)).toBeNull()
    expect(thresholdBreach('performance', 89, score)).toBe('warn')
    expect(thresholdBreach('performance', 50, score)).toBe('warn')
    expect(thresholdBreach('performance', 49, score)).toBe('fail')
  })
  it('timings: above warn → warn, above fail → fail', () => {
    expect(thresholdBreach('lcp', 2500, lcp)).toBeNull()
    expect(thresholdBreach('lcp', 2501, lcp)).toBe('warn')
    expect(thresholdBreach('lcp', 4000, lcp)).toBe('warn')
    expect(thresholdBreach('lcp', 4050, lcp)).toBe('fail')
  })
})

describe('mergeThresholds', () => {
  it('applies site then page overrides line by line', () => {
    const merged = mergeThresholds(
      config.thresholds,
      { performance: { warn: 70 } },
      { performance: { fail: 40 }, lcp: { warn: 3000 } }
    )
    expect(merged.performance).toEqual({ warn: 70, fail: 40 })
    expect(merged.lcp).toEqual({ warn: 3000, fail: config.thresholds.lcp.fail })
    expect(merged.cls).toEqual(config.thresholds.cls)
  })
  it('defaults are Google’s colour bands', () => {
    expect(config.thresholds.performance).toEqual({ warn: 90, fail: 50 })
    expect(config.thresholds.lcp).toEqual({ warn: 2500, fail: 4000 })
    expect(config.thresholds.cls).toEqual({ warn: 0.1, fail: 0.25 })
    expect(config.thresholds.tbt).toEqual({ warn: 200, fail: 600 })
    expect(config.thresholds.fcp).toEqual({ warn: 1800, fail: 3000 })
  })
})
