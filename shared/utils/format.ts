import { SCORE_METRICS, type Metric } from '../types/sentinel'

export function isScoreMetric(metric: string): boolean {
  return (SCORE_METRICS as string[]).includes(metric)
}

export function formatMetric(metric: Metric | string, value: number | null | undefined): string {
  if (value == null) return '–'
  if (isScoreMetric(metric)) return String(Math.round(value))
  if (metric === 'cls') return value.toFixed(3)
  return value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${Math.round(value)} ms`
}

/** Lighthouse colour bands for 0-100 scores. */
export function scoreBand(value: number | null | undefined): 'good' | 'average' | 'poor' | 'none' {
  if (value == null) return 'none'
  if (value >= 90) return 'good'
  if (value >= 50) return 'average'
  return 'poor'
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '–'
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDuration(startIso: string, endIso: string | null | undefined): string {
  if (!endIso) return '…'
  const s = Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}
