import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core'

export const runs = sqliteTable('runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  trigger: text('trigger').notNull(), // scheduled | manual | release
  releaseTag: text('release_tag'),
  status: text('status').notNull(), // running | completed | failed
  startedAt: text('started_at').notNull(),
  finishedAt: text('finished_at'),
  error: text('error'),
  checksTotal: integer('checks_total').notNull().default(0),
  checksDone: integer('checks_done').notNull().default(0),
})

export const pageResults = sqliteTable(
  'page_results',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    runId: integer('run_id')
      .notNull()
      .references(() => runs.id, { onDelete: 'cascade' }),
    pageId: text('page_id').notNull(),
    url: text('url').notNull(),
    strategy: text('strategy').notNull(), // mobile | desktop
    status: text('status').notNull(), // ok | error
    error: text('error'),
    // Lighthouse category scores, 0-100 (median of samples)
    performance: real('performance'),
    accessibility: real('accessibility'),
    bestPractices: real('best_practices'),
    seo: real('seo'),
    // Lab timings (median of samples). ms except cls.
    lcp: real('lcp'),
    cls: real('cls'),
    tbt: real('tbt'),
    fcp: real('fcp'),
    si: real('si'),
    ttfb: real('ttfb'),
    // Field data (CrUX) when Google has enough traffic for the URL/origin
    fieldInp: real('field_inp'),
    fieldLcp: real('field_lcp'),
    fieldCls: real('field_cls'),
    samples: integer('samples').notNull().default(0),
    lighthouseVersion: text('lighthouse_version'),
    // JSON: per-sample scores/timings + top opportunities, for drill-down
    details: text('details'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    index('page_results_run_idx').on(t.runId),
    index('page_results_page_idx').on(t.pageId, t.strategy),
  ]
)

export const alerts = sqliteTable(
  'alerts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    runId: integer('run_id')
      .notNull()
      .references(() => runs.id, { onDelete: 'cascade' }),
    pageResultId: integer('page_result_id').references(() => pageResults.id, {
      onDelete: 'cascade',
    }),
    pageId: text('page_id').notNull(),
    url: text('url').notNull(),
    strategy: text('strategy').notNull(),
    metric: text('metric').notNull(),
    kind: text('kind').notNull(), // threshold | regression
    severity: text('severity').notNull(), // warn | fail
    actual: real('actual'),
    limit: real('limit'),
    baseline: real('baseline'),
    message: text('message').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('alerts_run_idx').on(t.runId)]
)

export type Run = typeof runs.$inferSelect
export type PageResult = typeof pageResults.$inferSelect
export type Alert = typeof alerts.$inferSelect
