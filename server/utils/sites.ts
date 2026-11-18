import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
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
  return resolve(process.cwd(), SITES_FILE)
}

let cache: { mtimeMs: number; sites: SiteConfig[] } | null = null
let lastError: string | null = null

/** Sites from sentinel.sites.json (re-read when the file changes). Invalid file → [] + error. */
export function loadSites(): SiteConfig[] {
  const file = sitesPath()
  if (!existsSync(file)) {
    lastError = null
    return []
  }
  const mtimeMs = statSync(file).mtimeMs
  if (cache && cache.mtimeMs === mtimeMs) return cache.sites
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as SitesFile
    const sites = validateSites(parsed?.sites ?? [])
    cache = { mtimeMs, sites }
    lastError = null
    return sites
  } catch (err) {
    lastError = `${SITES_FILE}: ${(err as Error).message}`
    console.error('[sentinel]', lastError)
    return cache?.sites ?? []
  }
}

export function sitesError() {
  return lastError
}

export function saveSites(sites: SiteConfig[]) {
  const valid = validateSites(sites)
  writeFileSync(sitesPath(), JSON.stringify({ sites: valid }, null, 2) + '\n')
  cache = null
  lastError = null
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

export function validatePage(input: Partial<PageConfig>): PageConfig {
  const id = String(input.id ?? '').trim()
  const label = String(input.label ?? '').trim()
  const path = String(input.path ?? '').trim()
  if (!ID_RE.test(id)) bad(`Invalid page id "${id}" (lowercase letters, digits and dashes)`)
  if (!label) bad('Page label is required')
  if (!(path.startsWith('/') || /^https?:\/\//.test(path)))
    bad('Path must start with / (or be a full URL)')
  const page: PageConfig = { id, label, path }
  const thresholds = validateThresholds(input.thresholds)
  if (thresholds) page.thresholds = thresholds
  return page
}

export function validateSite(input: Partial<SiteConfig>): SiteConfig {
  const id = String(input.id ?? '').trim()
  const name = String(input.name ?? '').trim()
  let baseUrl = String(input.baseUrl ?? '').trim()
  if (!ID_RE.test(id)) bad(`Invalid site id "${id}" (lowercase letters, digits and dashes)`)
  if (!name) bad('Site name is required')
  try {
    const u = new URL(baseUrl)
    if (!/^https?:$/.test(u.protocol)) throw new Error()
    baseUrl = baseUrl.replace(/\/+$/, '')
  } catch {
    bad('Base URL must be a valid http(s) URL')
  }
  const pages = Array.isArray(input.pages) ? input.pages.map(validatePage) : []
  const seen = new Set<string>()
  for (const p of pages) {
    if (seen.has(p.id)) bad(`Duplicate page id "${p.id}"`)
    seen.add(p.id)
  }
  const site: SiteConfig = { id, name, baseUrl, pages }
  const thresholds = validateThresholds(input.thresholds)
  if (thresholds) site.thresholds = thresholds
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
