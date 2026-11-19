import type { PageConfig } from '~~/shared/types/sentinel'
import { labelFromId, pageIdFromPath } from '~~/scripts/lib/sitemap.mjs'

/** Add one or several pages to a site. Body: a page { label?, path, id?, thresholds? } or { pages: [...] }. */
export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'id')!
  const body =
    (await readBody<Partial<PageConfig> & { pages?: Partial<PageConfig>[] }>(event)) ?? {}
  const sites = loadSites()
  const site = sites.find((s) => s.id === siteId)
  if (!site) throw createError({ statusCode: 404, statusMessage: `Unknown site "${siteId}"` })
  assertSiteIdle(siteId)
  if (body.pages != null && !Array.isArray(body.pages))
    throw createError({ statusCode: 400, statusMessage: '"pages" must be an array' })
  const inputs = (body.pages ?? [body]).filter((p) => p != null && typeof p === 'object')
  const taken = site.pages.map((p) => p.id)
  const added: PageConfig[] = []
  for (const input of inputs) {
    const path = str(input.path)
    if (site.pages.some((p) => p.path === path) || added.some((p) => p.path === path))
      throw createError({ statusCode: 409, statusMessage: `Page "${path}" already exists` })
    const id = str(input.id) || uniqueId(pageIdFromPath(path), taken)
    const page = validatePage(
      { ...input, id, path, label: str(input.label) || labelFromId(id) },
      site
    )
    taken.push(page.id)
    added.push(page)
  }
  site.pages.push(...added)
  saveSites(sites)
  setResponseStatus(event, 201)
  return added
})
