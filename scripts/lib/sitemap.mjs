/**
 * Sitemap discovery and page-template grouping, shared by `pnpm sentinel:init`
 * and the Settings page ("Import pages from sitemap").
 */
const MAX_SITEMAPS = 50
const DISTINCT_VALUES_BEFORE_COLLAPSE = 3
export const SECONDS_PER_PSI_CALL = 12
export const CALLS_PER_PAGE = 6 // 3 samples × 2 strategies

const PARAM_LIKE = /^(\d+|[0-9a-f]{8}-[0-9a-f-]{27,}|[0-9a-f]{16,})$/i

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': 'web-quality-sentinel/init' },
    signal: AbortSignal.timeout(20000),
  })
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
  return res.text()
}

function isXml(text) {
  const head = text.slice(0, 500).trimStart().toLowerCase()
  return head.startsWith('<?xml') || head.includes('<urlset') || head.includes('<sitemapindex')
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}>\\s*([^<]+?)\\s*</${name}>`, 'i'))
  return m ? m[1] : null
}

async function discoverSitemaps(origin) {
  try {
    const robots = await fetchText(`${origin}/robots.txt`)
    const found = [...robots.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1])
    if (found.length) return found
  } catch {
    // no robots.txt: fall through
  }
  return [`${origin}/sitemap.xml`]
}

async function collectUrls(origin, sitemapUrls, warn) {
  const entries = new Map() // path → { lastmod, priority }
  const queue = [...sitemapUrls]
  let visited = 0
  while (queue.length && visited < MAX_SITEMAPS) {
    const url = queue.shift()
    visited++
    let xml
    try {
      xml = await fetchText(url)
    } catch (e) {
      warn(`skip ${e.message}`)
      continue
    }
    if (!isXml(xml)) {
      warn(`skip ${url}: not an XML sitemap`)
      continue
    }
    if (/<sitemapindex/i.test(xml)) {
      for (const m of xml.matchAll(/<sitemap>([\s\S]*?)<\/sitemap>/gi)) {
        const loc = tag(m[1], 'loc')
        if (loc) queue.push(loc)
      }
      continue
    }
    for (const m of xml.matchAll(/<url>([\s\S]*?)<\/url>/gi)) {
      const loc = tag(m[1], 'loc')
      if (!loc) continue
      let u
      try {
        u = new URL(loc)
      } catch {
        continue
      }
      if (u.origin !== origin) continue
      entries.set(u.pathname.replace(/\/+$/, '') || '/', {
        lastmod: tag(m[1], 'lastmod'),
        priority: Number(tag(m[1], 'priority') ?? 0.5),
      })
    }
  }
  return entries
}

/**
 * Collapse path segments that vary a lot under the same parent into `*`, depth by depth,
 * e.g. /blog/post-a, /blog/post-b, /blog/post-c, /blog/post-d → /blog/*.
 * The first segment is never collapsed: top-level sections (/blog, /docs, /garage) are
 * distinct kinds of pages even when there are many of them. Literal siblings of ids
 * (/garage/add next to /garage/58) are counted separately so they stay visible.
 */
function templatesFor(paths) {
  const segs = paths.map((p) => (p === '/' ? [] : p.slice(1).split('/')))
  const templates = segs.map((s) => [...s])
  const maxDepth = Math.max(0, ...segs.map((s) => s.length))
  for (let d = 0; d < maxDepth; d++) {
    const byParent = new Map()
    segs.forEach((s, i) => {
      if (s.length <= d) return
      const parent = templates[i].slice(0, d).join('/')
      if (!byParent.has(parent)) byParent.set(parent, new Set())
      if (!PARAM_LIKE.test(s[d])) byParent.get(parent).add(s[d])
    })
    segs.forEach((s, i) => {
      if (s.length <= d) return
      const parent = templates[i].slice(0, d).join('/')
      const distinct = byParent.get(parent).size
      if (PARAM_LIKE.test(s[d]) || (d > 0 && distinct > DISTINCT_VALUES_BEFORE_COLLAPSE))
        templates[i][d] = '*'
    })
  }
  return templates.map((t) => (t.length ? '/' + t.join('/') : '/'))
}

function pickRepresentatives(entries) {
  const paths = [...entries.keys()]
  const templates = templatesFor(paths)
  const best = new Map()
  paths.forEach((p, i) => {
    const t = templates[i]
    const e = entries.get(p)
    const cur = best.get(t)
    const better =
      !cur ||
      e.priority > cur.priority ||
      (e.priority === cur.priority && (e.lastmod ?? '') > (cur.lastmod ?? '')) ||
      (e.priority === cur.priority &&
        (e.lastmod ?? '') === (cur.lastmod ?? '') &&
        p.length < cur.path.length)
    if (better) best.set(t, { ...e, path: p, template: t })
  })
  return [...best.values()].sort(
    (a, b) =>
      a.template.split('/').length - b.template.split('/').length ||
      a.template.localeCompare(b.template)
  )
}

export function slugify(words) {
  return (
    words
      .join('-')
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'home'
  )
}

/** Page id from a path: /garage/posts → garage-posts, numeric/UUID segments skipped. */
export function pageIdFromPath(path) {
  const words = String(path)
    .replace(/^https?:\/\/[^/]+/, '')
    .split(/[/?#]/)
    .filter((s) => s && !PARAM_LIKE.test(s))
  return slugify(words)
}

export function labelFromId(id) {
  return id
    .split('-')
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ')
}

function toId(template, repPath, used) {
  // Templates with parameters are named after their representative (/services/* → services-kinto-go)
  let words = template.includes('*')
    ? repPath.split('/').filter((s) => s && !PARAM_LIKE.test(s))
    : template.split('/').filter((s) => s)
  if (!words.length) words = template.split('/').filter((s) => s && s !== '*')
  let id = slugify(words)
  const baseId = id
  for (let n = 2; used.has(id); n++) id = `${baseId}-${n}`
  used.add(id)
  return id
}

/** Site id from a URL: https://www.kinto-mobility.com → kinto-mobility */
export function siteIdFromUrl(url) {
  return new URL(url).hostname
    .replace(/^www\./, '')
    .split('.')[0]
    .toLowerCase()
}

export function siteNameFromUrl(url) {
  return labelFromId(siteIdFromUrl(url))
}

export function estimateMinutes(pageCount) {
  return Math.round((pageCount * CALLS_PER_PAGE * SECONDS_PER_PSI_CALL) / 60)
}

/**
 * Read the sitemap(s) of a site and propose one page per page template.
 * @param {string} siteUrl
 * @param {(msg: string) => void} [warn]
 */
export async function proposePages(siteUrl, warn = () => {}) {
  const origin = new URL(siteUrl).origin
  const sitemaps = await discoverSitemaps(origin)
  const entries = await collectUrls(origin, sitemaps, warn)
  const used = new Set()
  const pages = pickRepresentatives(entries).map((r) => {
    const id = toId(r.template, r.path, used)
    return { id, label: labelFromId(id), path: r.path, template: r.template }
  })
  return {
    origin,
    siteId: siteIdFromUrl(siteUrl),
    siteName: siteNameFromUrl(siteUrl),
    sitemaps,
    urlCount: entries.size,
    pages,
    estimatedMinutes: estimateMinutes(pages.length),
  }
}
