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
  const inputs = body.pages ?? [body]
  const taken = site.pages.map((p) => p.id)
  const added: PageConfig[] = []
  for (const input of inputs) {
    const path = String(input.path ?? '').trim()
    if (site.pages.some((p) => p.path === path) || added.some((p) => p.path === path))
      throw createError({ statusCode: 409, statusMessage: `Page "${path}" already exists` })
    const id = input.id?.trim() || uniqueId(pageIdFromPath(path), taken)
    const page = validatePage({ ...input, id, path, label: input.label?.trim() || labelFromId(id) })
    taken.push(page.id)
    added.push(page)
  }
  site.pages.push(...added)
  saveSites(sites)
  setResponseStatus(event, 201)
  return added
})
