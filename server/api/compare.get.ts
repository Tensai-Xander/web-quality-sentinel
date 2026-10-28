import { inArray } from 'drizzle-orm'
import { schema, useDb } from '../db'

export default defineEventHandler((event) => {
  const q = getQuery(event)
  const from = Number(q.from)
  const to = Number(q.to)
  if (!Number.isInteger(from) || !Number.isInteger(to))
    throw createError({ statusCode: 400, statusMessage: 'from and to run ids are required' })
  const db = useDb()
  const runs = db
    .select()
    .from(schema.runs)
    .where(inArray(schema.runs.id, [from, to]))
    .all()
  const results = db
    .select()
    .from(schema.pageResults)
    .where(inArray(schema.pageResults.runId, [from, to]))
    .all()
    .map(({ details: _d, ...r }) => r)
  return {
    from: runs.find((r) => r.id === from) ?? null,
    to: runs.find((r) => r.id === to) ?? null,
    results,
  }
})
