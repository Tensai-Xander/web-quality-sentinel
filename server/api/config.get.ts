export default defineEventHandler(() => {
  const config = useSentinelConfig()
  return {
    ...config,
    sites: loadSites().map((site) => ({
      ...site,
      pages: site.pages.map((p) => ({
        ...p,
        url: pageUrl(site, p),
        thresholds: thresholdsFor(site, p),
      })),
    })),
    sitesFile: SITES_FILE,
    sitesError: sitesError(),
    hasApiKey: Boolean(useRuntimeConfig().psiApiKey),
    activeRun: getActiveRun(),
  }
})
