import { eq } from 'drizzle-orm'
import { schema, useDb } from '../../db'

/** Remove a site. History is kept unless ?deleteRuns=1 (runs, results and alerts cascade). */
export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')!
  const sites = loadSites()
  if (!sites.some((s) => s.id === id))
    throw createError({ statusCode: 404, statusMessage: `Unknown site "${id}"` })
  assertSiteIdle(id)
  saveSites(sites.filter((s) => s.id !== id))
  const deleteRuns = ['1', 'true'].includes(String(getQuery(event).deleteRuns))
  if (deleteRuns) useDb().delete(schema.runs).where(eq(schema.runs.siteId, id)).run()
  return { ok: true, deletedRuns: deleteRuns }
})
