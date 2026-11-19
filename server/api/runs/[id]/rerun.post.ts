export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) throw createError({ statusCode: 400, statusMessage: 'Invalid run id' })
  const body = ((await readBody(event).catch(() => ({}))) ?? {}) as { pageIds?: string[] }
  const pageIds = Array.isArray(body.pageIds)
    ? body.pageIds.filter((p) => typeof p === 'string')
    : []
  if (!pageIds.length) throw createError({ statusCode: 400, statusMessage: 'pageIds is required' })
  const result = rerunPages(id, pageIds)
  setResponseStatus(event, result.started ? 202 : 409)
  return result
})
