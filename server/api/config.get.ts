export default defineEventHandler(() => {
  const config = useSentinelConfig()
  return {
    ...config,
    sites: config.sites.map((site) => ({
      ...site,
      pages: site.pages.map((p) => ({
        ...p,
        url: pageUrl(site, p),
        thresholds: thresholdsFor(site, p),
      })),
    })),
    hasApiKey: Boolean(useRuntimeConfig().psiApiKey),
    activeRun: getActiveRun(),
  }
})
