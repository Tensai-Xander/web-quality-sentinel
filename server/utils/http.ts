/** Directory holding sentinel.sites.json, .data/ and server/db/migrations: the working directory unless SENTINEL_ROOT says otherwise. */
export function projectRoot() {
  return process.env.SENTINEL_ROOT || process.cwd()
}

/** Positive integer `limit` query parameter, capped; the default for anything else. */
export function queryLimit(raw: unknown, def: number, cap: number) {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? Math.min(n, cap) : def
}

/** Trimmed string from an untrusted body field; '' for anything that is not a string. */
export function str(v: unknown) {
  return typeof v === 'string' ? v.trim() : ''
}
