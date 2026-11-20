import { describe, expect, it } from 'vitest'
import config from '~~/sentinel.config'
import { checkThresholds } from '~~/server/utils/findings'

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
