import { and, eq, sql } from 'drizzle-orm'
import { schema, useDb } from '../../../../db'

/** Remove a page. History is kept unless ?deleteRuns=1 (its results and alerts in this site's runs). */
export default defineEventHandler((event) => {
  const siteId = getRouterParam(event, 'id')!
  const pageId = getRouterParam(event, 'pageId')!
  const sites = loadSites()
  const site = sites.find((s) => s.id === siteId)
  if (!site) throw createError({ statusCode: 404, statusMessage: `Unknown site "${siteId}"` })
  if (!site.pages.some((p) => p.id === pageId))
    throw createError({ statusCode: 404, statusMessage: `Unknown page "${pageId}"` })
  assertSiteIdle(siteId)
  site.pages = site.pages.filter((p) => p.id !== pageId)
  saveSites(sites)
  const deleteRuns = ['1', 'true'].includes(String(getQuery(event).deleteRuns))
  if (deleteRuns) {
    const db = useDb()
    const inSite = sql`${schema.pageResults.runId} in (select id from runs where site_id = ${siteId})`
    db.delete(schema.alerts)
      .where(
        and(
          eq(schema.alerts.pageId, pageId),
          sql`${schema.alerts.runId} in (select id from runs where site_id = ${siteId})`
        )
      )
      .run()
    db.delete(schema.pageResults)
      .where(and(eq(schema.pageResults.pageId, pageId), inSite))
      .run()
  }
  return { ok: true, deletedRuns: deleteRuns }
})
