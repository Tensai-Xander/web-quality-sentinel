import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from './schema'

let db: ReturnType<typeof drizzle<typeof schema>> | undefined

export function useDb() {
  if (db) return db
  const { dbPath } = useRuntimeConfig()
  const file = resolve(process.cwd(), dbPath)
  mkdirSync(dirname(file), { recursive: true })
  const sqlite = new Database(file)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: resolve(process.cwd(), 'server/db/migrations') })
  return db
}

export { schema }
