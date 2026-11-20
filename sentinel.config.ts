import type { SentinelConfig } from './shared/types/sentinel'

const config: SentinelConfig = {
  // Monitored websites and their pages live in sentinel.sites.json (edited from the
  // Settings page or with `pnpm sentinel:init <url>`). This file holds the global rules.

  strategies: ['mobile', 'desktop'],

  // PSI caches a URL's result for a few minutes; samples after the first add a throw-away
  // `?sentinel=` query parameter so each one is a real Lighthouse analysis.
  psi: {
    samples: 3,
    delayMs: 1500,
    // a sample that fails on the network ("fetch failed", timeout) or with a Google 5xx is
    // tried again `retries` times, `retryDelayMs` later; quota / key errors are never retried
    retries: 1,
    retryDelayMs: 5000,
    categories: ['performance', 'accessibility', 'best-practices', 'seo'],
  },

  // Absolute limits, for every site unless a site or a page overrides them (Settings page).
  // Two lines per metric, taken from Google's colour bands: crossing `warn` (green → orange)
  // raises a warn alert, crossing `fail` (orange → red) a fail alert. Scores alert below the
  // line, timings (ms, CLS unitless) above it.
  thresholds: {
    performance: { warn: 90, fail: 50 },
    accessibility: { warn: 90, fail: 50 },
    bestPractices: { warn: 90, fail: 50 },
    seo: { warn: 90, fail: 50 },
    lcp: { warn: 2500, fail: 4000 },
    cls: { warn: 0.1, fail: 0.25 },
    tbt: { warn: 200, fail: 600 },
    fcp: { warn: 1800, fail: 3000 },
  },

  // Browser checks with Playwright, once per page and device per run (no quota, ~3-10 s each):
  // HTTP status, JavaScript console errors, broken same-site links, meta tags, JSON-LD and an
  // axe-core accessibility audit (WCAG 2.x A/AA + best practices).
  crawl: {
    enabled: true,
    maxLinks: 60,
    timeoutMs: 30000,
  },
}

export default config
