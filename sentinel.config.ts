import type { SentinelConfig } from './shared/types/sentinel'

const config: SentinelConfig = {
  site: {
    name: 'Toyota Community',
    baseUrl: 'https://toyota-community.kinto-technologies.com',
  },

  // Pages monitored on every run. Keep this list short: each page costs
  // samples × strategies PSI requests (default 3 × 2 = 6 requests per page).
  pages: [
    { id: 'home', label: 'Home', path: '/' },
    { id: 'channels', label: 'Community channels', path: '/community/1/channels' },
    { id: 'channel-posts', label: 'Channel posts', path: '/community/1/channel/1/posts' },
    {
      id: 'post',
      label: 'Post (discussions)',
      path: '/community/1/channel/1/post/157/discussions',
    },
    { id: 'garage-posts', label: 'Garage posts', path: '/garage/posts' },
    { id: 'garage', label: 'Garage detail', path: '/garage/7/discussions' },
    { id: 'faq', label: 'FAQ', path: '/faq' },
    { id: 'login', label: 'Login', path: '/login' },
  ],

  strategies: ['mobile', 'desktop'],

  psi: {
    samples: 3,
    delayMs: 1500,
    categories: ['performance', 'accessibility', 'best-practices', 'seo'],
  },

  // Absolute limits. A page breaching one of them raises a "threshold" alert.
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

  // Relative limits versus the baseline (median of the previous N runs).
  regression: {
    baselineRuns: 5,
    scoreDrop: 10,
    timingIncreasePct: 50,
    minDelta: { lcp: 300, fcp: 300, tbt: 100, si: 500, ttfb: 200, cls: 0.03 },
  },

  // Every day at 06:00 (server local time). null disables scheduled runs.
  schedule: '0 6 * * *',
}

export default config
