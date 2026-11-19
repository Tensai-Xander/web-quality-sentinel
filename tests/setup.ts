// Nitro auto-imports used by server/utils (createError, getActiveRun, str, …) as plain globals.
import { projectRoot, queryLimit, str } from '../server/utils/http'

export class H3Error extends Error {
  statusCode: number
  statusMessage: string
  constructor(input: { statusCode?: number; statusMessage?: string }) {
    super(input.statusMessage ?? 'Error')
    this.statusCode = input.statusCode ?? 500
    this.statusMessage = input.statusMessage ?? 'Error'
  }
}

Object.assign(globalThis, {
  createError: (input: { statusCode?: number; statusMessage?: string }) => new H3Error(input),
  getActiveRun: () => null,
  projectRoot,
  queryLimit,
  str,
})
