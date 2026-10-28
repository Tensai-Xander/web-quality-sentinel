import type { SentinelConfig, PageConfig, Thresholds } from '~~/shared/types/sentinel'

export interface ClientConfig extends Omit<SentinelConfig, 'pages'> {
  pages: (PageConfig & { url: string; thresholds: Thresholds })[]
  hasApiKey: boolean
  activeRunId: number | null
}

export function useSentinel() {
  const { data: config, refresh } = useFetch<ClientConfig>('/api/config', {
    key: 'sentinel-config',
  })
  const pageLabel = (id: string) => config.value?.pages.find((p) => p.id === id)?.label ?? id
  return { config, refresh, pageLabel }
}
