import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { PageConfig, SiteConfig, SitesFile, Thresholds } from '~~/shared/types/sentinel'

export const SITES_FILE = 'sentinel.sites.json'
const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/
const THRESHOLD_KEYS: (keyof Thresholds)[] = [
  'performance',
  'accessibility',
  'bestPractices',
  'seo',
  'lcp',
  'cls',
  'tbt',
  'fcp',
]

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

export function validateThresholds(input: unknown): Partial<Thresholds> | undefined {
  if (input == null) return undefined
  if (typeof input !== 'object') bad('thresholds must be an object')
  const out: Partial<Thresholds> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!THRESHOLD_KEYS.includes(k as keyof Thresholds)) bad(`Unknown threshold "${k}"`)
    if (v == null || v === '') continue
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0)
      bad(`Threshold "${k}" must be a number`)
    out[k as keyof Thresholds] = v
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
