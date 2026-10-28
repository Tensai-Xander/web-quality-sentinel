<script setup lang="ts">
import type { PageResult } from '~~/server/db/schema'
import { SCORE_METRICS, TIMING_METRICS, METRIC_LABELS, type Metric } from '~~/shared/types/sentinel'

interface TrendRun {
  id: number
  startedAt: string
  releaseTag: string | null
  trigger: string
}
interface Trends {
  runs: TrendRun[]
  results: Omit<PageResult, 'details'>[]
}

const { config } = useSentinel()
const strategy = ref<'mobile' | 'desktop'>('mobile')
const metric = ref<Metric>('performance')
const limit = ref(30)
const selectedPages = ref<string[]>([])

const { data } = await useFetch<Trends>('/api/trends', {
  query: { strategy, limit },
  default: () => ({ runs: [], results: [] }),
  watch: [strategy, limit],
})

const pages = computed(() => config.value?.pages ?? [])
const visiblePages = computed(() =>
  pages.value.filter((p) => !selectedPages.value.length || selectedPages.value.includes(p.id))
)

const labels = computed(() =>
  data.value.runs.map((r) => {
    const d = new Date(r.startedAt)
    const date = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    return r.releaseTag ? `${date} (${r.releaseTag})` : `#${r.id} ${date}`
  })
)

const series = computed(() =>
  visiblePages.value.map((p) => ({
    label: p.label,
    data: data.value.runs.map(
      (run) =>
        data.value.results.find((r) => r.runId === run.id && r.pageId === p.id)?.[metric.value] ??
        null
    ),
  }))
)

const threshold = computed(() => {
  const t = config.value?.thresholds as Record<string, number> | undefined
  return t?.[metric.value] ?? null
})

function togglePage(id: string) {
  const i = selectedPages.value.indexOf(id)
  if (i >= 0) selectedPages.value.splice(i, 1)
  else selectedPages.value.push(id)
}
</script>

<template>
  <div>
    <section class="card">
      <div class="card-header">
        <h1>Trends</h1>
        <div class="row">
          <select v-model="metric">
            <optgroup label="Scores">
              <option v-for="m in SCORE_METRICS" :key="m" :value="m">{{ METRIC_LABELS[m] }}</option>
            </optgroup>
            <optgroup label="Timings">
              <option v-for="m in TIMING_METRICS" :key="m" :value="m">
                {{ METRIC_LABELS[m] }}
              </option>
            </optgroup>
          </select>
          <select v-model.number="limit">
            <option :value="10">Last 10 runs</option>
            <option :value="30">Last 30 runs</option>
            <option :value="90">Last 90 runs</option>
            <option :value="365">Last 365 runs</option>
          </select>
          <div class="segmented">
            <button :class="{ active: strategy === 'mobile' }" @click="strategy = 'mobile'">
              Mobile
            </button>
            <button :class="{ active: strategy === 'desktop' }" @click="strategy = 'desktop'">
              Desktop
            </button>
          </div>
        </div>
      </div>

      <div class="row small" style="margin-bottom: 0.75rem">
        <span class="muted">Pages:</span>
        <button
          v-for="p in pages"
          :key="p.id"
          class="pill"
          :style="
            !selectedPages.length || selectedPages.includes(p.id)
              ? 'color: var(--accent); border-color: var(--accent)'
              : ''
          "
          @click="togglePage(p.id)"
        >
          {{ p.label }}
        </button>
        <button v-if="selectedPages.length" class="pill" @click="selectedPages = []">all</button>
      </div>

      <div v-if="!data.runs.length" class="empty">No completed runs yet.</div>
      <MetricChart
        v-else
        :metric="metric"
        :labels="labels"
        :series="series"
        :threshold="threshold"
      />
    </section>
  </div>
</template>
