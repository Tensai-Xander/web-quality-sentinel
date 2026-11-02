#!/usr/bin/env node
/**
 * Add a site (with its pages) to sentinel.sites.json from its sitemap.
 *
 *   pnpm sentinel:init https://www.example.com [--force]
 *
 * Reads robots.txt for `Sitemap:` entries (falls back to /sitemap.xml), follows
 * sitemap indexes, then keeps one representative URL per page template so a
 * sitemap with thousands of articles yields a short list (one home, one article,
 * one category page, ...). If a site with the same id already exists the
 * snippet is only printed, unless --force is given, in which case it is replaced.
 * The same import is available in the dashboard: Settings → "Import from sitemap".
 */
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { proposePages } from './lib/sitemap.mjs'

const SITES_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../sentinel.sites.json'
)

const args = process.argv.slice(2)
const force = args.includes('--force')
const input = args.find((a) => !a.startsWith('--'))
if (!input) {
  console.error('Usage: pnpm sentinel:init <https://site-url> [--force]')
  process.exit(1)
}

const result = await proposePages(input, (msg) => console.warn(msg))
console.log(`Sitemaps: ${result.sitemaps.join(', ')}`)
if (!result.pages.length) {
  console.error(
    `No sitemap URLs found for ${result.origin}. Add the pages by hand in Settings or sentinel.sites.json.`
  )
  process.exit(2)
}
console.log(`\n${result.urlCount} URLs in sitemap → ${result.pages.length} page templates:\n`)
for (const p of result.pages) console.log(`  ${p.template.padEnd(40)} → ${p.path}`)
console.log(
  `\nEstimated full run: ${result.pages.length} pages × 6 PSI calls ≈ ${result.estimatedMinutes} min\n`
)

const site = {
  id: result.siteId,
  name: result.siteName,
  baseUrl: result.origin,
  pages: result.pages.map(({ id, label, path: p }) => ({ id, label, path: p })),
}

let file = { sites: [] }
try {
  file = JSON.parse(await readFile(SITES_PATH, 'utf8'))
} catch {
  // missing file: start a new one
}
if (!Array.isArray(file.sites)) file.sites = []
const idx = file.sites.findIndex((s) => s.id === site.id)
if (idx >= 0 && !force) {
  console.log(
    `sentinel.sites.json already has a site '${site.id}'; not overwriting (use --force). Snippet:\n`
  )
  console.log(JSON.stringify(site, null, 2))
  process.exit(0)
}
if (idx >= 0) file.sites[idx] = site
else file.sites.push(site)
await writeFile(SITES_PATH, JSON.stringify(file, null, 2) + '\n')
console.log(
  `${idx >= 0 ? 'Replaced' : 'Added'} site '${site.id}' (${site.pages.length} pages) in sentinel.sites.json. Review the list in Settings, then run.`
)
