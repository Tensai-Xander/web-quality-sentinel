<script setup lang="ts">
import type { Run, PageResult, Alert } from '~~/server/db/schema'
import { SCORE_METRICS, METRIC_LABELS } from '~~/shared/types/sentinel'
import { formatDate, formatDuration } from '~~/shared/utils/format'

type RunRow = Run & { alertCount: number; failCount: number; errorCount: number }
interface RunDetail {
  run: Run
  results: PageResult[]
  alerts: Alert[]
}

const { config, site, siteId } = useSentinel()
const { data: runs, refresh: refreshRuns } = await useFetch<RunRow[]>('/api/runs', {
  query: { limit: 20, site: siteId },
  default: () => [],
})

const latestId = computed(() => runs.value[0]?.id)
const previousCompletedId = computed(
  () => runs.value.find((r) => r.status === 'completed' && r.id !== latestId.value)?.id
)

const { data: latest, refresh: refreshLatest } = await useFetch<RunDetail | null>(
  () => (latestId.value ? `/api/runs/${latestId.value}` : ''),
  { immediate: !!latestId.value, default: () => null, watch: [latestId] }
)
const { data: previous } = await useFetch<RunDetail | null>(
  () => (previousCompletedId.value ? `/api/runs/${previousCompletedId.value}` : ''),
  { immediate: !!previousCompletedId.value, default: () => null, watch: [previousCompletedId] }
)

const strategy = ref<'mobile' | 'desktop'>('mobile')

function resultFor(detail: RunDetail | null, pageId: string) {
  return detail?.results.find((r) => r.pageId === pageId && r.strategy === strategy.value)
}
function alertsFor(pageId: string) {
  return (
    latest.value?.alerts.filter((a) => a.pageId === pageId && a.strategy === strategy.value) ?? []
  )
}

let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(async () => {
    if (config.value?.activeRun != null || latest.value?.run.status === 'running') {
      await refreshRuns()
      await refreshLatest()
    }
  }, 5000)
})
onUnmounted(() => clearInterval(timer))
</script>

<template>
  <div>
    <div v-if="!runs.length" class="card empty">
      <h2>No runs yet</h2>
      <p>Click <strong>Run now</strong> to launch the first check of {{ site?.name }}.</p>
      <p v-if="config && !config.hasApiKey" class="small">
        ⚠ No PageSpeed API key configured (<code>NUXT_PSI_API_KEY</code>). Requests may be rejected
        with 429 — see <NuxtLink to="/settings">Settings</NuxtLink>.
      </p>
    </div>

    <template v-else-if="latest">
      <section class="card">
        <div class="card-header">
          <div>
            <h2>
              Latest run <NuxtLink :to="`/runs/${latest.run.id}`">#{{ latest.run.id }}</NuxtLink>
              <RunStatusPill :status="latest.run.status" />
            </h2>
            <div class="muted small">
              {{ latest.run.trigger }}
              <template v-if="latest.run.releaseTag">
                · release {{ latest.run.releaseTag }}</template
              >
              · {{ formatDate(latest.run.startedAt) }} ·
              {{ formatDuration(latest.run.startedAt, latest.run.finishedAt) }}
              <template v-if="previous"> · compared with #{{ previous.run.id }}</template>
            </div>
            <div v-if="latest.run.error" class="small" style="color: var(--poor)">
              {{ latest.run.error }}
            </div>
          </div>
          <div class="row">
            <div v-if="latest.run.status === 'running'" class="row small muted">
              {{ latest.run.checksDone }}/{{ latest.run.checksTotal }}
              <div class="progress">
                <div
                  :style="{
                    width: `${(100 * latest.run.checksDone) / Math.max(1, latest.run.checksTotal)}%`,
                  }"
                />
              </div>
            </div>
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

        <table>
          <thead>
            <tr>
              <th>Page</th>
              <th v-for="m in SCORE_METRICS" :key="m" class="num">{{ METRIC_LABELS[m] }}</th>
              <th class="num">LCP</th>
              <th class="num">CLS</th>
              <th class="num">TBT</th>
              <th class="num">FCP</th>
              <th>Alerts</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in site?.pages ?? []" :key="p.id">
              <td>
                <strong>{{ p.label }}</strong>
                <div class="muted small">{{ p.path }}</div>
              </td>
              <template v-if="resultFor(latest, p.id)?.status === 'ok'">
                <td v-for="m in SCORE_METRICS" :key="m" class="num">
                  <MetricValue
                    :metric="m"
                    :value="resultFor(latest, p.id)?.[m]"
                    :previous="resultFor(previous, p.id)?.[m]"
                  />
                </td>
                <td v-for="m in ['lcp', 'cls', 'tbt', 'fcp'] as const" :key="m" class="num">
                  <MetricValue
                    :metric="m"
                    :value="resultFor(latest, p.id)?.[m]"
                    :previous="resultFor(previous, p.id)?.[m]"
                  />
                </td>
              </template>
              <td
                v-else-if="resultFor(latest, p.id)"
                colspan="8"
                class="small"
                style="color: var(--poor)"
              >
                {{ resultFor(latest, p.id)?.error ?? 'error' }}
              </td>
              <td v-else colspan="8" class="muted small">pending…</td>
              <td>
                <span v-if="alertsFor(p.id).some((a) => a.severity === 'fail')" class="pill fail">
                  {{ alertsFor(p.id).length }}
                </span>
                <span v-else-if="alertsFor(p.id).length" class="pill warn">{{
                  alertsFor(p.id).length
                }}</span>
                <span v-else-if="resultFor(latest, p.id)?.status === 'ok'" class="pill completed"
                  >ok</span
                >
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section v-if="latest.alerts.length" class="card">
        <h2>Alerts in this run</h2>
        <AlertTable :alerts="latest.alerts" :site-id="siteId" />
      </section>
    </template>

    <section v-if="runs.length" class="card">
      <h2>Recent runs — {{ site?.name }}</h2>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Status</th>
            <th>Trigger</th>
            <th>Release</th>
            <th>Started</th>
            <th>Duration</th>
            <th class="num">Checks</th>
            <th class="num">Alerts</th>
            <th class="num">Errors</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in runs" :key="r.id" class="clickable" @click="navigateTo(`/runs/${r.id}`)">
            <td>#{{ r.id }}</td>
            <td><RunStatusPill :status="r.status" /></td>
            <td>{{ r.trigger }}</td>
            <td>{{ r.releaseTag ?? '–' }}</td>
            <td>{{ formatDate(r.startedAt) }}</td>
            <td>{{ formatDuration(r.startedAt, r.finishedAt) }}</td>
            <td class="num">{{ r.checksDone }}/{{ r.checksTotal }}</td>
            <td class="num">
              <span v-if="r.failCount" class="pill fail">{{ r.alertCount }}</span>
              <span v-else-if="r.alertCount" class="pill warn">{{ r.alertCount }}</span>
              <span v-else class="muted">0</span>
            </td>
            <td class="num" :style="r.errorCount ? 'color: var(--poor)' : ''">
              {{ r.errorCount }}
            </td>
          </tr>
        </tbody>
      </table>
      <p class="muted small" style="margin-top: 0.5rem">
        Pages × devices: {{ site?.pages.length }} × {{ config?.strategies.length }} ·
        {{ config?.psi.samples }} samples each
      </p>
    </section>
  </div>
</template>
