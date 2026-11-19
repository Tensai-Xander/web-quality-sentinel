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
    const runsOfSite = sql`(select id from runs where site_id = ${siteId})`
    db.transaction((tx) => {
      for (const table of [schema.alerts, schema.pageResults, schema.pageChecks])
        tx.delete(table)
          .where(and(eq(table.pageId, pageId), sql`${table.runId} in ${runsOfSite}`))
          .run()
    })
  }
  return { ok: true, deletedRuns: deleteRuns }
})
