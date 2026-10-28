import type { RunTrigger } from '~~/shared/types/sentinel'

interface Body {
  trigger?: RunTrigger
  releaseTag?: string
  pageIds?: string[]
}

export default defineEventHandler(async (event) => {
  const body = ((await readBody(event).catch(() => ({}))) ?? {}) as Body
  const trigger: RunTrigger = body.trigger === 'release' ? 'release' : 'manual'
  const result = startRun({
    trigger,
    releaseTag: body.releaseTag?.trim() || null,
    pageIds: body.pageIds,
  })
  setResponseStatus(event, result.started ? 202 : 409)
  return result
})
