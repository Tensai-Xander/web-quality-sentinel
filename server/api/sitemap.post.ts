import { proposePages } from '~~/scripts/lib/sitemap.mjs'

/** Propose pages for a site from its sitemap (same logic as `pnpm sentinel:init`). Body: { url }. */
export default defineEventHandler(async (event) => {
  const { url } = (await readBody<{ url?: string }>(event)) ?? {}
  try {
    new URL(String(url))
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'url must be a valid http(s) URL' })
  }
  const warnings: string[] = []
  const result = await proposePages(String(url), (m) => warnings.push(m))
  return { ...result, warnings }
})
