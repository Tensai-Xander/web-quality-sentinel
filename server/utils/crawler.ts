import { chromium, type Browser } from 'playwright'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const UA_TAG = 'web-quality-sentinel/1.0 (+https://github.com/Tensai-Xander/web-quality-sentinel)'
const UA_BASE = `Mozilla/5.0 (compatible; ${UA_TAG})`
const UA = UA_BASE

export interface CrawlOptions {
  /** Max same-site links checked per page. */
  maxLinks: number
  /** Page load timeout (ms). */
  timeoutMs: number
}
export type CrawlStrategy = 'mobile' | 'desktop'
/** Viewports/user agents close to PSI's Lighthouse devices. */
const DEVICES: Record<
  CrawlStrategy,
  { ua: string; viewport: { width: number; height: number }; isMobile: boolean }
> = {
  desktop: { ua: UA_BASE, viewport: { width: 1280, height: 900 }, isMobile: false },
  mobile: {
    ua: `Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 ${UA_TAG}`,
    viewport: { width: 390, height: 844 },
    isMobile: true,
  },
}

export interface BrokenLink {
  url: string
  status: number | null
  error?: string
  /** Link text, to find it on the page. */
  text: string
}
export interface FailedRequest {
  url: string
  status: number | null
  error?: string
}
export interface MetaInfo {
  title: string | null
  description: string | null
  canonical: string | null
  robots: string | null
  lang: string | null
  ogTitle: string | null
  ogDescription: string | null
  ogImage: string | null
  h1Count: number
  issues: string[]
}
export interface JsonLdInfo {
  count: number
  types: string[]
  issues: string[]
}
export type A11yImpact = 'critical' | 'serious' | 'moderate' | 'minor'
/** One axe-core rule that failed, with a sample of the affected elements. */
export interface A11yViolation {
  id: string
  impact: A11yImpact
  help: string
  helpUrl: string
  /** WCAG level/criteria tags, e.g. wcag2aa, wcag143; "best-practice" for non-WCAG rules. */
  tags: string[]
  /** Number of affected elements. */
  nodes: number
  /** First elements: CSS selector and HTML snippet. */
  samples: { target: string; html: string }[]
}
export interface A11yInfo {
  /** Rules that failed (axe-core violations). */
  violations: A11yViolation[]
  /** Total affected elements. */
  elements: number
  /** Rules checked without failure. */
  passes: number
  error?: string
}
export interface CrawlResult {
  url: string
  strategy: CrawlStrategy
  finalUrl: string
  httpStatus: number | null
  consoleErrors: string[]
  pageErrors: string[]
  failedRequests: FailedRequest[]
  linksTotal: number
  linksChecked: number
  brokenLinks: BrokenLink[]
  meta: MetaInfo
  jsonld: JsonLdInfo
  a11y: A11yInfo
  durationMs: number
}

const LINK_TIMEOUT_MS = 12000
const LINK_CONCURRENCY = 5

let browser: Browser | null = null
async function getBrowser() {
  if (browser?.isConnected()) return browser
  browser = await chromium.launch({ headless: true })
  return browser
}

/** Browser visit of one page: HTTP status, JS errors, failed requests, links, meta tags, JSON-LD. */
export async function crawlPage(
  url: string,
  opts: CrawlOptions,
  strategy: CrawlStrategy = 'desktop',
  checkLinksToo = true
): Promise<CrawlResult> {
  const started = Date.now()
  const b = await getBrowser()
  const dev = DEVICES[strategy]
  const context = await b.newContext({
    userAgent: dev.ua,
    viewport: dev.viewport,
    isMobile: dev.isMobile,
    hasTouch: dev.isMobile,
    deviceScaleFactor: dev.isMobile ? 3 : 1,
  })
  const page = await context.newPage()
  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  const failedRequests: FailedRequest[] = []
  const origin = new URL(url).origin

  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(trim(m.text()))
  })
  page.on('pageerror', (e) => pageErrors.push(trim(e.message)))
  page.on('requestfailed', (r) => {
    // aborted requests (navigation, ad blockers) are noise; keep genuine network failures
    const err = r.failure()?.errorText ?? 'failed'
    if (!/ABORTED|BLOCKED_BY_CLIENT/.test(err))
      failedRequests.push({ url: r.url(), status: null, error: err })
  })
  page.on('response', (r) => {
    if (r.status() >= 400 && r.url() !== url)
      failedRequests.push({ url: r.url(), status: r.status() })
  })

  try {
    const response = await page.goto(url, { waitUntil: 'load', timeout: opts.timeoutMs })
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
    const httpStatus = response?.status() ?? null
    const finalUrl = page.url()

    // Runs in the browser; kept as a string so the server tsconfig needs no DOM types.
    const data = (await page.evaluate(`(() => {
      const q = (sel) => document.querySelector(sel)
      const content = (sel) => (q(sel) ? q(sel).getAttribute('content') : null)
      const scripts = [...document.querySelectorAll('script[type="application/ld+json"]')].map(
        (s) => s.textContent || ''
      )
      const links = [...document.querySelectorAll('a[href]')].map((a) => ({
        href: a.href,
        text: (a.textContent || '').trim().slice(0, 60),
      }))
      return {
        title: document.title || null,
        description: content('meta[name="description"]'),
        canonical: q('link[rel="canonical"]') ? q('link[rel="canonical"]').getAttribute('href') : null,
        robots: content('meta[name="robots"]'),
        lang: document.documentElement.getAttribute('lang'),
        ogTitle: content('meta[property="og:title"]'),
        ogDescription: content('meta[property="og:description"]'),
        ogImage: content('meta[property="og:image"]'),
        h1Count: document.querySelectorAll('h1').length,
        scripts,
        links,
      }
    })()`)) as Omit<MetaInfo, 'issues'> & {
      scripts: string[]
      links: { href: string; text: string }[]
    }

    const meta = checkMeta(data, finalUrl)
    const jsonld = checkJsonLd(data.scripts)
    const a11y = await checkA11y(page)
    const { total, checked, broken } = checkLinksToo
      ? await checkLinks(data.links, origin, finalUrl, opts.maxLinks)
      : { total: 0, checked: 0, broken: [] }

    return {
      url,
      strategy,
      finalUrl,
      httpStatus,
      consoleErrors: dedupe(consoleErrors),
      pageErrors: dedupe(pageErrors),
      failedRequests: dedupeBy(failedRequests, (f) => f.url).slice(0, 30),
      linksTotal: total,
      linksChecked: checked,
      brokenLinks: broken,
      meta,
      jsonld,
      a11y,
      durationMs: Date.now() - started,
    }
  } finally {
    await context.close().catch(() => {})
  }
}

export async function closeCrawler() {
  await browser?.close().catch(() => {})
  browser = null
}

function trim(s: string) {
  return s.replace(/\s+/g, ' ').trim().slice(0, 300)
}
function dedupe(list: string[]) {
  return [...new Set(list)]
}
function dedupeBy<T>(list: T[], key: (t: T) => string) {
  const seen = new Set<string>()
  return list.filter((t) => (seen.has(key(t)) ? false : (seen.add(key(t)), true)))
}

function checkMeta(
  d: Omit<MetaInfo, 'issues'> & { scripts: string[]; links: unknown[] },
  finalUrl: string
): MetaInfo {
  const issues: string[] = []
  if (!d.title) issues.push('Missing <title>')
  else if (d.title.length > 70) issues.push(`Title is long (${d.title.length} chars)`)
  if (!d.description) issues.push('Missing meta description')
  else if (d.description.length > 160)
    issues.push(`Meta description is long (${d.description.length} chars)`)
  const noindex = /noindex/i.test(d.robots ?? '')
  if (!d.canonical && !noindex) issues.push('Missing canonical link')
  else if (d.canonical) {
    try {
      const c = new URL(d.canonical, finalUrl)
      const f = new URL(finalUrl)
      if (c.origin !== f.origin) issues.push(`Canonical points to another origin (${c.origin})`)
    } catch {
      issues.push(`Invalid canonical URL "${d.canonical}"`)
    }
  }
  if (!d.lang) issues.push('Missing <html lang>')
  if (!d.ogTitle) issues.push('Missing og:title')
  if (!d.ogDescription) issues.push('Missing og:description')
  if (!d.ogImage) issues.push('Missing og:image')
  if (d.h1Count === 0) issues.push('No <h1>')
  else if (d.h1Count > 1) issues.push(`${d.h1Count} <h1> elements`)
  const { scripts: _s, links: _l, ...meta } = d
  return { ...meta, issues }
}

function checkJsonLd(scripts: string[]): JsonLdInfo {
  const types: string[] = []
  const issues: string[] = []
  scripts.forEach((raw, i) => {
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch (e) {
      issues.push(`JSON-LD #${i + 1} is not valid JSON (${(e as Error).message.slice(0, 80)})`)
      return
    }
    const nodes = Array.isArray(parsed)
      ? parsed
      : ((parsed as { '@graph'?: unknown[] })?.['@graph'] ?? [parsed])
    for (const n of nodes as Record<string, unknown>[]) {
      if (!n || typeof n !== 'object') {
        issues.push(`JSON-LD #${i + 1} contains a non-object entry`)
        continue
      }
      const type = n['@type']
      if (!type) issues.push(`JSON-LD #${i + 1} has an entry without @type`)
      else types.push(Array.isArray(type) ? type.join('/') : String(type))
      if (
        !n['@context'] &&
        !Array.isArray(parsed) &&
        !(parsed as Record<string, unknown>)['@context']
      )
        issues.push(`JSON-LD #${i + 1} (${type ?? '?'}) has no @context`)
    }
  })
  return { count: scripts.length, types: dedupe(types), issues }
}

const A11Y_MAX_RULES = 30
const A11Y_MAX_SAMPLES = 5
const IMPACT_ORDER: Record<A11yImpact, number> = { critical: 0, serious: 1, moderate: 2, minor: 3 }

// Read axe's browser bundle from disk instead of importing it: bundling it into the server
// rewrites its `typeof module/window` checks, which breaks the script once injected into a page.
let axeSource: string | undefined
function loadAxe(): string {
  axeSource ??= readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')
  return axeSource
}

/** axe-core audit of the rendered page (WCAG 2.x A/AA rules + axe best practices). */
async function checkA11y(page: import('playwright').Page): Promise<A11yInfo> {
  try {
    // evaluate() is not subject to the page's CSP (unlike an injected <script>); new Function
    // runs the bundle in the page's global scope rather than Playwright's utility scope
    await page.evaluate((src) => new Function(src)(), loadAxe())
    // default rule set: WCAG 2.x A/AA + axe best practices (experimental rules are off by default)
    const raw = (await page.evaluate(`window.axe.run(document, {
      resultTypes: ['violations'],
    }).then((r) => ({
      passes: r.passes.length,
      violations: r.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        helpUrl: v.helpUrl,
        tags: v.tags,
        nodes: v.nodes.length,
        samples: v.nodes.slice(0, ${A11Y_MAX_SAMPLES}).map((n) => ({
          target: n.target.join(' '),
          html: n.html,
        })),
      })),
    }))`)) as { passes: number; violations: A11yViolation[] }
    const violations = raw.violations
      .filter((v) => v.impact)
      .map((v) => ({
        ...v,
        helpUrl: v.helpUrl.split('?')[0]!,
        tags: v.tags.filter((t) => /^(wcag|best-practice)/.test(t)),
        samples: v.samples.map((n) => ({ target: n.target.slice(0, 200), html: trim(n.html) })),
      }))
      .sort((a, b) => IMPACT_ORDER[a.impact] - IMPACT_ORDER[b.impact] || b.nodes - a.nodes)
      .slice(0, A11Y_MAX_RULES)
    return {
      violations,
      elements: raw.violations.reduce((n, v) => n + v.nodes, 0),
      passes: raw.passes,
    }
  } catch (e) {
    return { violations: [], elements: 0, passes: 0, error: trim((e as Error).message) }
  }
}

async function checkLinks(
  links: { href: string; text: string }[],
  origin: string,
  pageUrl: string,
  maxLinks: number
) {
  const seen = new Map<string, string>()
  for (const l of links) {
    let u: URL
    try {
      u = new URL(l.href)
    } catch {
      continue
    }
    if (!/^https?:$/.test(u.protocol) || u.origin !== origin) continue
    u.hash = ''
    const key = u.toString()
    if (key === pageUrl || seen.has(key)) continue
    seen.set(key, l.text)
  }
  const targets = [...seen.entries()].slice(0, maxLinks)
  const broken: BrokenLink[] = []
  let i = 0
  await Promise.all(
    Array.from({ length: LINK_CONCURRENCY }, async () => {
      while (i < targets.length) {
        const [url, text] = targets[i++]!
        const r = await probe(url)
        if (r.status == null || r.status >= 400) broken.push({ url, text, ...r })
      }
    })
  )
  return { total: seen.size, checked: targets.length, broken }
}

async function probe(url: string): Promise<{ status: number | null; error?: string }> {
  for (const method of ['HEAD', 'GET'] as const) {
    try {
      const res = await fetch(url, {
        method,
        redirect: 'follow',
        headers: { 'user-agent': UA, accept: 'text/html,*/*' },
        signal: AbortSignal.timeout(LINK_TIMEOUT_MS),
      })
      // some servers reject HEAD (405/403); retry with GET before judging
      if (method === 'HEAD' && (res.status === 405 || res.status === 403 || res.status === 404))
        continue
      return { status: res.status }
    } catch (e) {
      if (method === 'HEAD') continue
      return {
        status: null,
        error: (e as Error).name === 'TimeoutError' ? 'timeout' : (e as Error).message.slice(0, 80),
      }
    }
  }
  return { status: null, error: 'unreachable' }
}
