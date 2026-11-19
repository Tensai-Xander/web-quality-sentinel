import { mkdtempSync, readdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const site = { id: 'demo', name: 'Demo', baseUrl: 'https://demo.example', pages: [] }
let root: string
const file = () => join(root, 'sentinel.sites.json')
/** Writes with a distinct mtime: the loader's cache is keyed on it and FS timestamps may be coarse. */
let clock = 1_700_000_000
function write(content: string) {
  write(content)
  utimesSync(file(), ++clock, clock)
}

async function load() {
  vi.resetModules()
  return import('~~/server/utils/sites')
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'wqs-'))
  process.env.SENTINEL_ROOT = root
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  delete process.env.SENTINEL_ROOT
  vi.restoreAllMocks()
})

describe('loadSites / saveSites', () => {
  it('missing file → no sites, no error', async () => {
    const m = await load()
    expect(m.loadSites()).toEqual([])
    expect(m.sitesError()).toBeNull()
  })
  it('returns a copy, so callers cannot change the cached list', async () => {
    write(JSON.stringify({ sites: [site] }))
    const m = await load()
    const first = m.loadSites()
    first[0]!.name = 'Changed'
    first.push({ ...site, id: 'other' })
    expect(m.loadSites()).toEqual([site])
  })
  it('an invalid file keeps the last good list, reports the error once and blocks saves', async () => {
    write(JSON.stringify({ sites: [site] }))
    const m = await load()
    expect(m.loadSites()).toEqual([site])
    write('{ "sites": [ oops')
    expect(m.loadSites()).toEqual([site])
    expect(m.sitesError()).toMatch(/sentinel\.sites\.json/)
    m.loadSites()
    expect(console.error).toHaveBeenCalledTimes(1)
    expect(() => m.saveSites([])).toThrowError(expect.objectContaining({ statusCode: 409 }))
    expect(readFileSync(file(), 'utf8')).toBe('{ "sites": [ oops')
  })
  it('a wrong document shape ({ "site": [] }) is invalid too', async () => {
    write(JSON.stringify({ site: [site] }))
    const m = await load()
    expect(m.loadSites()).toEqual([])
    expect(m.sitesError()).toMatch(/expected \{ "sites"/)
    expect(() => m.saveSites([site])).toThrowError(expect.objectContaining({ statusCode: 409 }))
  })
  it('saves atomically and re-reads what it wrote', async () => {
    const m = await load()
    m.saveSites([{ ...site, baseUrl: 'https://demo.example/' }])
    expect(readdirSync(root)).toEqual(['sentinel.sites.json'])
    expect(JSON.parse(readFileSync(file(), 'utf8'))).toEqual({ sites: [site] })
    expect(m.loadSites()).toEqual([site])
    expect(m.sitesError()).toBeNull()
  })
})
