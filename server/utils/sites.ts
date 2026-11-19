import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import config from '~~/sentinel.config'
import { mergeThresholds } from '~~/shared/utils/thresholds'
import { resolve } from 'node:path'
import {
  SCORE_METRICS,
  THRESHOLD_METRICS,
  type PageConfig,
  type SiteConfig,
  type SitesFile,
  type ThresholdLine,
  type ThresholdMetric,
  type ThresholdOverrides,
} from '~~/shared/types/sentinel'

export const SITES_FILE = 'sentinel.sites.json'
const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/

function sitesPath() {
  return resolve(projectRoot(), SITES_FILE)
}

let cache: { mtimeMs: number; sites: SiteConfig[] } | null = null
/** Set when the file on disk could not be parsed/validated (for that mtime). */
let failed: { mtimeMs: number; error: string } | null = null

/**
 * Sites from sentinel.sites.json (re-read when the file changes). Callers get a copy: the cache
 * must not be mutated by a request that is later rejected. Invalid file → last good list (or []) +
 * error; saving is refused until the file is fixed.
 */
export function loadSites(): SiteConfig[] {
  const file = sitesPath()
  if (!existsSync(file)) {
    failed = null
    return []
  }
  const mtimeMs = statSync(file).mtimeMs
  if (cache && cache.mtimeMs === mtimeMs) return structuredClone(cache.sites)
  if (failed && failed.mtimeMs === mtimeMs) return structuredClone(cache?.sites ?? [])
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as SitesFile
    const sites = validateSites(parsed?.sites ?? [])
    cache = { mtimeMs, sites }
    failed = null
    return structuredClone(sites)
  } catch (err) {
    failed = { mtimeMs, error: `${SITES_FILE}: ${(err as Error).message}` }
    console.error('[sentinel]', failed.error)
    return structuredClone(cache?.sites ?? [])
  }
}

export function sitesError() {
  return failed?.error ?? null
}

/** Writes the file atomically; refused (409) while the file on disk is invalid, so a typo can never be overwritten with an empty list. */
export function saveSites(sites: SiteConfig[]) {
  loadSites()
  if (failed)
    throw createError({
      statusCode: 409,
      statusMessage: `${SITES_FILE} is invalid (${failed.error}); fix the file before saving`,
    })
  const valid = validateSites(sites)
  const file = sitesPath()
  writeFileSync(file + '.tmp', JSON.stringify({ sites: valid }, null, 2) + '\n')
  renameSync(file + '.tmp', file)
  cache = null
  return valid
}

function bad(message: string): never {
  throw createError({ statusCode: 400, statusMessage: message })
}

/** `{ metric: { warn?, fail? } }`; empty values are dropped. Scores need warn ≥ fail, timings warn ≤ fail. */
export function validateThresholds(input: unknown): ThresholdOverrides | undefined {
  if (input == null) return undefined
  if (typeof input !== 'object') bad('thresholds must be an object')
  const out: ThresholdOverrides = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const metric = k as ThresholdMetric
    if (!THRESHOLD_METRICS.includes(metric)) bad(`Unknown threshold "${k}"`)
    if (v == null) continue
    if (typeof v !== 'object') bad(`Threshold "${k}" must be an object { warn, fail }`)
    const line: Partial<ThresholdLine> = {}
    for (const level of ['warn', 'fail'] as const) {
      const n = (v as Record<string, unknown>)[level]
      if (n == null || n === '') continue
      if (typeof n !== 'number' || !Number.isFinite(n) || n < 0)
        bad(`Threshold "${k}.${level}" must be a number`)
      if ((SCORE_METRICS as string[]).includes(metric) && n > 100)
        bad(`Threshold "${k}.${level}" is a score: 0–100`)
      line[level] = n
    }
    if (line.warn != null && line.fail != null) {
      const isScore = (SCORE_METRICS as string[]).includes(metric)
      if (isScore ? line.warn < line.fail : line.warn > line.fail)
        bad(
          `Threshold "${k}": the warn line must be ${isScore ? 'higher' : 'lower'} than the fail line`
        )
    }
    if (Object.keys(line).length) out[metric] = line
  }
  return Object.keys(out).length ? out : undefined
}

const MAX_LABEL = 200

/** Merged (global + site + page) lines must still be ordered, or `warn` could never fire. */
function assertOrdered(site: Partial<SiteConfig>, page?: Partial<PageConfig>) {
  const merged = mergeThresholds(config.thresholds, site.thresholds, page?.thresholds)
  for (const metric of THRESHOLD_METRICS) {
    const { warn, fail } = merged[metric]
    const isScore = (SCORE_METRICS as string[]).includes(metric)
    if (isScore ? warn < fail : warn > fail)
      bad(
        `Threshold "${metric}": once merged with the site/global lines, warn (${warn}) is ${isScore ? 'below' : 'above'} fail (${fail})`
      )
  }
}

export function validatePage(input: Partial<PageConfig>, site?: Partial<SiteConfig>): PageConfig {
  const id = str(input.id)
  const label = str(input.label)
  const path = str(input.path)
  if (!ID_RE.test(id)) bad(`Invalid page id "${id}" (lowercase letters, digits and dashes)`)
  if (!label || label.length > MAX_LABEL) bad(`Page label is required (max ${MAX_LABEL} chars)`)
  if (!(path.startsWith('/') || /^https?:\/\//.test(path)) || path.length > 2000)
    bad('Path must start with / (or be a full http(s) URL)')
  const page: PageConfig = { id, label, path }
  const thresholds = validateThresholds(input.thresholds)
  if (thresholds) page.thresholds = thresholds
  if (site) assertOrdered(site, page)
  return page
}

/** `https://host[:port]` only: paths, query strings, fragments and credentials are refused. */
export function validateBaseUrl(raw: unknown): string {
  const text = str(raw)
  let u: URL
  try {
    u = new URL(text)
  } catch {
    return bad('Base URL must be a valid http(s) URL')
  }
  if (!/^https?:$/.test(u.protocol)) bad('Base URL must be a valid http(s) URL')
  if (u.username || u.password || u.search || u.hash || (u.pathname !== '/' && u.pathname !== ''))
    bad('Base URL must be an origin like https://example.com (no path, query or credentials)')
  return u.origin
}

export function validateSite(input: Partial<SiteConfig>): SiteConfig {
  const id = str(input.id)
  const name = str(input.name)
  if (!ID_RE.test(id)) bad(`Invalid site id "${id}" (lowercase letters, digits and dashes)`)
  if (!name || name.length > MAX_LABEL) bad(`Site name is required (max ${MAX_LABEL} chars)`)
  const baseUrl = validateBaseUrl(input.baseUrl)
  if (input.pages != null && !Array.isArray(input.pages)) bad('"pages" must be an array')
  const siteThresholds = validateThresholds(input.thresholds)
  assertOrdered({ thresholds: siteThresholds })
  const pages = (input.pages ?? []).map((p) =>
    validatePage(p as Partial<PageConfig>, { thresholds: siteThresholds })
  )
  const seen = new Set<string>()
  for (const p of pages) {
    if (seen.has(p.id)) bad(`Duplicate page id "${p.id}"`)
    seen.add(p.id)
  }
  const site: SiteConfig = { id, name, baseUrl, pages }
  if (siteThresholds) site.thresholds = siteThresholds
  return site
}

export function validateSites(input: unknown): SiteConfig[] {
  if (!Array.isArray(input)) bad('"sites" must be an array')
  const sites = input.map((s) => validateSite(s as Partial<SiteConfig>))
  const seen = new Set<string>()
  for (const s of sites) {
    if (seen.has(s.id)) bad(`Duplicate site id "${s.id}"`)
    seen.add(s.id)
  }
  return sites
}

/** Unique id derived from a base, appending -2, -3… when taken. */
export function uniqueId(base: string, taken: Iterable<string>) {
  const set = new Set(taken)
  let id = base || 'site'
  for (let n = 2; set.has(id); n++) id = `${base}-${n}`
  return id
}

/** 409 while a run of this site is in progress: its page list must not change under it. */
export function assertSiteIdle(siteId: string) {
  const active = getActiveRun()
  if (active?.siteId === siteId)
    throw createError({
      statusCode: 409,
      statusMessage: `Run #${active.id} of this site is in progress; try again when it is done`,
    })
}
