import sentinelConfig from './sentinel.config'

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
  nitro: {
    experimental: { tasks: true },
    scheduledTasks: sentinelConfig.schedule ? { [sentinelConfig.schedule]: ['sentinel:run'] } : {},
  },
  vite: {
    optimizeDeps: { include: ['chart.js', 'vue-chartjs'] },
  },
  app: {
    head: {
      title: 'Web Quality Sentinel',
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
    },
  },
})
