<script setup lang="ts">
import type { Run, PageResult } from '~~/server/db/schema'
import { SCORE_METRICS, METRIC_LABELS, type Metric } from '~~/shared/types/sentinel'
import { formatDate } from '~~/shared/utils/format'

interface Compare {
  from: Run | null
  to: Run | null
  results: Omit<PageResult, 'details'>[]
}

const route = useRoute()
const router = useRouter()
const { site, siteId, pageLabel } = useSentinel()
const { data: runs } = await useFetch<Run[]>('/api/runs', {
  query: { limit: 200, site: siteId },
  default: () => [],
})
const completed = computed(() => runs.value.filter((r) => r.status === 'completed'))

const to = ref<number | null>(Number(route.query.to) || (completed.value[0]?.id ?? null))
const from = ref<number | null>(
  Number(route.query.from) || (completed.value.find((r) => r.id !== to.value)?.id ?? null)
)
watch([from, to], () => router.replace({ query: { from: from.value ?? '', to: to.value ?? '' } }))
// Switching site: pick that site's two most recent completed runs.
watch(completed, (list) => {
  if (list.some((r) => r.id === to.value) && list.some((r) => r.id === from.value)) return
  to.value = list[0]?.id ?? null
  from.value = list.find((r) => r.id !== to.value)?.id ?? null
})

const { data } = await useFetch<Compare>('/api/compare', {
  query: { from, to },
  immediate: !!(from.value && to.value),
  watch: [from, to],
})

const strategy = ref<'mobile' | 'desktop'>('mobile')
const metrics: Metric[] = [...SCORE_METRICS, 'lcp', 'cls', 'tbt', 'fcp', 'si', 'ttfb']

function result(runId: number | null, pageId: string) {
  return data.value?.results.find(
    (r) => r.runId === runId && r.pageId === pageId && r.strategy === strategy.value
  )
}
function runLabel(r: Run) {
  return `#${r.id} · ${formatDate(r.startedAt)}${r.releaseTag ? ` · ${r.releaseTag}` : ''}`
}
</script>

<template>
  <div>
    <section class="card">
      <div class="card-header">
        <h1>Compare runs — {{ site?.name }}</h1>
        <div class="row">
          <label class="small muted">From</label>
          <select v-model.number="from">
            <option v-for="r in completed" :key="r.id" :value="r.id">{{ runLabel(r) }}</option>
          </select>
          <label class="small muted">To</label>
          <select v-model.number="to">
            <option v-for="r in completed" :key="r.id" :value="r.id">{{ runLabel(r) }}</option>
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

      <div v-if="completed.length < 2" class="empty">At least two completed runs are needed.</div>
      <table v-else-if="data">
        <thead>
          <tr>
            <th>Page</th>
            <th v-for="m in metrics" :key="m" class="num">{{ METRIC_LABELS[m] }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in site?.pages ?? []" :key="p.id">
            <td>
              <strong>{{ pageLabel(p.id, siteId) }}</strong>
              <div class="muted small">{{ p.path }}</div>
            </td>
            <td v-for="m in metrics" :key="m" class="num">
              <MetricValue
                :metric="m"
                :value="result(to, p.id)?.[m]"
                :previous="result(from, p.id)?.[m]"
              />
            </td>
          </tr>
        </tbody>
      </table>
      <p class="muted small" style="margin-top: 0.5rem">
        Values are from the "To" run; the coloured delta is the change since the "From" run (green =
        better).
      </p>
    </section>
  </div>
</template>
