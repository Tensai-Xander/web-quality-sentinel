import { describe, expect, it } from 'vitest'
import config from '~~/sentinel.config'
import { checkRegressions, checkThresholds, computeBaseline } from '~~/server/utils/regression'

const rules = config.regression

describe('checkThresholds', () => {
  it('reports one finding per crossed line with the right severity', () => {
    const findings = checkThresholds(
      { performance: 72, accessibility: 95, lcp: 4050, cls: 0.05, tbt: 807 },
      config.thresholds
    )
    expect(findings.map((f) => [f.metric, f.severity, f.limit])).toEqual([
      ['performance', 'warn', 90],
      ['lcp', 'fail', 4000],
      ['tbt', 'fail', 600],
    ])
    expect(findings[0]!.message).toContain('Performance 72 is below the warn line of 90')
  })
  it('ignores missing metrics', () => {
    expect(checkThresholds({ performance: null, seo: undefined }, config.thresholds)).toEqual([])
  })
})

describe('computeBaseline', () => {
  it('is the per-metric median, ignoring nulls', () => {
    const base = computeBaseline([
      { performance: 80, lcp: 3000 },
      { performance: 60, lcp: null },
      { performance: 70 },
    ])
    expect(base.performance).toBe(70)
    expect(base.lcp).toBe(3000)
    expect(base.cls).toBeNull()
  })
})

describe('checkRegressions', () => {
  const history = [
    { performance: 80, lcp: 3000, cls: 0, tbt: 0 },
    { performance: 82, lcp: 3200, cls: 0, tbt: 0 },
  ]
  it('needs at least two previous runs', () => {
    expect(checkRegressions({ performance: 10 }, history.slice(0, 1), rules)).toEqual([])
  })
  it('score drop: ≥ scoreDrop → warn, ≥ 2× → fail', () => {
    const warn = checkRegressions({ performance: 71 }, history, rules)
    expect(warn.map((f) => [f.metric, f.severity])).toEqual([['performance', 'warn']])
    const fail = checkRegressions({ performance: 61 }, history, rules)
    expect(fail[0]!.severity).toBe('fail')
    expect(checkRegressions({ performance: 72 }, history, rules)).toEqual([])
  })
  it('timing increase: ≥ pct and ≥ minDelta → warn, ≥ 2× pct → fail', () => {
    expect(checkRegressions({ lcp: 4700 }, history, rules)[0]!.severity).toBe('warn')
    expect(checkRegressions({ lcp: 6300 }, history, rules)[0]!.severity).toBe('fail')
    expect(checkRegressions({ lcp: 4600 }, history, rules)).toEqual([])
  })
  it('baseline 0 regresses once above the noise floor (CLS, TBT)', () => {
    const cls = checkRegressions({ cls: 0.09 }, history, rules)
    expect(cls.map((f) => [f.metric, f.severity])).toEqual([['cls', 'fail']])
    expect(cls[0]!.message).toContain('baseline was 0')
    expect(checkRegressions({ cls: 0.01 }, history, rules)).toEqual([])
    expect(checkRegressions({ tbt: 190 }, history, rules)).toEqual([])
    expect(checkRegressions({ tbt: 260 }, history, rules)[0]!.metric).toBe('tbt')
  })
})
