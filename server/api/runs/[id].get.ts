import { asc, eq } from 'drizzle-orm'
import { schema, useDb } from '../../db'

export default defineEventHandler((event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) throw createError({ statusCode: 400, statusMessage: 'Invalid run id' })
  const db = useDb()
  const run = db.select().from(schema.runs).where(eq(schema.runs.id, id)).get()
  if (!run) throw createError({ statusCode: 404, statusMessage: 'Run not found' })

  const results = db
    .select()
    .from(schema.pageResults)
    .where(eq(schema.pageResults.runId, id))
    .orderBy(asc(schema.pageResults.id))
    .all()
    .map((r) => ({ ...r, details: r.details ? JSON.parse(r.details) : null }))
  const alerts = db.select().from(schema.alerts).where(eq(schema.alerts.runId, id)).all()
  return { run, results, alerts }
})
