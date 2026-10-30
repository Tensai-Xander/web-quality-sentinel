import { and, desc, eq, inArray, ne } from 'drizzle-orm'
import type { PageConfig, RunTrigger, SiteConfig, Strategy } from '~~/shared/types/sentinel'
import { useDb, schema } from '../db'
import type { PsiError, PsiSample } from './psi'
import { checkRegressions, checkThresholds, type Finding, type MetricValues } from './regression'
import { getSite, pageUrl, thresholdsFor, useSentinelConfig } from './sentinelConfig'

let activeRun: { id: number; siteId: string } | null = null

export function getActiveRun() {
  return activeRun
}

export function getActiveRunId() {
  return activeRun?.id ?? null
}

interface StartOptions {
  trigger: RunTrigger
  /** SiteConfig.id; defaults to the first configured site. */
  siteId?: string | null
  releaseTag?: string | null
  /** Restrict to these page ids (defaults to every configured page). */
  pageIds?: string[]
}

/** Creates the run row and processes it in the background. Returns the run id immediately. */
export function startRun(opts: StartOptions): { runId: number; started: boolean } {
  const site = getSite(opts.siteId) // 404 on unknown site, before the busy check
  if (activeRun) return { runId: activeRun.id, started: false }

  const config = useSentinelConfig()
  const db = useDb()
  const pages = site.pages.filter((p) => !opts.pageIds?.length || opts.pageIds.includes(p.id))
  const now = new Date().toISOString()
  const run = db
    .insert(schema.runs)
    .values({
      siteId: site.id,
      trigger: opts.trigger,
      releaseTag: opts.releaseTag ?? null,
      status: 'running',
      startedAt: now,
      checksTotal: pages.length * config.strategies.length,
      checksDone: 0,
    })
    .returning()
    .get()
  activeRun = { id: run.id, siteId: site.id }

  processRun(
    run.id,
    site,
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

async function processRun(runId: number, site: SiteConfig, pageIds: string[]) {
  const config = useSentinelConfig()
  const db = useDb()
  const { psiApiKey } = useRuntimeConfig()
  const pages = site.pages.filter((p) => pageIds.includes(p.id))
  let fatal: string | null = null

  try {
    for (const page of pages) {
      for (const strategy of config.strategies) {
        const url = pageUrl(site, page)
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
        if (samples.length) evaluate(runId, site, page, resultId, url, strategy)

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
    activeRun = null
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
      noindex: agg?.noindex ?? false,
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
  site: SiteConfig,
  page: PageConfig,
  resultId: number,
  url: string,
  strategy: Strategy
) {
  const config = useSentinelConfig()
  const db = useDb()
  const pageId = page.id
  const current = db
    .select()
    .from(schema.pageResults)
    .where(eq(schema.pageResults.id, resultId))
    .get()!
  const values = toValues(current)
  // Non-indexable pages are penalised by Lighthouse SEO on purpose; do not alert on it.
  if (current.noindex) delete values.seo

  const previousRunIds = db
    .select({ id: schema.runs.id })
    .from(schema.runs)
    .where(
      and(
        eq(schema.runs.siteId, site.id),
        eq(schema.runs.status, 'completed'),
        ne(schema.runs.id, runId)
      )
    )
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
    ...checkThresholds(values, thresholdsFor(site, page)),
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
