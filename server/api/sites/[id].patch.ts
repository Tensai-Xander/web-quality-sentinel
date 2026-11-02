import type { SiteConfig } from '~~/shared/types/sentinel'

/** Edit a site's name, base URL or threshold overrides (id and pages are not changed here). */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const body = (await readBody<Partial<SiteConfig>>(event)) ?? {}
  const sites = loadSites()
  const idx = sites.findIndex((s) => s.id === id)
  if (idx < 0) throw createError({ statusCode: 404, statusMessage: `Unknown site "${id}"` })
  assertSiteIdle(id)
  const current = sites[idx]!
  const next = validateSite({
    ...current,
    name: body.name ?? current.name,
    baseUrl: body.baseUrl ?? current.baseUrl,
    thresholds: 'thresholds' in body ? body.thresholds : current.thresholds,
  })
  sites[idx] = next
  saveSites(sites)
  return next
})
