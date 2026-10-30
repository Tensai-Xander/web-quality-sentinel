<script setup lang="ts">
import type { Run, PageResult, Alert } from '~~/server/db/schema'
import type { Opportunity } from '~~/server/utils/psi'
import { SCORE_METRICS, TIMING_METRICS, METRIC_LABELS, type Metric } from '~~/shared/types/sentinel'
import { formatDate, formatDuration, formatMetric } from '~~/shared/utils/format'
import type { AlertIssue } from '~/components/AlertTable.vue'

interface Details {
  samples: Record<string, number | null | string>[]
  opportunities: Opportunity[]
}
interface RunDetail {
  run: Run
  results: (Omit<PageResult, 'details'> & { details: Details | null })[]
  alerts: Alert[]
}

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

/** Lighthouse issues whose metricSavings touch the alert's metric, biggest impact first. */
function issuesFor(a: Alert): AlertIssue[] {
  const result = data.value?.results.find((r) => r.id === a.pageResultId)
  const ops = result?.details?.opportunities ?? []
  const metric = a.metric as keyof Opportunity['metricSavings']
  if (a.metric === 'performance') {
    return ops
      .filter((o) => o.savingsMs || Object.values(o.metricSavings ?? {}).some((v) => v > 0))
      .slice(0, 5)
      .map((o) => ({ id: o.id, title: o.title, savings: o.savingsMs }))
  }
  return ops
    .filter((o) => (o.metricSavings?.[metric] ?? 0) > 0)
    .map((o) => ({ id: o.id, title: o.title, savings: o.metricSavings[metric] ?? null }))
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
                        <template
                          v-if="r.fieldLcp != null || r.fieldInp != null || r.fieldCls != null"
                        >
                          · Field data (CrUX p75): LCP {{ formatMetric('lcp', r.fieldLcp) }}, INP
                          {{ formatMetric('tbt', r.fieldInp) }}, CLS
                          {{ formatMetric('cls', r.fieldCls == null ? null : r.fieldCls / 100) }}
                        </template>
                      </div>
                    </div>
                    <div v-if="r.details.opportunities.length" style="flex: 1; min-width: 280px">
                      <h3>Top performance opportunities</h3>
                      <ul class="small" style="margin: 0; padding-left: 1.1rem">
                        <li v-for="o in r.details.opportunities" :key="o.id">
                          {{ o.title }}
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
