import config from '~~/sentinel.config'
import type { PageConfig, Thresholds } from '~~/shared/types/sentinel'

export function useSentinelConfig() {
  return config
}

export function pageUrl(page: PageConfig) {
  if (/^https?:\/\//.test(page.path)) return page.path
  return config.site.baseUrl.replace(/\/$/, '') + page.path
}

export function thresholdsFor(page: PageConfig): Thresholds {
  return { ...config.thresholds, ...(page.thresholds ?? {}) }
}
