import { existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { eq } from 'drizzle-orm'
import * as schema from './schema'

let db: ReturnType<typeof drizzle<typeof schema>> | undefined

export function useDb() {
  if (db) return db
  const { dbPath } = useRuntimeConfig()
  const file = resolve(projectRoot(), dbPath)
  const migrationsFolder = resolve(projectRoot(), 'server/db/migrations')
  if (!existsSync(migrationsFolder))
    throw new Error(
      `${migrationsFolder} not found: start the server from the project root (or set SENTINEL_ROOT)`
    )
  mkdirSync(dirname(file), { recursive: true })
  const sqlite = new Database(file)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder })
  // Runs live in memory while they execute: one still "running" here was cut by a restart.
  db.update(schema.runs)
    .set({
      status: 'failed',
      error: 'Interrupted by a server restart',
      finishedAt: new Date().toISOString(),
    })
    .where(eq(schema.runs.status, 'running'))
    .run()
  return db
}

export { schema }
