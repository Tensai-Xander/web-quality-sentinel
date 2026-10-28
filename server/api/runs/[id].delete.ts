import { eq } from 'drizzle-orm'
import { schema, useDb } from '../../db'

export default defineEventHandler((event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) throw createError({ statusCode: 400, statusMessage: 'Invalid run id' })
  if (getActiveRunId() === id)
    throw createError({ statusCode: 409, statusMessage: 'Run is in progress' })
  useDb().delete(schema.runs).where(eq(schema.runs.id, id)).run()
  return { ok: true }
})
