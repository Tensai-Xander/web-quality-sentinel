const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * The API has no login: it must only be reachable by this dashboard. Writes coming from another
 * origin (a page open in the same browser — CSRF) or with a non-JSON body are refused, and the
 * Host header must be a local one unless NUXT_ALLOWED_HOSTS lists it (closes DNS rebinding).
 */
export default defineEventHandler((event) => {
  if (!event.path.startsWith('/api/')) return
  const host = (getHeader(event, 'host') ?? '').replace(/:\d+$/, '').toLowerCase()
  const allowed = String(process.env.NUXT_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
  if (!LOCAL_HOSTS.has(host) && !allowed.includes(host))
    throw createError({ statusCode: 403, statusMessage: `Host "${host}" not allowed` })
  if (event.method === 'GET' || event.method === 'HEAD' || event.method === 'OPTIONS') return

  const fetchSite = getHeader(event, 'sec-fetch-site')
  const origin = getHeader(event, 'origin')
  const sameOrigin = origin
    ? new URL(origin).host.toLowerCase() === (getHeader(event, 'host') ?? '').toLowerCase()
    : fetchSite == null || fetchSite === 'same-origin' || fetchSite === 'none'
  if (!sameOrigin || (fetchSite && !['same-origin', 'none'].includes(fetchSite)))
    throw createError({ statusCode: 403, statusMessage: 'Cross-site request refused' })
  if (event.method !== 'DELETE') {
    const type = getHeader(event, 'content-type') ?? ''
    if (!type.startsWith('application/json'))
      throw createError({ statusCode: 415, statusMessage: 'application/json body required' })
  }
})
