export default defineEventHandler(() => {
  const config = useSentinelConfig()
  return {
    ...config,
    pages: config.pages.map((p) => ({ ...p, url: pageUrl(p), thresholds: thresholdsFor(p) })),
    hasApiKey: Boolean(useRuntimeConfig().psiApiKey),
    activeRunId: getActiveRunId(),
  }
})
