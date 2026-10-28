import type { Strategy } from '~~/shared/types/sentinel'

export type MetricSavings = Partial<Record<'lcp' | 'cls' | 'tbt' | 'fcp' | 'si' | 'inp', number>>

export interface Opportunity {
  id: string
  title: string
  savingsMs: number | null
  displayValue: string | null
  /** Estimated impact per metric (Lighthouse `metricSavings`), ms except cls. */
  metricSavings: MetricSavings
}

export interface PsiSample {
  fetchTime: string
  lighthouseVersion: string
  /** True when the page is not indexable (Lighthouse `is-crawlable` audit fails), e.g. noindex. */
  noindex: boolean
  performance: number | null
  accessibility: number | null
  bestPractices: number | null
  seo: number | null
  lcp: number | null
  cls: number | null
  tbt: number | null
  fcp: number | null
  si: number | null
  ttfb: number | null
  fieldInp: number | null
  fieldLcp: number | null
  fieldCls: number | null
  /** Failed performance audits with potential savings, biggest first. */
  opportunities: Opportunity[]
}

export interface PsiAggregate {
  samples: PsiSample[]
  median: Omit<PsiSample, 'fetchTime' | 'lighthouseVersion' | 'opportunities' | 'noindex'>
  lighthouseVersion: string
  noindex: boolean
}

export class PsiError extends Error {
  constructor(
    message: string,
    public status?: number
  ) {
    super(message)
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>

function score(lhr: Json, cat: string): number | null {
  const s = lhr?.categories?.[cat]?.score
  return typeof s === 'number' ? Math.round(s * 100) : null
}

function numeric(lhr: Json, audit: string): number | null {
  const v = lhr?.audits?.[audit]?.numericValue
  return typeof v === 'number' ? v : null
}

function field(exp: Json, metric: string): number | null {
  const v = exp?.metrics?.[metric]?.percentile
  return typeof v === 'number' ? v : null
}

const SAVINGS_KEYS: Record<string, keyof MetricSavings> = {
  LCP: 'lcp',
  CLS: 'cls',
  TBT: 'tbt',
  FCP: 'fcp',
  SI: 'si',
  INP: 'inp',
}

function metricSavings(audit: Json): MetricSavings {
  const out: MetricSavings = {}
  for (const [k, v] of Object.entries(audit?.metricSavings ?? {})) {
    const key = SAVINGS_KEYS[k]
    if (key && typeof v === 'number') out[key] = v
  }
  return out
}

export function parsePsiResponse(data: Json): PsiSample {
  const lhr = data.lighthouseResult ?? {}
  const exp = data.loadingExperience ?? {}
  const perfRefs: Json[] = lhr?.categories?.performance?.auditRefs ?? []
  const opportunities = perfRefs
    .map((ref) => lhr.audits?.[ref.id])
    .filter(
      (a: Json) =>
        a &&
        typeof a.score === 'number' &&
        a.score < 0.9 &&
        a.scoreDisplayMode !== 'informative' &&
        a.scoreDisplayMode !== 'notApplicable'
    )
    .map((a: Json) => ({
      id: a.id as string,
      title: a.title as string,
      savingsMs:
        typeof a.details?.overallSavingsMs === 'number' ? a.details.overallSavingsMs : null,
      displayValue: (a.displayValue as string) ?? null,
      metricSavings: metricSavings(a),
    }))
    .sort((a: Json, b: Json) => (b.savingsMs ?? 0) - (a.savingsMs ?? 0))
    .slice(0, 12)

  return {
    fetchTime: lhr.fetchTime ?? new Date().toISOString(),
    lighthouseVersion: lhr.lighthouseVersion ?? 'unknown',
    noindex: lhr?.audits?.['is-crawlable']?.score === 0,
    performance: score(lhr, 'performance'),
    accessibility: score(lhr, 'accessibility'),
    bestPractices: score(lhr, 'best-practices'),
    seo: score(lhr, 'seo'),
    lcp: numeric(lhr, 'largest-contentful-paint'),
    cls: numeric(lhr, 'cumulative-layout-shift'),
    tbt: numeric(lhr, 'total-blocking-time'),
    fcp: numeric(lhr, 'first-contentful-paint'),
    si: numeric(lhr, 'speed-index'),
    ttfb: numeric(lhr, 'server-response-time'),
    fieldInp: field(exp, 'INTERACTION_TO_NEXT_PAINT'),
    fieldLcp: field(exp, 'LARGEST_CONTENTFUL_PAINT_MS'),
    fieldCls: field(exp, 'CUMULATIVE_LAYOUT_SHIFT_SCORE'),
    opportunities,
  }
}

export function median(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => typeof v === 'number').sort((a, b) => a - b)
  if (!nums.length) return null
  const mid = Math.floor(nums.length / 2)
  return nums.length % 2 ? nums[mid]! : (nums[mid - 1]! + nums[mid]!) / 2
}

export function aggregateSamples(samples: PsiSample[]): PsiAggregate {
  const pick = (k: keyof PsiSample) => median(samples.map((s) => s[k] as number | null))
  return {
    samples,
    lighthouseVersion: samples[0]?.lighthouseVersion ?? 'unknown',
    noindex: samples.some((s) => s.noindex),
    median: {
      performance: pick('performance'),
      accessibility: pick('accessibility'),
      bestPractices: pick('bestPractices'),
      seo: pick('seo'),
      lcp: pick('lcp'),
      cls: pick('cls'),
      tbt: pick('tbt'),
      fcp: pick('fcp'),
      si: pick('si'),
      ttfb: pick('ttfb'),
      fieldInp: pick('fieldInp'),
      fieldLcp: pick('fieldLcp'),
      fieldCls: pick('fieldCls'),
    },
  }
}

export async function fetchPsi(
  url: string,
  strategy: Strategy,
  categories: string[],
  apiKey?: string
): Promise<PsiSample> {
  const params = new URLSearchParams({ url, strategy })
  for (const c of categories) params.append('category', c)
  if (apiKey) params.set('key', apiKey)

  const { psiEndpoint } = useRuntimeConfig()
  const res = await fetch(`${psiEndpoint}?${params}`, { signal: AbortSignal.timeout(120_000) })
  if (!res.ok) {
    let detail = ''
    try {
      const body = await res.json()
      detail = body?.error?.message ?? ''
    } catch {
      /* ignore */
    }
    throw new PsiError(`PSI ${res.status}${detail ? `: ${detail}` : ''}`, res.status)
  }
  return parsePsiResponse(await res.json())
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
