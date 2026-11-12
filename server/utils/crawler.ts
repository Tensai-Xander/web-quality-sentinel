import { chromium, type Browser } from 'playwright'

export interface CrawlOptions {
  /** Max same-site links checked per page. */
  maxLinks: number
  /** Page load timeout (ms). */
  timeoutMs: number
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
export interface CrawlResult {
  url: string
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
  durationMs: number
}

const UA =
  'Mozilla/5.0 (compatible; web-quality-sentinel/1.0; +https://github.com/Tensai-Xander/web-quality-sentinel)'
const LINK_TIMEOUT_MS = 12000
const LINK_CONCURRENCY = 5

let browser: Browser | null = null
async function getBrowser() {
  if (browser?.isConnected()) return browser
  browser = await chromium.launch({ headless: true })
  return browser
}

/** Browser visit of one page: HTTP status, JS errors, failed requests, links, meta tags, JSON-LD. */
export async function crawlPage(url: string, opts: CrawlOptions): Promise<CrawlResult> {
  const started = Date.now()
  const b = await getBrowser()
  const context = await b.newContext({ userAgent: UA, viewport: { width: 1280, height: 900 } })
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
    const { total, checked, broken } = await checkLinks(data.links, origin, finalUrl, opts.maxLinks)

    return {
      url,
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
