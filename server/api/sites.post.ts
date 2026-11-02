import type { SiteConfig } from '~~/shared/types/sentinel'
import { siteIdFromUrl, siteNameFromUrl } from '~~/scripts/lib/sitemap.mjs'

/** Add a site. Body: { name?, baseUrl, id?, pages?, thresholds? }. */
export default defineEventHandler(async (event) => {
  const body = (await readBody<Partial<SiteConfig>>(event)) ?? {}
  const sites = loadSites()
  let base = String(body.baseUrl ?? '').trim()
  try {
    base = new URL(base).origin
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Base URL must be a valid http(s) URL' })
  }
  const site = validateSite({
    ...body,
    baseUrl: body.baseUrl,
    name: body.name?.trim() || siteNameFromUrl(base),
    id:
      body.id?.trim() ||
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
