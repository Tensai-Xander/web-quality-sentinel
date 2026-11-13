<script setup lang="ts">
import type { Run, PageResult, Alert, PageCheck } from '~~/server/db/schema'
import type { CrawlResult } from '~~/server/utils/crawler'
import type { FieldData, FieldMetric, Opportunity } from '~~/server/utils/psi'
import { SCORE_METRICS, TIMING_METRICS, METRIC_LABELS, type Metric } from '~~/shared/types/sentinel'
import { formatDate, formatDuration, formatMetric } from '~~/shared/utils/format'
import type { AlertIssue } from '~/components/AlertTable.vue'

interface Details {
  samples: Record<string, number | null | string>[]
  opportunities: Opportunity[]
  /** CrUX data of the exact URL; absent on runs made before it was stored. */
  field?: FieldData | null
}
const FIELD_METRICS: { key: FieldMetric; label: string; cwv: boolean }[] = [
  { key: 'lcp', label: 'LCP', cwv: true },
  { key: 'inp', label: 'INP', cwv: true },
  { key: 'cls', label: 'CLS', cwv: true },
  { key: 'fcp', label: 'FCP', cwv: false },
  { key: 'ttfb', label: 'TTFB', cwv: false },
]
const RATING_LABELS = { good: 'Good', average: 'Needs improvement', poor: 'Poor' } as const
interface RunDetail {
  run: Run
  results: (Omit<PageResult, 'details'> & { details: Details | null })[]
  alerts: Alert[]
  checks: (Omit<PageCheck, 'details'> & { details: CrawlResult | null })[]
}
const expandedCheck = ref<number | null>(null)

const route = useRoute()
const id = Number(route.params.id)
const { pageLabel, config, siteId, siteName } = useSentinel()
const { data, refresh, error } = await useFetch<RunDetail>(`/api/runs/${id}`)
// Viewing a run selects its site, so Overview/Trends/Compare stay consistent with it.
watch(
  () => data.value?.run.siteId,
  (s) => {
    if (s && s !== siteId.value) siteId.value = s
  },
  { immediate: true }
)

const expanded = ref<number | null>(null)
const sorted = computed(() =>
  [...(data.value?.results ?? [])].sort(
    (a, b) => a.pageId.localeCompare(b.pageId) || a.strategy.localeCompare(b.strategy)
  )
)
const metrics: Metric[] = [...SCORE_METRICS, ...TIMING_METRICS]

const issueBase = (o: Opportunity) => ({
  id: o.id,
  title: o.title,
  description: o.description ?? null,
  details: o.details ?? null,
})
const openOpportunity = ref<string | null>(null)

/** Lighthouse issues whose metricSavings touch the alert's metric, biggest impact first. */
function issuesFor(a: Alert): AlertIssue[] {
  const result = data.value?.results.find((r) => r.id === a.pageResultId)
  const ops = result?.details?.opportunities ?? []
  const metric = a.metric as keyof Opportunity['metricSavings']
  if (a.metric === 'performance') {
    return ops
      .filter((o) => o.savingsMs || Object.values(o.metricSavings ?? {}).some((v) => v > 0))
      .slice(0, 5)
      .map((o) => ({ ...issueBase(o), savings: o.savingsMs }))
  }
  return ops
    .filter((o) => (o.metricSavings?.[metric] ?? 0) > 0)
    .map((o) => ({ ...issueBase(o), savings: o.metricSavings[metric] ?? null }))
    .sort((x, y) => (y.savings ?? 0) - (x.savings ?? 0))
    .slice(0, 5)
}

async function remove() {
  if (!confirm(`Delete run #${id} and its results?`)) return
  await $fetch(`/api/runs/${id}`, { method: 'DELETE' })
  await navigateTo('/')
}

let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(() => {
    if (data.value?.run.status === 'running') refresh()
  }, 5000)
})
onUnmounted(() => clearInterval(timer))
</script>

<template>
  <div>
    <div v-if="error" class="card empty">Run not found.</div>
    <template v-else-if="data">
      <section class="card">
        <div class="card-header">
          <div>
            <h1>Run #{{ data.run.id }} <RunStatusPill :status="data.run.status" /></h1>
            <div class="muted small">
              {{ siteName(data.run.siteId) }} · {{ data.run.trigger }}
              <template v-if="data.run.releaseTag"> · release {{ data.run.releaseTag }}</template>
              · {{ formatDate(data.run.startedAt) }} ·
              {{ formatDuration(data.run.startedAt, data.run.finishedAt) }} ·
              {{ data.run.checksDone }}/{{ data.run.checksTotal }} checks
            </div>
            <div v-if="data.run.error" class="small" style="color: var(--poor)">
              {{ data.run.error }}
            </div>
          </div>
          <div class="row">
            <NuxtLink class="btn" :to="`/compare?to=${data.run.id}`">Compare…</NuxtLink>
            <button class="danger" :disabled="data.run.status === 'running'" @click="remove">
              Delete
            </button>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Page</th>
              <th>Device</th>
              <th v-for="m in metrics" :key="m" class="num">{{ METRIC_LABELS[m] }}</th>
              <th class="num">Samples</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="r in sorted" :key="r.id">
              <tr class="clickable" @click="expanded = expanded === r.id ? null : r.id">
                <td>
                  <strong>{{ pageLabel(r.pageId, data.run.siteId) }}</strong>
                  <span
                    v-if="r.noindex"
                    class="pill"
                    title="Page is not indexable (noindex); SEO score is informational and not alerted"
                    >noindex</span
                  >
                  <div class="muted small">
                    <a :href="r.url" target="_blank" rel="noopener" @click.stop>{{ r.url }}</a>
                  </div>
                </td>
                <td>{{ r.strategy }}</td>
                <template v-if="r.status === 'ok'">
                  <td v-for="m in metrics" :key="m" class="num">
                    <MetricValue :metric="m" :value="r[m]" />
                  </td>
                </template>
                <td
                  v-else
                  :colspan="metrics.length"
                  class="small"
                  style="color: var(--poor); white-space: normal"
                >
                  {{ r.error }}
                </td>
                <td class="num">{{ r.samples }}</td>
              </tr>
              <tr v-if="expanded === r.id && r.details">
                <td :colspan="metrics.length + 3" style="white-space: normal; background: #fafbfc">
                  <div class="row" style="align-items: flex-start; gap: 2rem">
                    <div>
                      <h3>Samples (median is stored)</h3>
                      <table class="small">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th v-for="m in metrics" :key="m" class="num">
                              {{ METRIC_LABELS[m] }}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr v-for="(s, i) in r.details.samples" :key="i">
                            <td>{{ i + 1 }}</td>
                            <td v-for="m in metrics" :key="m" class="num">
                              {{ formatMetric(m, s[m] as number | null) }}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                      <div class="muted small" style="margin-top: 0.4rem">
                        Lighthouse {{ r.lighthouseVersion }}
                      </div>
                    </div>
                    <div v-if="r.details.opportunities.length" style="flex: 1; min-width: 280px">
                      <h3>Top performance opportunities</h3>
                      <p class="muted small" style="margin: 0 0 0.4rem">
                        Click an issue for Lighthouse's explanation and per-URL breakdown.
                      </p>
                      <ul class="small" style="margin: 0; padding-left: 1.1rem">
                        <li v-for="o in r.details.opportunities" :key="o.id">
                          <span
                            class="issue-toggle"
                            :class="{ open: openOpportunity === `${r.id}:${o.id}` }"
                            title="Show details"
                            @click="
                              openOpportunity =
                                openOpportunity === `${r.id}:${o.id}` ? null : `${r.id}:${o.id}`
                            "
                            >{{ o.title }}</span
                          >
                          <span class="muted">
                            <template v-if="o.displayValue"> — {{ o.displayValue }}</template>
                            <template v-else-if="o.savingsMs">
                              — ~{{ Math.round(o.savingsMs) }} ms</template
                            >
                          </span>
                        </li>
                      </ul>
                    </div>
                  </div>
                  <template v-for="o in r.details.opportunities" :key="o.id">
                    <IssueDetail
                      v-if="openOpportunity === `${r.id}:${o.id}`"
                      :description="o.description"
                      :details="o.details"
                    />
                  </template>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </section>

      <section class="card">
        <h2>Real users (Chrome UX Report)</h2>
        <p class="muted small" style="margin: 0 0 0.5rem">
          What Chrome visitors of this exact URL experienced over the last 28 days (75th
          percentile), as reported by PSI's "This URL" field data — not the lab measurement above.
          LCP, INP and CLS are Google's Core Web Vitals. "No data" means the URL has too few Chrome
          visitors; origin-level data is deliberately not used.
        </p>
        <table>
          <thead>
            <tr>
              <th>Page</th>
              <th>Device</th>
              <th>Overall</th>
              <th v-for="f in FIELD_METRICS" :key="f.key" class="num">
                {{ f.label }}<span v-if="!f.cwv" class="muted small"> *</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in sorted" :key="r.id">
              <td>
                <strong>{{ pageLabel(r.pageId, data.run.siteId) }}</strong>
              </td>
              <td>{{ r.strategy }}</td>
              <template v-if="r.details?.field">
                <td>
                  <span
                    v-if="r.details.field.overall"
                    class="badge"
                    :class="r.details.field.overall"
                    >{{ RATING_LABELS[r.details.field.overall] }}</span
                  >
                  <span v-else class="muted">–</span>
                </td>
                <td v-for="f in FIELD_METRICS" :key="f.key" class="num">
                  <span
                    v-if="r.details.field.metrics[f.key]"
                    class="badge"
                    :class="r.details.field.metrics[f.key]!.rating"
                    :title="RATING_LABELS[r.details.field.metrics[f.key]!.rating]"
                    >{{ formatMetric(f.key, r.details.field.metrics[f.key]!.p75) }}</span
                  >
                  <span v-else class="muted">No data</span>
                </td>
              </template>
              <td v-else :colspan="FIELD_METRICS.length + 1" class="muted">
                No data<template v-if="r.details && !('field' in r.details)">
                  (run made before field data was stored)</template
                >
              </td>
            </tr>
          </tbody>
        </table>
        <p class="muted small" style="margin: 0.5rem 0 0">
          * FCP and TTFB are reported by CrUX but are not Core Web Vitals. Ratings use Google's
          fixed limits (e.g. LCP good ≤ 2.5 s, poor > 4 s; INP 200 / 500 ms; CLS 0.1 / 0.25).
        </p>
      </section>

      <section v-if="data.checks?.length" class="card">
        <h2>Quality checks</h2>
        <p class="muted small" style="margin: 0 0 0.5rem">
          One browser visit per page and device (Playwright): HTTP status, JavaScript errors, broken
          same-site links (checked once per page), meta tags, structured data and an axe-core
          accessibility audit. Click a row for details.
        </p>
        <table>
          <thead>
            <tr>
              <th>Page</th>
              <th>Device</th>
              <th class="num">HTTP</th>
              <th class="num">JS errors</th>
              <th class="num">Failed requests</th>
              <th class="num">Broken links</th>
              <th class="num">Meta issues</th>
              <th class="num">JSON-LD</th>
              <th class="num">A11y</th>
              <th class="num">Time</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="c in data.checks" :key="c.id">
              <tr class="clickable" @click="expandedCheck = expandedCheck === c.id ? null : c.id">
                <td>
                  <strong>{{ pageLabel(c.pageId, data.run.siteId) }}</strong>
                  <div class="muted small">
                    {{ c.finalUrl && c.finalUrl !== c.url ? `${c.url} → ${c.finalUrl}` : c.url }}
                  </div>
                </td>
                <td>{{ c.strategy }}</td>
                <template v-if="c.status === 'ok'">
                  <td class="num">
                    <span
                      class="pill"
                      :class="(c.httpStatus ?? 500) >= 400 ? 'fail' : 'completed'"
                      >{{ c.httpStatus ?? '–' }}</span
                    >
                  </td>
                  <td class="num" :style="c.jsErrors ? 'color: var(--average)' : ''">
                    {{ c.jsErrors }}
                  </td>
                  <td class="num" :style="c.failedRequests ? 'color: var(--average)' : ''">
                    {{ c.failedRequests }}
                  </td>
                  <td class="num" :style="c.brokenLinks ? 'color: var(--poor)' : ''">
                    {{ c.brokenLinks }} / {{ c.linksChecked }}
                  </td>
                  <td class="num" :style="c.metaIssues ? 'color: var(--average)' : ''">
                    {{ c.metaIssues }}
                  </td>
                  <td class="num" :style="c.jsonldIssues ? 'color: var(--average)' : ''">
                    {{ c.jsonldCount
                    }}<template v-if="c.jsonldIssues"> ({{ c.jsonldIssues }} issues)</template>
                  </td>
                  <td
                    class="num"
                    :style="c.a11yIssues ? 'color: var(--average)' : ''"
                    :title="`${c.a11yElements} element(s) affected`"
                  >
                    {{ c.a11yIssues }}
                  </td>
                  <td class="num muted">
                    {{ c.durationMs ? `${(c.durationMs / 1000).toFixed(1)} s` : '–' }}
                  </td>
                </template>
                <td
                  v-else
                  colspan="8"
                  class="small"
                  style="color: var(--poor); white-space: normal"
                >
                  {{ c.error }}
                </td>
              </tr>
              <tr v-if="expandedCheck === c.id && c.details">
                <td colspan="10" style="white-space: normal; background: #fafbfc">
                  <div class="grid small">
                    <div>
                      <h3>Meta tags</h3>
                      <ul
                        v-if="c.details.meta.issues.length"
                        style="margin: 0 0 0.4rem; padding-left: 1.1rem; color: var(--average)"
                      >
                        <li v-for="i in c.details.meta.issues" :key="i">{{ i }}</li>
                      </ul>
                      <div v-else class="muted">No issue.</div>
                      <table class="small">
                        <tbody>
                          <tr
                            v-for="k in [
                              'title',
                              'description',
                              'canonical',
                              'robots',
                              'lang',
                              'ogTitle',
                              'ogDescription',
                              'ogImage',
                            ] as const"
                            :key="k"
                          >
                            <th>{{ k }}</th>
                            <td style="white-space: normal">{{ c.details.meta[k] ?? '–' }}</td>
                          </tr>
                          <tr>
                            <th>h1</th>
                            <td>{{ c.details.meta.h1Count }}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div>
                      <h3>Structured data (JSON-LD)</h3>
                      <div>
                        {{ c.details.jsonld.count }} block(s)<template
                          v-if="c.details.jsonld.types.length"
                          >: {{ c.details.jsonld.types.join(', ') }}</template
                        >
                      </div>
                      <ul
                        v-if="c.details.jsonld.issues.length"
                        style="margin: 0.3rem 0 0; padding-left: 1.1rem; color: var(--average)"
                      >
                        <li v-for="i in c.details.jsonld.issues" :key="i">{{ i }}</li>
                      </ul>
                      <h3 style="margin-top: 0.8rem">JavaScript errors</h3>
                      <ul
                        v-if="c.details.pageErrors.length || c.details.consoleErrors.length"
                        style="margin: 0; padding-left: 1.1rem"
                      >
                        <li
                          v-for="e in [...c.details.pageErrors, ...c.details.consoleErrors]"
                          :key="e"
                        >
                          <code>{{ e }}</code>
                        </li>
                      </ul>
                      <div v-else class="muted">None.</div>
                    </div>
                    <div>
                      <h3>
                        Broken links ({{ c.details.brokenLinks.length }} of
                        {{ c.details.linksChecked }} checked)
                      </h3>
                      <ul
                        v-if="c.details.brokenLinks.length"
                        style="margin: 0; padding-left: 1.1rem"
                      >
                        <li v-for="l in c.details.brokenLinks" :key="l.url">
                          <a :href="l.url" target="_blank" rel="noopener" @click.stop>{{
                            l.url
                          }}</a>
                          <span class="pill fail" style="margin-left: 0.3em">{{
                            l.status ?? l.error
                          }}</span>
                          <span v-if="l.text" class="muted"> — "{{ l.text }}"</span>
                        </li>
                      </ul>
                      <div v-else class="muted">None.</div>
                      <h3 style="margin-top: 0.8rem">
                        Failed requests ({{ c.details.failedRequests.length }})
                      </h3>
                      <ul
                        v-if="c.details.failedRequests.length"
                        style="margin: 0; padding-left: 1.1rem"
                      >
                        <li v-for="f in c.details.failedRequests" :key="f.url">
                          <code>{{ f.url }}</code>
                          <span class="pill warn">{{ f.status ?? f.error }}</span>
                        </li>
                      </ul>
                      <div v-else class="muted">None.</div>
                    </div>
                  </div>
                  <div class="small" style="margin-top: 0.8rem">
                    <h3>
                      Accessibility (axe-core)
                      <template v-if="c.details.a11y">
                        — {{ c.details.a11y.violations.length }} rule(s) failed on
                        {{ c.details.a11y.elements }} element(s), {{ c.details.a11y.passes }} rules
                        passed
                      </template>
                    </h3>
                    <div v-if="!c.details.a11y" class="muted">
                      Not checked (run made before the accessibility audit was added).
                    </div>
                    <div v-else-if="c.details.a11y.error" style="color: var(--poor)">
                      Audit failed: {{ c.details.a11y.error }}
                    </div>
                    <div v-else-if="!c.details.a11y.violations.length" class="muted">
                      No violation.
                    </div>
                    <table v-else class="small">
                      <thead>
                        <tr>
                          <th>Impact</th>
                          <th>Rule</th>
                          <th class="num">Elements</th>
                          <th>WCAG</th>
                          <th>Examples</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="v in c.details.a11y.violations" :key="v.id">
                          <td>
                            <span
                              class="pill"
                              :class="
                                v.impact === 'critical' || v.impact === 'serious' ? 'fail' : 'warn'
                              "
                              >{{ v.impact }}</span
                            >
                          </td>
                          <td style="white-space: normal">
                            <a :href="v.helpUrl" target="_blank" rel="noopener" @click.stop>{{
                              v.help
                            }}</a>
                            <div class="muted">
                              <code>{{ v.id }}</code>
                            </div>
                          </td>
                          <td class="num">{{ v.nodes }}</td>
                          <td style="white-space: normal">
                            {{
                              v.tags.filter((t) => t.startsWith('wcag')).join(', ') ||
                              'best practice'
                            }}
                          </td>
                          <td style="white-space: normal; max-width: 32rem">
                            <div v-for="n in v.samples" :key="n.target" class="muted">
                              <code :title="n.html">{{ n.target }}</code>
                            </div>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </section>

      <section class="card">
        <h2>Alerts ({{ data.alerts.length }})</h2>
        <AlertTable :alerts="data.alerts" :site-id="data.run.siteId" :issues-for="issuesFor" />
        <p class="muted small" style="margin-top: 0.5rem">
          Thresholds and regression rules are defined in <code>sentinel.config.ts</code>.
          Regressions compare with the median of the previous
          {{ config?.regression.baselineRuns }} completed runs (at least 2 required).
        </p>
      </section>
    </template>
  </div>
</template>
