// Fake PageSpeed Insights endpoint for local development, so the dashboard can be
// exercised without burning the real API quota.
//
//   node scripts/mock-psi.mjs            # listens on :3999
//   NUXT_PSI_ENDPOINT=http://localhost:3999 pnpm dev
//
// Send `curl -X POST localhost:3999/degrade` to make every following response ~30% slower
// (and scores lower) — handy to see regression alerts appear. `POST /reset` restores it.
import { createServer } from 'node:http'

const port = Number(process.env.PORT ?? 3999)
let degrade = 1

const rand = (min, max) => min + Math.random() * (max - min)
const jitter = (v, pct = 0.08) => v * rand(1 - pct, 1 + pct)

function fakeResponse(url, strategy) {
  const mobile = strategy === 'mobile'
  const lcp = jitter((mobile ? 2300 : 1200) * degrade)
  const fcp = jitter((mobile ? 1500 : 800) * degrade)
  const tbt = jitter((mobile ? 250 : 60) * degrade)
  const si = jitter((mobile ? 3200 : 1500) * degrade)
  const ttfb = jitter(450 * degrade)
  const cls = jitter(mobile ? 0.05 : 0.02, 0.4) * degrade
  const perf = Math.max(0, Math.min(1, jitter(mobile ? 0.72 : 0.93, 0.05) / degrade))
  const audit = (id, title, numericValue, score, savings) => ({
    id,
    title,
    score,
    scoreDisplayMode: 'numeric',
    numericValue,
    displayValue: `${Math.round(numericValue)} ms`,
    details: savings ? { overallSavingsMs: savings } : undefined,
  })
  return {
    id: url,
    loadingExperience: {
      metrics: {
        LARGEST_CONTENTFUL_PAINT_MS: { percentile: Math.round(lcp * 1.1) },
        INTERACTION_TO_NEXT_PAINT: { percentile: Math.round(rand(120, 260)) },
        CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: Math.round(cls * 100) },
      },
    },
    lighthouseResult: {
      fetchTime: new Date().toISOString(),
      lighthouseVersion: 'mock-12.0.0',
      categories: {
        performance: {
          score: perf,
          auditRefs: [
            { id: 'render-blocking-resources' },
            { id: 'unused-javascript' },
            { id: 'uses-responsive-images' },
          ],
        },
        accessibility: { score: jitter(0.94, 0.02) },
        'best-practices': { score: jitter(0.88, 0.03) },
        seo: { score: 0.92 },
      },
      audits: {
        'largest-contentful-paint': { numericValue: lcp },
        'cumulative-layout-shift': { numericValue: cls },
        'total-blocking-time': { numericValue: tbt },
        'first-contentful-paint': { numericValue: fcp },
        'speed-index': { numericValue: si },
        'server-response-time': { numericValue: ttfb },
        'render-blocking-resources': audit(
          'render-blocking-resources',
          'Eliminate render-blocking resources',
          600,
          0.4,
          600
        ),
        'unused-javascript': audit('unused-javascript', 'Reduce unused JavaScript', 900, 0.3, 900),
        'uses-responsive-images': audit(
          'uses-responsive-images',
          'Properly size images',
          200,
          0.85,
          200
        ),
      },
    },
  }
}

createServer((req, res) => {
  const { pathname, searchParams } = new URL(req.url, `http://localhost:${port}`)
  if (req.method === 'POST' && pathname === '/degrade') {
    degrade = 1.3
    res.end('degraded\n')
    return
  }
  if (req.method === 'POST' && pathname === '/reset') {
    degrade = 1
    res.end('reset\n')
    return
  }
  const url = searchParams.get('url') ?? 'unknown'
  const strategy = searchParams.get('strategy') ?? 'mobile'
  setTimeout(() => {
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify(fakeResponse(url, strategy)))
  }, 300)
}).listen(port, () =>
  console.log(`mock PSI listening on http://localhost:${port} (degrade=${degrade})`)
)
