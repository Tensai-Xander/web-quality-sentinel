import { desc, sql } from 'drizzle-orm'
import { schema, useDb } from '../db'

export default defineEventHandler((event) => {
  const q = getQuery(event)
  const limit = Math.min(Number(q.limit ?? 200), 1000)
  // ?site=<id> restricts to the runs of one site.
  const siteId = q.site ? getSite(String(q.site)).id : null
  return useDb()
    .select()
    .from(schema.alerts)
    .where(
      siteId
        ? sql`${schema.alerts.runId} in (select id from runs where site_id = ${siteId})`
        : undefined
    )
    .orderBy(desc(schema.alerts.id))
    .limit(limit)
    .all()
})
