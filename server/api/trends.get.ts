import { and, desc, eq, inArray } from 'drizzle-orm'
import { schema, useDb } from '../db'

/** Metric history per page of one site for one strategy, oldest run first. */
export default defineEventHandler((event) => {
  const q = getQuery(event)
  const strategy = q.strategy === 'desktop' ? 'desktop' : 'mobile'
  const limit = Math.min(Number(q.limit ?? 30), 365)
  const site = getSite(q.site ? String(q.site) : null)
  const db = useDb()

  const runs = db
    .select({
      id: schema.runs.id,
      startedAt: schema.runs.startedAt,
      releaseTag: schema.runs.releaseTag,
      trigger: schema.runs.trigger,
    })
    .from(schema.runs)
    .where(and(eq(schema.runs.siteId, site.id), eq(schema.runs.status, 'completed')))
    .orderBy(desc(schema.runs.id))
    .limit(limit)
    .all()
    .reverse()
  if (!runs.length) return { runs: [], results: [] }

  const results = db
    .select()
    .from(schema.pageResults)
    .where(
      and(
        inArray(
          schema.pageResults.runId,
          runs.map((r) => r.id)
        ),
        eq(schema.pageResults.strategy, strategy),
        eq(schema.pageResults.status, 'ok')
      )
    )
    .all()
    .map(({ details: _d, ...r }) => r)
  return { runs, results }
})
