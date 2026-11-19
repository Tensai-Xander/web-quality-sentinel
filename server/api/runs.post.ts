import type { RunTrigger } from '~~/shared/types/sentinel'

interface Body {
  /** SiteConfig.id; defaults to the first configured site. */
  siteId?: string
  trigger?: RunTrigger
  releaseTag?: string
  pageIds?: string[]
}

export default defineEventHandler(async (event) => {
  const body = ((await readBody(event).catch(() => ({}))) ?? {}) as Body
  const bad = (message: string) => createError({ statusCode: 400, statusMessage: message })
  if (body.trigger != null && body.trigger !== 'release' && body.trigger !== 'manual')
    throw bad('trigger must be "manual" or "release"')
  const trigger: RunTrigger = body.trigger ?? 'manual'
  if (body.releaseTag != null && typeof body.releaseTag !== 'string')
    throw bad('releaseTag must be a string')
  const releaseTag = str(body.releaseTag) || null
  if (releaseTag && releaseTag.length > 100) throw bad('releaseTag: max 100 characters')
  if (body.siteId != null && typeof body.siteId !== 'string') throw bad('siteId must be a string')
  const site = getSite(body.siteId)
  if (body.pageIds != null) {
    if (!Array.isArray(body.pageIds) || !body.pageIds.every((p) => typeof p === 'string'))
      throw bad('pageIds must be an array of page ids')
    const unknown = body.pageIds.filter((p) => !site.pages.some((x) => x.id === p))
    if (unknown.length) throw bad(`Unknown page ids: ${unknown.join(', ')}`)
    if (!body.pageIds.length) throw bad('pageIds must not be empty')
  }
  const result = startRun({ siteId: site.id, trigger, releaseTag, pageIds: body.pageIds })
  setResponseStatus(event, result.started ? 202 : 409)
  return result
})
