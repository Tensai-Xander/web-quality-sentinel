#!/usr/bin/env node
/**
 * Add a site (with its pages) to the `sites` list of sentinel.config.ts from its sitemap.
 *
 *   pnpm sentinel:init https://www.example.com [--force]
 *
 * Reads robots.txt for `Sitemap:` entries (falls back to /sitemap.xml), follows
 * sitemap indexes, then keeps one representative URL per page template so a
 * sitemap with thousands of articles yields a short list (one home, one article,
 * one category page, ...). The site is appended to `sites`; if a site with the
 * same id already exists the snippet is only printed, unless --force is given,
 * in which case that entry is replaced.
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
  // Templates with parameters are named after their representative (/services/* → services-kinto-go)
  let words = template.includes('*')
    ? repPath.split('/').filter((s) => s && !PARAM_LIKE.test(s))
    : template.split('/').filter((s) => s)
  if (!words.length) words = template.split('/').filter((s) => s && s !== '*')
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

function siteId(url) {
  return url.hostname
    .replace(/^www\./, '')
    .split('.')[0]
    .toLowerCase()
}

function siteName(url) {
  return siteId(url)
    .split('-')
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ')
}

const MAX_LINE = 100 // keep the generated file prettier-clean

function renderPage(p) {
  const oneLine = `        { id: '${p.id}', label: '${p.label}', path: '${p.path}' },`
  if (oneLine.length <= MAX_LINE) return oneLine
  return [
    '        {',
    `          id: '${p.id}',`,
    `          label: '${p.label}',`,
    `          path: '${p.path}',`,
    '        },',
  ].join('\n')
}

function renderSnippet(id, pages) {
  return [
    '    {',
    `      id: '${id}',`,
    `      name: '${siteName(base)}',`,
    `      baseUrl: '${origin}',`,
    '      pages: [',
    ...pages.map(renderPage),
    '      ],',
    '    },',
  ].join('\n')
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

const id = siteId(base)
const snippet = renderSnippet(id, pages)
const config = await readFile(CONFIG_PATH, 'utf8')
const existingRe = new RegExp(`\\n {4}\\{\\n {6}id: '${id}',[\\s\\S]*?\\n {4}\\},`)
const emptyRe = / {2}sites: \[\s*\],/
const open = config.indexOf('  sites: [')
const close = open >= 0 ? config.indexOf('\n  ],', open) : -1

if (existingRe.test(config) && !force) {
  console.log(
    `sentinel.config.ts already has a site '${id}'; not overwriting (use --force). Snippet:\n`
  )
  console.log(snippet)
} else if (existingRe.test(config)) {
  await writeFile(CONFIG_PATH, config.replace(existingRe, '\n' + snippet))
  console.log(
    `Replaced site '${id}' (${pages.length} pages) in sentinel.config.ts. Review the list, then run pnpm dev.`
  )
} else if (emptyRe.test(config)) {
  await writeFile(CONFIG_PATH, config.replace(emptyRe, `  sites: [\n${snippet}\n  ],`))
  console.log(
    `Added site '${id}' (${pages.length} pages) to sentinel.config.ts. Review the list, then run pnpm dev.`
  )
} else if (open >= 0 && close > open) {
  await writeFile(CONFIG_PATH, config.slice(0, close) + '\n' + snippet + config.slice(close))
  console.log(
    `Added site '${id}' (${pages.length} pages) to sentinel.config.ts. Review the list, then run pnpm dev.`
  )
} else {
  console.log('Could not locate the sites list in sentinel.config.ts. Snippet:\n')
  console.log(snippet)
}
