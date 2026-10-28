import { desc } from 'drizzle-orm'
import { schema, useDb } from '../db'

export default defineEventHandler((event) => {
  const limit = Math.min(Number(getQuery(event).limit ?? 200), 1000)
  return useDb().select().from(schema.alerts).orderBy(desc(schema.alerts.id)).limit(limit).all()
})
