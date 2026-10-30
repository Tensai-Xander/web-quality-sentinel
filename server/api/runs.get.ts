import { desc, eq, sql } from 'drizzle-orm'
import { schema, useDb } from '../db'

export default defineEventHandler((event) => {
  const db = useDb()
  const q = getQuery(event)
  const limit = Math.min(Number(q.limit ?? 50), 500)
  // ?site=<id> restricts to one site; without it every site's runs are returned.
  const siteId = q.site ? getSite(String(q.site)).id : null
  const rows = db
    .select({
      run: schema.runs,
      alertCount: sql<number>`(select count(*) from alerts a where a.run_id = runs.id)`,
      failCount: sql<number>`(select count(*) from alerts a where a.run_id = runs.id and a.severity = 'fail')`,
      errorCount: sql<number>`(select count(*) from page_results r where r.run_id = runs.id and r.status = 'error')`,
    })
    .from(schema.runs)
    .where(siteId ? eq(schema.runs.siteId, siteId) : undefined)
    .orderBy(desc(schema.runs.id))
    .limit(limit)
    .all()
  return rows.map((r) => ({
    ...r.run,
    alertCount: r.alertCount,
    failCount: r.failCount,
    errorCount: r.errorCount,
  }))
})
