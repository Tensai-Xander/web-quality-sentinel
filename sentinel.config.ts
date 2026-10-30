import type { SentinelConfig } from './shared/types/sentinel'

const config: SentinelConfig = {
  // Monitored websites. Each site has its own page list and its own run history; the dashboard
  // shows one site at a time (selector in the top bar). Add a site by hand or with
  // `pnpm sentinel:init https://www.example.com`, which reads its sitemap.
  // Keep page lists short: each page costs samples × strategies PSI requests
  // (default 3 × 2 = 6 requests ≈ 75 s per page and run).
  sites: [
    {
      id: 'toyota-community',
      name: 'Toyota Community',
      baseUrl: 'https://toyota-community.kinto-technologies.com',
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
    },
    {
      id: 'kinto-mobility',
      name: 'Kinto Mobility',
      baseUrl: 'https://www.kinto-mobility.com',
      pages: [
        { id: 'home', label: 'Home', path: '/' },
        { id: 'about', label: 'About', path: '/about' },
        { id: 'japan', label: 'Japan', path: '/japan' },
        { id: 'locations', label: 'Locations', path: '/locations' },
        { id: 'privacy', label: 'Privacy', path: '/privacy' },
        { id: 'services', label: 'Services', path: '/services' },
        { id: 'terms', label: 'Terms', path: '/terms' },
        { id: 'unlimited', label: 'Unlimited', path: '/unlimited' },
        { id: 'services-kinto-go', label: 'Services Kinto Go', path: '/services/kinto-go' },
      ],
    },
  ],

  strategies: ['mobile', 'desktop'],

  psi: {
    samples: 3,
    delayMs: 1500,
    categories: ['performance', 'accessibility', 'best-practices', 'seo'],
  },

  // Absolute limits, for every site unless a site or a page overrides them.
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
}

export default config
