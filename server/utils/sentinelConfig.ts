import config from '~~/sentinel.config'
import type { PageConfig, SiteConfig, Thresholds } from '~~/shared/types/sentinel'

export function useSentinelConfig() {
  return config
}

/** Site by id; the first configured site when id is missing. Throws on unknown ids. */
export function getSite(id?: string | null): SiteConfig {
  if (id == null || id === '') return config.sites[0]!
  const site = config.sites.find((s) => s.id === id)
  if (!site) throw createError({ statusCode: 404, statusMessage: `Unknown site "${id}"` })
  return site
}

export function pageUrl(site: SiteConfig, page: PageConfig) {
  if (/^https?:\/\//.test(page.path)) return page.path
  return site.baseUrl.replace(/\/$/, '') + page.path
}

export function thresholdsFor(site: SiteConfig, page: PageConfig): Thresholds {
  return { ...config.thresholds, ...(site.thresholds ?? {}), ...(page.thresholds ?? {}) }
}
