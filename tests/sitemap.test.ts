import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  labelFromId,
  pageIdFromPath,
  proposePages,
  siteIdFromUrl,
  siteNameFromUrl,
} from '~~/scripts/lib/sitemap.mjs'

describe('naming helpers', () => {
  it('derives ids, labels and site names', () => {
    expect(pageIdFromPath('/')).toBe('home')
    expect(pageIdFromPath('/About-Us/')).toBe('about-us')
    expect(labelFromId('about-us')).toBe('About Us')
    expect(siteIdFromUrl('https://www.kinto-mobility.com/')).toBe('kinto-mobility')
    expect(siteNameFromUrl('https://factory.kinto-jp.com/')).toBe('Factory')
  })
})

describe('proposePages stays on the site origin', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('ignores robots/sitemap entries and redirects pointing to another host', async () => {
    const fetched: string[] = []
    const origin = 'https://site.example'
    vi.stubGlobal('fetch', async (url: string) => {
      fetched.push(url)
      if (url === `${origin}/robots.txt`)
        return new Response(
          `Sitemap: https://evil.example/sitemap.xml\nSitemap: ${origin}/sm.xml\n`,
          { status: 200 }
        )
      if (url === `${origin}/sm.xml`)
        return new Response(null, { status: 302, headers: { location: 'https://evil.example/x' } })
      if (url === `${origin}/sitemap.xml`)
        return new Response(
          `<?xml version="1.0"?><urlset><url><loc>${origin}/</loc></url><url><loc>${origin}/pricing</loc></url><url><loc>https://evil.example/p</loc></url></urlset>`,
          { status: 200 }
        )
      return new Response('nope', { status: 404 })
    })
    const warnings: string[] = []
    const result = await proposePages(origin, (m: string) => warnings.push(m))
    expect(fetched.some((u) => u.startsWith('https://evil.example'))).toBe(false)
    expect(warnings.join('\n')).toMatch(/outside https:\/\/site\.example/)
    expect(result.pages.length).toBe(0) // the only on-site sitemap redirected away; nothing collected
  })

  it('collects on-site pages from sitemap.xml when robots.txt is missing', async () => {
    const origin = 'https://site.example'
    vi.stubGlobal('fetch', async (url: string) => {
      if (url === `${origin}/sitemap.xml`)
        return new Response(
          `<?xml version="1.0"?><urlset><url><loc>${origin}/</loc></url><url><loc>${origin}/pricing</loc></url><url><loc>https://evil.example/p</loc></url></urlset>`,
          { status: 200 }
        )
      return new Response('nope', { status: 404 })
    })
    const result = await proposePages(origin)
    expect(result.pages.map((p: { path: string }) => p.path).sort()).toEqual(['/', '/pricing'])
  })
})
