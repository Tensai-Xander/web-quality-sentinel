export type Strategy = 'mobile' | 'desktop'

export type ScoreMetric = 'performance' | 'accessibility' | 'bestPractices' | 'seo'
export type TimingMetric = 'lcp' | 'cls' | 'tbt' | 'fcp' | 'si' | 'ttfb'
export type Metric = ScoreMetric | TimingMetric

export const SCORE_METRICS: ScoreMetric[] = ['performance', 'accessibility', 'bestPractices', 'seo']
export const TIMING_METRICS: TimingMetric[] = ['lcp', 'cls', 'tbt', 'fcp', 'si', 'ttfb']

export const METRIC_LABELS: Record<Metric, string> = {
  performance: 'Performance',
  accessibility: 'Accessibility',
  bestPractices: 'Best Practices',
  seo: 'SEO',
  lcp: 'LCP',
  cls: 'CLS',
  tbt: 'TBT',
  fcp: 'FCP',
  si: 'Speed Index',
  ttfb: 'TTFB',
}

export interface PageConfig {
  /** Stable identifier used in the DB and the dashboard, e.g. "home". */
  id: string
  /** Human label shown in the dashboard. */
  label: string
  /** Path relative to the site baseUrl (or an absolute URL). */
  path: string
  /** Optional per-page overrides of the site/global thresholds. */
  thresholds?: Partial<Thresholds>
}

export interface Thresholds {
  /** Minimum Lighthouse category scores (0-100). */
  performance: number
  accessibility: number
  bestPractices: number
  seo: number
  /** Maximum Core Web Vitals / lab timings. Times in ms, CLS unitless. */
  lcp: number
  cls: number
  tbt: number
  fcp: number
}

export interface RegressionRules {
  /** Number of previous completed runs used to compute the baseline (median). */
  baselineRuns: number
  /** A category score lower than baseline by at least this many points is a regression. */
  scoreDrop: number
  /** A timing metric higher than baseline by at least this percentage is a regression… */
  timingIncreasePct: number
  /** …as long as the absolute increase is also above this noise floor (ms for times). */
  minDelta: Partial<Record<TimingMetric, number>>
}

export interface SiteConfig {
  /** Stable identifier stored with every run, e.g. "toyota-community". Lowercase letters, digits, dashes. */
  id: string
  /** Human label shown in the site selector. */
  name: string
  /** Origin the page paths are appended to, without trailing slash. */
  baseUrl: string
  /** Pages monitored on every run of this site. */
  pages: PageConfig[]
  /** Optional per-site overrides of the global thresholds. */
  thresholds?: Partial<Thresholds>
}

/** Shape of sentinel.sites.json. */
export interface SitesFile {
  sites: SiteConfig[]
}

/** Global rules from sentinel.config.ts (sites live in sentinel.sites.json). */
export interface SentinelConfig {
  strategies: Strategy[]
  psi: {
    /** How many PSI requests per page × strategy; the median is stored. */
    samples: number
    /** Pause between PSI requests (ms) to stay inside the free quota. */
    delayMs: number
    /** Lighthouse categories to request. */
    categories: ('performance' | 'accessibility' | 'best-practices' | 'seo')[]
  }
  thresholds: Thresholds
  regression: RegressionRules
  /** Browser checks (Playwright): broken links, JS errors, meta tags, JSON-LD, axe-core accessibility. */
  crawl: {
    enabled: boolean
    /** Max same-site links checked per page. */
    maxLinks: number
    /** Page load timeout (ms). */
    timeoutMs: number
  }
}

export type RunTrigger = 'manual' | 'release'
export type RunStatus = 'running' | 'completed' | 'failed'
export type AlertKind = 'threshold' | 'regression' | 'quality'
/** Metrics of quality (crawler) alerts. */
export type QualityMetric = 'http' | 'jsErrors' | 'brokenLinks' | 'meta' | 'jsonld' | 'a11y'
export const QUALITY_LABELS: Record<QualityMetric, string> = {
  http: 'HTTP status',
  jsErrors: 'JavaScript errors',
  brokenLinks: 'Broken links',
  meta: 'Meta tags',
  jsonld: 'Structured data',
  a11y: 'Accessibility (axe)',
}
export type AlertSeverity = 'warn' | 'fail'
