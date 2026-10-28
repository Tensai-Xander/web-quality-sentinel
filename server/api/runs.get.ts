import { desc, sql } from 'drizzle-orm'
import { schema, useDb } from '../db'

export default defineEventHandler((event) => {
  const db = useDb()
  const limit = Math.min(Number(getQuery(event).limit ?? 50), 500)
  const rows = db
    .select({
      run: schema.runs,
      alertCount: sql<number>`(select count(*) from alerts a where a.run_id = ${schema.runs.id})`,
      failCount: sql<number>`(select count(*) from alerts a where a.run_id = ${schema.runs.id} and a.severity = 'fail')`,
      errorCount: sql<number>`(select count(*) from page_results r where r.run_id = ${schema.runs.id} and r.status = 'error')`,
    })
    .from(schema.runs)
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
