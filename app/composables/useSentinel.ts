import type { SentinelConfig, SiteConfig, PageConfig, Thresholds } from '~~/shared/types/sentinel'

export type ClientPage = PageConfig & { url: string; thresholds: Thresholds }
export interface ClientSite extends Omit<SiteConfig, 'pages'> {
  pages: ClientPage[]
}
export interface ClientConfig extends Omit<SentinelConfig, 'sites'> {
  sites: ClientSite[]
  hasApiKey: boolean
  activeRun: { id: number; siteId: string } | null
}

const SITE_COOKIE = 'sentinel-site'

export function useSentinel() {
  const { data: config, refresh } = useFetch<ClientConfig>('/api/config', {
    key: 'sentinel-config',
  })
  // Selected site: shared across components, remembered between visits.
  const cookie = useCookie<string | undefined>(SITE_COOKIE, { sameSite: 'lax' })
  const selected = useState<string | undefined>('sentinel-site', () => cookie.value)

  const siteId = computed({
    get: () => {
      const sites = config.value?.sites ?? []
      return sites.some((s) => s.id === selected.value) ? selected.value! : (sites[0]?.id ?? '')
    },
    set: (id: string) => {
      selected.value = id
      cookie.value = id
    },
  })
  const site = computed(() => config.value?.sites.find((s) => s.id === siteId.value) ?? null)

  const siteName = (id: string) => config.value?.sites.find((s) => s.id === id)?.name ?? id
  /** Label of a page id, looked up in the given site first, then in any site. */
  const pageLabel = (id: string, inSite?: string | null) => {
    const sites = config.value?.sites ?? []
    const first = sites.find((s) => s.id === (inSite ?? siteId.value))
    return (
      first?.pages.find((p) => p.id === id)?.label ??
      sites.flatMap((s) => s.pages).find((p) => p.id === id)?.label ??
      id
    )
  }
  return { config, refresh, siteId, site, siteName, pageLabel }
}
