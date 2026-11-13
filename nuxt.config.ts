export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  modules: ['@nuxt/eslint'],
  css: ['~/assets/main.css'],
  runtimeConfig: {
    psiApiKey: '',
    // Override to point at a mock (see scripts/mock-psi.mjs) during development.
    psiEndpoint: 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed',
    dbPath: '.data/sentinel.db',
  },
  vite: {
    optimizeDeps: { include: ['chart.js', 'vue-chartjs'] },
  },
  nitro: {
    // the crawler reads this file at runtime (see server/utils/crawler.ts)
    externals: { traceInclude: ['node_modules/axe-core/axe.min.js'] },
  },
  app: {
    head: {
      title: 'Web Quality Sentinel',
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
    },
  },
})
