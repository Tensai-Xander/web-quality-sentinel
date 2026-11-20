import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  PsiError,
  aggregateSamples,
  cacheBustUrl,
  fetchPsi,
  median,
  parsePsiResponse,
} from '~~/server/utils/psi'

const lhr = (extra: Record<string, unknown> = {}) => ({
  lighthouseResult: {
    fetchTime: '2026-01-01T00:00:00.000Z',
    lighthouseVersion: '13.6.0',
    categories: { performance: { score: 0.846 }, seo: { score: 1 } },
    audits: {
      'largest-contentful-paint': { numericValue: 2512.4 },
      'cumulative-layout-shift': { numericValue: 0.004 },
      'is-crawlable': { score: 1 },
    },
    ...extra,
  },
})

describe('parsePsiResponse', () => {
  it('rounds scores and keeps raw timings', () => {
    const s = parsePsiResponse(lhr())
    expect(s.performance).toBe(85)
    expect(s.seo).toBe(100)
    expect(s.accessibility).toBeNull()
    expect(s.lcp).toBe(2512.4)
    expect(s.cls).toBe(0.004)
    expect(s.tbt).toBeNull()
    expect(s.noindex).toBe(false)
    expect(s.field).toBeNull()
  })
  it('a Lighthouse runtime error is a failed sample', () => {
    expect(() =>
      parsePsiResponse(lhr({ runtimeError: { code: 'NO_FCP', message: 'nothing painted' } }))
    ).toThrowError(PsiError)
    expect(() =>
      parsePsiResponse(lhr({ runtimeError: { code: 'NO_FCP', message: 'x' } }))
    ).toThrowError(/NO_FCP/)
  })
  it('an answer without any category is a failed sample, a category subset is fine', () => {
    expect(() => parsePsiResponse({ lighthouseResult: { categories: {} } })).toThrowError(PsiError)
    expect(() => parsePsiResponse({})).toThrowError(PsiError)
    expect(
      parsePsiResponse({ lighthouseResult: { categories: { accessibility: { score: 0.9 } } } })
        .accessibility
    ).toBe(90)
  })
  it('field data: "This URL" only, no origin fallback', () => {
    const withField = {
      ...lhr(),
      loadingExperience: {
        metrics: { LARGEST_CONTENTFUL_PAINT_MS: { percentile: 1800, category: 'FAST' } },
      },
    }
    expect(parsePsiResponse(withField).fieldLcp).toBe(1800)
    expect(
      parsePsiResponse({
        ...withField,
        loadingExperience: { ...withField.loadingExperience, origin_fallback: true },
      }).field
    ).toBeNull()
  })
})

describe('opportunities', () => {
  it('lists failing performance audits but not the metric audits themselves', () => {
    const s = parsePsiResponse(
      lhr({
        categories: {
          performance: {
            score: 0.5,
            auditRefs: [
              { id: 'total-blocking-time' },
              { id: 'unused-javascript' },
              { id: 'forced-reflow-insight' },
              { id: 'uses-long-cache-ttl' },
            ],
          },
        },
        audits: {
          'total-blocking-time': {
            id: 'total-blocking-time',
            score: 0.3,
            scoreDisplayMode: 'numeric',
            title: 'TBT',
          },
          'unused-javascript': {
            id: 'unused-javascript',
            score: 0.4,
            title: 'Reduce unused JavaScript',
            details: { overallSavingsMs: 600 },
            metricSavings: { LCP: 600, FCP: 0 },
          },
          'forced-reflow-insight': {
            id: 'forced-reflow-insight',
            score: 0,
            title: 'Forced reflow',
            metricSavings: {},
          },
          'uses-long-cache-ttl': { id: 'uses-long-cache-ttl', score: 1, title: 'cache' },
        },
      })
    )
    expect(s.opportunities.map((o) => o.id)).toEqual(['unused-javascript', 'forced-reflow-insight'])
    expect(s.opportunities[0]!.metricSavings).toEqual({ lcp: 600, fcp: 0 })
    expect(s.opportunities[1]!.savingsMs).toBeNull()
  })
})

describe('median / aggregateSamples', () => {
  it('median ignores nulls, averages the middle pair', () => {
    expect(median([3, null, 1, 2])).toBe(2)
    expect(median([4, 1, 3, 2])).toBe(2.5)
    expect(median([null])).toBeNull()
  })
  it('aggregate = per-metric median of the samples', () => {
    const a = aggregateSamples([
      parsePsiResponse(lhr({ categories: { performance: { score: 0.7 } } })),
      parsePsiResponse(lhr({ categories: { performance: { score: 0.9 } } })),
      parsePsiResponse(lhr({ categories: { performance: { score: 0.89 } } })),
    ])
    expect(a.median.performance).toBe(89)
    expect(a.median.lcp).toBe(2512.4)
    expect(a.noindex).toBe(false)
  })
})

describe('cacheBustUrl', () => {
  it('adds a throw-away sentinel parameter, keeping the existing query', () => {
    const u = new URL(cacheBustUrl('https://x.example/a?b=1'))
    expect(u.searchParams.get('b')).toBe('1')
    expect(u.searchParams.get('sentinel')).toMatch(/\S/)
    expect(u.pathname).toBe('/a')
  })
})

describe('fetchPsi error classification', () => {
  afterEach(() => vi.unstubAllGlobals())
  const answer = (status: number, message: string) =>
    vi.stubGlobal(
      'fetch',
      async () => new Response(JSON.stringify({ error: { message } }), { status })
    )
  const call = () =>
    fetchPsi('https://x.example/', 'mobile', ['performance'], 'key').catch((e) => e)

  it('a Lighthouse lab failure (400 NO_FCP) carries no status: retried, never fatal', async () => {
    answer(400, 'Lighthouse returned error: NO_FCP. The page did not paint any content.')
    const err = await call()
    expect(err).toBeInstanceOf(PsiError)
    expect(err.status).toBeUndefined()
    expect(err.message).toMatch(/NO_FCP/)
  })
  it('a 429 "over capacity" is a lab failure too (no status), unlike a quota 429', async () => {
    answer(429, 'Lighthouse is temporarily over capacity; please retry later.')
    const err = await call()
    expect(err).toBeInstanceOf(PsiError)
    expect(err.status).toBeUndefined()
    expect(err.message).toMatch(/over capacity/)
  })
  it('key and quota errors keep their status', async () => {
    answer(400, 'API key not valid. Please pass a valid API key.')
    expect((await call()).status).toBe(400)
    answer(429, 'Quota exceeded')
    expect((await call()).status).toBe(429)
  })
})
