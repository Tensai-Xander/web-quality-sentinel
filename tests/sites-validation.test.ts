import { describe, expect, it } from 'vitest'
import {
  uniqueId,
  validateBaseUrl,
  validatePage,
  validateSite,
  validateSites,
  validateThresholds,
} from '~~/server/utils/sites'

const status = (fn: () => unknown) => {
  try {
    fn()
  } catch (err) {
    return (err as { statusCode?: number }).statusCode
  }
  return 200
}

describe('validateBaseUrl', () => {
  it('keeps the origin only', () => {
    expect(validateBaseUrl(' https://Example.com/ ')).toBe('https://example.com')
    expect(validateBaseUrl('http://localhost:8080')).toBe('http://localhost:8080')
  })
  it('refuses paths, queries, fragments, credentials and other schemes', () => {
    for (const bad of [
      'https://example.com/path',
      'https://example.com/?x=1',
      'https://example.com/#top',
      'https://user:pw@example.com',
      'ftp://example.com',
      'javascript:alert(1)',
      '',
      42,
    ])
      expect(
        status(() => validateBaseUrl(bad)),
        String(bad)
      ).toBe(400)
  })
})

describe('validateSite / validatePage', () => {
  const site = { id: 'demo', name: 'Demo', baseUrl: 'https://demo.example', pages: [] }
  it('accepts a minimal site and normalises the base URL', () => {
    expect(validateSite({ ...site, baseUrl: 'https://demo.example/' })).toEqual(site)
  })
  it('checks ids, names and paths', () => {
    expect(status(() => validateSite({ ...site, id: 'Demo' }))).toBe(400)
    expect(status(() => validateSite({ ...site, name: '' }))).toBe(400)
    expect(status(() => validatePage({ id: 'home', label: 'Home', path: 'home' }))).toBe(400)
    expect(validatePage({ id: 'home', label: ' Home ', path: '/' })).toEqual({
      id: 'home',
      label: 'Home',
      path: '/',
    })
    expect(status(() => validateSite({ ...site, pages: 'nope' as never }))).toBe(400)
  })
  it('rejects duplicate page ids and duplicate site ids', () => {
    const page = { id: 'home', label: 'Home', path: '/' }
    expect(status(() => validateSite({ ...site, pages: [page, page] }))).toBe(400)
    expect(status(() => validateSites([site, site]))).toBe(400)
    expect(status(() => validateSites('x'))).toBe(400)
  })
})

describe('validateThresholds', () => {
  it('accepts partial { warn, fail } overrides and refuses the old single-number form', () => {
    expect(validateThresholds({ performance: { warn: 70 } })).toEqual({ performance: { warn: 70 } })
    expect(validateThresholds(undefined)).toBeUndefined()
    expect(status(() => validateThresholds({ performance: 70 }))).toBe(400)
    expect(status(() => validateThresholds({ performance: { warn: 101 } }))).toBe(400)
    expect(status(() => validateThresholds({ nope: { warn: 1 } }))).toBe(400)
    expect(status(() => validateThresholds({ lcp: { warn: -1 } }))).toBe(400)
  })
  it('lines must stay ordered once merged with the global/site lines', () => {
    const site = { id: 'demo', name: 'Demo', baseUrl: 'https://demo.example', pages: [] }
    // global fail is 50: a site warn of 40 would sit below it
    expect(status(() => validateSite({ ...site, thresholds: { performance: { warn: 40 } } }))).toBe(
      400
    )
    // a page can fix it by lowering fail too
    expect(
      status(() =>
        validateSite({
          ...site,
          thresholds: { performance: { fail: 30 } },
          pages: [
            { id: 'home', label: 'Home', path: '/', thresholds: { performance: { warn: 40 } } },
          ],
        })
      )
    ).toBe(200)
    // timings go the other way: warn must be ≤ fail
    expect(status(() => validateSite({ ...site, thresholds: { lcp: { warn: 5000 } } }))).toBe(400)
  })
})

describe('uniqueId', () => {
  it('appends -2, -3… when taken', () => {
    expect(uniqueId('home', ['home', 'home-2'])).toBe('home-3')
    expect(uniqueId('', [])).toBe('site')
  })
})
