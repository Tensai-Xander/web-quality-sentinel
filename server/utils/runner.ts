import { and, desc, eq, inArray, ne } from 'drizzle-orm'
import type { RunTrigger, Strategy } from '~~/shared/types/sentinel'
import { useDb, schema } from '../db'
import type { PsiError, PsiSample } from './psi'
import { checkRegressions, checkThresholds, type Finding, type MetricValues } from './regression'
import { pageUrl, thresholdsFor, useSentinelConfig } from './sentinelConfig'

let activeRunId: number | null = null

export function getActiveRunId() {
  return activeRunId
}

interface StartOptions {
  trigger: RunTrigger
  releaseTag?: string | null
  /** Restrict to these page ids (defaults to every configured page). */
  pageIds?: string[]
}

/** Creates the run row and processes it in the background. Returns the run id immediately. */
export function startRun(opts: StartOptions): { runId: number; started: boolean } {
  if (activeRunId != null) return { runId: activeRunId, started: false }

  const config = useSentinelConfig()
  const db = useDb()
  const pages = config.pages.filter((p) => !opts.pageIds?.length || opts.pageIds.includes(p.id))
  const now = new Date().toISOString()
  const run = db
    .insert(schema.runs)
    .values({
      trigger: opts.trigger,
      releaseTag: opts.releaseTag ?? null,
      status: 'running',
      startedAt: now,
      checksTotal: pages.length * config.strategies.length,
      checksDone: 0,
    })
    .returning()
    .get()
  activeRunId = run.id

  processRun(
    run.id,
    pages.map((p) => p.id)
  ).catch((err) => {
    console.error('[sentinel] run failed', err)
    db.update(schema.runs)
      .set({
        status: 'failed',
        error: String(err?.message ?? err),
        finishedAt: new Date().toISOString(),
      })
      .where(eq(schema.runs.id, run.id))
      .run()
  })
  return { runId: run.id, started: true }
}

async function processRun(runId: number, pageIds: string[]) {
  const config = useSentinelConfig()
  const db = useDb()
  const { psiApiKey } = useRuntimeConfig()
  const pages = config.pages.filter((p) => pageIds.includes(p.id))
  let fatal: string | null = null

  try {
    for (const page of pages) {
      for (const strategy of config.strategies) {
        const url = pageUrl(page)
        const samples: PsiSample[] = []
        let error: string | null = null

        for (let i = 0; i < config.psi.samples; i++) {
          try {
            samples.push(await fetchPsi(url, strategy, config.psi.categories, psiApiKey))
          } catch (err) {
            const e = err as PsiError
            error = e.message
            console.warn(`[sentinel] ${strategy} ${url} sample ${i + 1} failed: ${e.message}`)
            // quota exhausted / unauthorized: pointless to keep hammering the API
            if (e.status === 429 || e.status === 403 || e.status === 400) {
              fatal = e.message
              break
            }
          }
          await sleep(config.psi.delayMs)
        }

        const resultId = storeResult(runId, page.id, url, strategy, samples, error)
        if (samples.length) evaluate(runId, resultId, page.id, url, strategy)

        db.update(schema.runs)
          .set({ checksDone: countDone(runId) })
          .where(eq(schema.runs.id, runId))
          .run()

        if (fatal) break
      }
      if (fatal) break
    }

    db.update(schema.runs)
      .set({
        status: fatal ? 'failed' : 'completed',
        error: fatal,
        finishedAt: new Date().toISOString(),
      })
      .where(eq(schema.runs.id, runId))
      .run()
  } finally {
    activeRunId = null
  }
}

function countDone(runId: number) {
  return useDb()
    .select({ id: schema.pageResults.id })
    .from(schema.pageResults)
    .where(eq(schema.pageResults.runId, runId))
    .all().length
}

function storeResult(
  runId: number,
  pageId: string,
  url: string,
  strategy: Strategy,
  samples: PsiSample[],
  error: string | null
): number {
  const db = useDb()
  const agg = samples.length ? aggregateSamples(samples) : null
  const row = db
    .insert(schema.pageResults)
    .values({
      runId,
      pageId,
      url,
      strategy,
      status: agg ? 'ok' : 'error',
      error: agg ? null : error,
      ...(agg?.median ?? {}),
      samples: samples.length,
      lighthouseVersion: agg?.lighthouseVersion ?? null,
      details: agg
        ? JSON.stringify({
            samples: samples.map(({ opportunities: _o, ...s }) => s),
            opportunities: samples[0]?.opportunities ?? [],
          })
        : null,
      createdAt: new Date().toISOString(),
    })
    .returning({ id: schema.pageResults.id })
    .get()
  return row.id
}

const METRIC_COLUMNS = [
  'performance',
  'accessibility',
  'bestPractices',
  'seo',
  'lcp',
  'cls',
  'tbt',
  'fcp',
  'si',
  'ttfb',
] as const

function toValues(row: Partial<schema.PageResult>): MetricValues {
  const v: MetricValues = {}
  for (const m of METRIC_COLUMNS) v[m] = row[m] ?? null
  return v
}

function evaluate(
  runId: number,
  resultId: number,
  pageId: string,
  url: string,
  strategy: Strategy
) {
  const config = useSentinelConfig()
  const db = useDb()
  const page = config.pages.find((p) => p.id === pageId)!
  const current = db
    .select()
    .from(schema.pageResults)
    .where(eq(schema.pageResults.id, resultId))
    .get()!
  const values = toValues(current)

  const previousRunIds = db
    .select({ id: schema.runs.id })
    .from(schema.runs)
    .where(and(eq(schema.runs.status, 'completed'), ne(schema.runs.id, runId)))
    .orderBy(desc(schema.runs.id))
    .limit(config.regression.baselineRuns)
    .all()
    .map((r) => r.id)

  const history = previousRunIds.length
    ? db
        .select()
        .from(schema.pageResults)
        .where(
          and(
            inArray(schema.pageResults.runId, previousRunIds),
            eq(schema.pageResults.pageId, pageId),
            eq(schema.pageResults.strategy, strategy),
            eq(schema.pageResults.status, 'ok')
          )
        )
        .all()
        .map(toValues)
    : []

  const findings: Finding[] = [
    ...checkThresholds(values, thresholdsFor(page)),
    ...checkRegressions(values, history, config.regression),
  ]
  if (!findings.length) return

  db.insert(schema.alerts)
    .values(
      findings.map((f) => ({
        runId,
        pageResultId: resultId,
        pageId,
        url,
        strategy,
        metric: f.metric,
        kind: f.kind,
        severity: f.severity,
        actual: f.actual,
        limit: f.limit,
        baseline: f.baseline,
        message: f.message,
        createdAt: new Date().toISOString(),
      }))
    )
    .run()
}
