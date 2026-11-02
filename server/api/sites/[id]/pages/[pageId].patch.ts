import type { PageConfig } from '~~/shared/types/sentinel'

/** Edit a page's label, path or threshold overrides (the id, key of its history, stays). */
export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'id')!
  const pageId = getRouterParam(event, 'pageId')!
  const body = (await readBody<Partial<PageConfig>>(event)) ?? {}
  const sites = loadSites()
  const site = sites.find((s) => s.id === siteId)
  if (!site) throw createError({ statusCode: 404, statusMessage: `Unknown site "${siteId}"` })
  const idx = site.pages.findIndex((p) => p.id === pageId)
  if (idx < 0) throw createError({ statusCode: 404, statusMessage: `Unknown page "${pageId}"` })
  assertSiteIdle(siteId)
  const current = site.pages[idx]!
  const next = validatePage({
    ...current,
    label: body.label ?? current.label,
    path: body.path ?? current.path,
    thresholds: 'thresholds' in body ? body.thresholds : current.thresholds,
  })
  if (site.pages.some((p, i) => i !== idx && p.path === next.path))
    throw createError({ statusCode: 409, statusMessage: `Page "${next.path}" already exists` })
  site.pages[idx] = next
  saveSites(sites)
  return next
})
