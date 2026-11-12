import type { SentinelConfig } from './shared/types/sentinel'

const config: SentinelConfig = {
  // Monitored websites and their pages live in sentinel.sites.json (edited from the
  // Settings page or with `pnpm sentinel:init <url>`). This file holds the global rules.

  strategies: ['mobile', 'desktop'],

  psi: {
    samples: 3,
    delayMs: 1500,
    categories: ['performance', 'accessibility', 'best-practices', 'seo'],
  },

  // Absolute limits, for every site unless a site or a page overrides them (Settings page).
  // A page breaching one of them raises a "threshold" alert.
  // Performance values are Lighthouse's "poor" (red) boundaries.
  thresholds: {
    performance: 50,
    accessibility: 90,
    bestPractices: 80,
    seo: 90,
    lcp: 4000,
    cls: 0.25,
    tbt: 600,
    fcp: 3000,
  },

  // Relative limits versus the baseline (median of the previous N runs of the same site).
  regression: {
    baselineRuns: 5,
    scoreDrop: 10,
    timingIncreasePct: 50,
    minDelta: { lcp: 300, fcp: 300, tbt: 250, si: 500, ttfb: 200, cls: 0.03 },
  },

  // Browser checks with Playwright, once per page and device per run (no quota, ~3-10 s each):
  // HTTP status, JavaScript console errors, broken same-site links, meta tags, JSON-LD.
  crawl: {
    enabled: true,
    maxLinks: 60,
    timeoutMs: 30000,
  },
}

export default config
