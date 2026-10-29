#!/usr/bin/env node
/**
 * Bootstrap the `site` and `pages` blocks of sentinel.config.ts from a site's sitemap.
 *
 *   pnpm sentinel:init https://www.example.com [--force]
 *
 * Reads robots.txt for `Sitemap:` entries (falls back to /sitemap.xml), follows
 * sitemap indexes, then keeps one representative URL per page template so a
 * sitemap with thousands of articles yields a short list (one home, one article,
 * one category page, ...). Writes to sentinel.config.ts only when its `pages`
 * list is empty or --force is given; otherwise it prints the snippet.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const CONFIG_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../sentinel.config.ts'
)
const MAX_SITEMAPS = 50
const DISTINCT_VALUES_BEFORE_COLLAPSE = 3
const SECONDS_PER_PSI_CALL = 12
const CALLS_PER_PAGE = 6 // 3 samples × 2 strategies

const args = process.argv.slice(2)
const force = args.includes('--force')
const input = args.find((a) => !a.startsWith('--'))
if (!input) {
  console.error('Usage: pnpm sentinel:init <https://site-url> [--force]')
  process.exit(1)
}
const base = new URL(input)
const origin = base.origin

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'web-quality-sentinel/init' } })
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

async function discoverSitemaps() {
  try {
    const robots = await fetchText(`${origin}/robots.txt`)
    const found = [...robots.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1])
    if (found.length) return found
  } catch {
    // no robots.txt: fall through
  }
  return [`${origin}/sitemap.xml`]
}

async function collectUrls(sitemapUrls) {
  const entries = new Map() // loc → { lastmod, priority }
  const queue = [...sitemapUrls]
  let visited = 0
  while (queue.length && visited < MAX_SITEMAPS) {
    const url = queue.shift()
    visited++
    let xml
    try {
      xml = await fetchText(url)
    } catch (e) {
      console.warn(`skip ${e.message}`)
      continue
    }
    if (!isXml(xml)) {
      console.warn(`skip ${url}: not an XML sitemap`)
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

const PARAM_LIKE = /^(\d+|[0-9a-f]{8}-[0-9a-f-]{27,}|[0-9a-f]{16,})$/i

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

function toId(template, repPath, used) {
  let words = template.split('/').filter((s) => s && s !== '*')
  if (!words.length) words = repPath.split('/').filter((s) => s && !PARAM_LIKE.test(s))
  let id =
    words
      .join('-')
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'home'
  const baseId = id
  for (let n = 2; used.has(id); n++) id = `${baseId}-${n}`
  used.add(id)
  return id
}

function toLabel(id) {
  return id
    .split('-')
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ')
}

function siteName(url) {
  const host = url.hostname.replace(/^www\./, '')
  return host
    .split('.')[0]
    .split('-')
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ')
}

function renderSnippet(pages) {
  const lines = pages.map((p) => `    { id: '${p.id}', label: '${p.label}', path: '${p.path}' },`)
  return (
    `  site: {\n    name: '${siteName(base)}',\n    baseUrl: '${origin}',\n  },\n\n` +
    `  // Pages monitored on every run. Keep this list short: each page costs\n` +
    `  // samples × strategies PSI requests (default 3 × 2 = 6 requests per page).\n` +
    `  pages: [\n${lines.join('\n')}\n  ],`
  )
}

const sitemaps = await discoverSitemaps()
console.log(`Sitemaps: ${sitemaps.join(', ')}`)
const entries = await collectUrls(sitemaps)
if (!entries.size) {
  console.error(`No sitemap URLs found for ${origin}. Add the pages to sentinel.config.ts by hand.`)
  process.exit(2)
}
const used = new Set()
const pages = pickRepresentatives(entries).map((r) => {
  const id = toId(r.template, r.path, used)
  return { id, label: toLabel(id), path: r.path, template: r.template }
})

console.log(`\n${entries.size} URLs in sitemap → ${pages.length} page templates:\n`)
for (const p of pages) console.log(`  ${p.template.padEnd(40)} → ${p.path}`)
const minutes = Math.round((pages.length * CALLS_PER_PAGE * SECONDS_PER_PSI_CALL) / 60)
console.log(
  `\nEstimated full run: ${pages.length} pages × ${CALLS_PER_PAGE} PSI calls ≈ ${minutes} min\n`
)

const snippet = renderSnippet(pages)
const config = await readFile(CONFIG_PATH, 'utf8')
const siteRe = / {2}site: \{[\s\S]*?\n {2}\},\n\n?/
const pagesRe = /( {2}\/\/ Pages monitored[\s\S]*?)? {2}pages: \[[\s\S]*?\n {2}\],/
const hasPages = / {2}pages: \[\s*\{/.test(config)
if (hasPages && !force) {
  console.log('sentinel.config.ts already has pages; not overwriting (use --force). Snippet:\n')
  console.log(snippet)
} else if (siteRe.test(config) && pagesRe.test(config)) {
  const next = config.replace(siteRe, '').replace(pagesRe, snippet)
  await writeFile(CONFIG_PATH, next)
  console.log(
    `Wrote site + ${pages.length} pages to sentinel.config.ts. Review the list, then run pnpm dev.`
  )
} else {
  console.log('Could not locate the site/pages blocks in sentinel.config.ts. Snippet:\n')
  console.log(snippet)
}
