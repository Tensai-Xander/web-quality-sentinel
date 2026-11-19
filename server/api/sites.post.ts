import type { SiteConfig } from '~~/shared/types/sentinel'
import { siteIdFromUrl, siteNameFromUrl } from '~~/scripts/lib/sitemap.mjs'

/** Add a site. Body: { name?, baseUrl, id?, pages?, thresholds? }. */
export default defineEventHandler(async (event) => {
  const body = (await readBody<Partial<SiteConfig>>(event)) ?? {}
  const sites = loadSites()
  const base = validateBaseUrl(body.baseUrl)
  const site = validateSite({
    ...body,
    baseUrl: base,
    name: str(body.name) || siteNameFromUrl(base),
    id:
      str(body.id) ||
      uniqueId(
        siteIdFromUrl(base),
        sites.map((s) => s.id)
      ),
    pages: body.pages ?? [],
  })
  if (sites.some((s) => s.id === site.id))
    throw createError({ statusCode: 409, statusMessage: `Site "${site.id}" already exists` })
  saveSites([...sites, site])
  setResponseStatus(event, 201)
  return site
})
