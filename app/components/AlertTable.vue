<script setup lang="ts">
import type { Alert, PageCheck } from '~~/server/db/schema'
import type { CrawlResult } from '~~/server/utils/crawler'
import type { IssueDetails } from '~~/server/utils/psi'
import { formatMetric } from '~~/shared/utils/format'
import { METRIC_LABELS, QUALITY_LABELS, type QualityMetric } from '~~/shared/types/sentinel'

export type CheckRow = Omit<PageCheck, 'details'> & { details: CrawlResult | null }

export interface AlertIssue {
  id: string
  title: string
  savings: number | null
  description?: string | null
  details?: IssueDetails | null
}

/** Context of a threshold alert: the page × device's other Lighthouse findings. */
export interface AlertContext {
  /** Issues flagged without an estimated gain for any metric (shown under the Performance alert). */
  alsoFlagged: AlertIssue[]
  /** Total number of issues Lighthouse reported for the page × device. */
  total: number
  /** Opens the page × device row (full list with details). */
  open: () => void
}

const props = defineProps<{
  alerts: Alert[]
  /** Site the alerts belong to (for page labels). */
  siteId?: string | null
  /** Optional: Lighthouse issues that affect the alert's metric, shown under the message. */
  issuesFor?: (alert: Alert) => AlertIssue[]
  /** Optional: the other Lighthouse findings of the alert's page × device and a way to open its row. */
  contextFor?: (alert: Alert) => AlertContext | null
  /** Page / device filters (shown when `pages` is given); `page` + `device` preset them. */
  pages?: { id: string; label: string }[]
  page?: string | null
  device?: string | null
  /** Omit the Page and Device columns (table shown inside a page × device row). */
  hidePageDevice?: boolean
  /**
   * Browser checks of the alerts' run, so quality alerts can expand their detail in place.
   * When omitted (alerts of several runs), the run is fetched on first expand.
   */
  checks?: CheckRow[]
}>()
const { pageLabel } = useSentinel()
const kind = ref<'all' | 'threshold' | 'quality'>('all')
const severity = ref<'all' | 'warn' | 'fail'>('all')
const page = ref(props.page ?? 'all')
const device = ref(props.device ?? 'all')
watch(
  () => [props.page, props.device],
  ([p, d]) => {
    page.value = p ?? 'all'
    device.value = d ?? 'all'
  }
)
const devices = computed(() => [...new Set(props.alerts.map((a) => a.strategy))].sort())
const filtered = computed(() =>
  props.alerts.filter(
    (a) =>
      (kind.value === 'all' || a.kind === kind.value) &&
      (severity.value === 'all' || a.severity === severity.value) &&
      (page.value === 'all' || a.pageId === page.value) &&
      (device.value === 'all' || a.strategy === device.value)
  )
)
const narrowed = computed(() => page.value !== 'all' || device.value !== 'all')
function showAll() {
  page.value = 'all'
  device.value = 'all'
}
const openIssue = ref<string | null>(null)
const toggle = (key: string) => (openIssue.value = openIssue.value === key ? null : key)

const openCheck = ref<number | null>(null)
const fetched = reactive(new Map<number, CheckRow[] | null>())
const loading = ref(false)
async function toggleCheck(a: Alert) {
  if (openCheck.value === a.id) {
    openCheck.value = null
    return
  }
  openCheck.value = a.id
  if (props.checks || fetched.has(a.runId)) return
  loading.value = true
  try {
    const run = await $fetch<{ checks?: CheckRow[] }>(`/api/runs/${a.runId}`)
    fetched.set(a.runId, run?.checks ?? [])
  } catch {
    fetched.set(a.runId, null)
  } finally {
    loading.value = false
  }
}
/** Browser check (page + device) behind a quality alert; undefined while loading, null if none. */
function checkFor(a: Alert) {
  const rows = props.checks ?? fetched.get(a.runId)
  if (rows === undefined) return undefined
  return rows?.find((c) => c.pageId === a.pageId && c.strategy === a.strategy) ?? null
}
</script>

<template>
  <div v-if="!alerts.length" class="empty">No alerts.</div>
  <div v-else>
    <div class="row filters">
      <select v-model="kind" aria-label="Alert kind">
        <option value="all">All kinds</option>
        <option value="threshold">Threshold</option>
        <option value="quality">Quality (links, JS, meta, JSON-LD, accessibility)</option>
      </select>
      <select v-model="severity" aria-label="Alert severity">
        <option value="all">All severities</option>
        <option value="fail">Fail</option>
        <option value="warn">Warn</option>
      </select>
      <template v-if="pages">
        <select v-model="page" aria-label="Page">
          <option value="all">All pages</option>
          <option v-for="p in pages" :key="p.id" :value="p.id">{{ p.label }}</option>
        </select>
        <select v-model="device" aria-label="Device">
          <option value="all">All devices</option>
          <option v-for="d in devices" :key="d" :value="d">{{ d }}</option>
        </select>
      </template>
      <span class="muted small">{{ filtered.length }} / {{ alerts.length }}</span>
      <a v-if="narrowed" href="#" class="small" @click.prevent="showAll">show all</a>
    </div>
    <div v-if="!filtered.length" class="empty">No alerts match the filters.</div>
    <table v-else>
      <thead>
        <tr>
          <th>Severity</th>
          <th>Kind</th>
          <template v-if="!hidePageDevice">
            <th>Page</th>
            <th>Device</th>
          </template>
          <th>Metric</th>
          <th class="num">Actual</th>
          <th class="num">Limit</th>
          <th>Message</th>
        </tr>
      </thead>
      <tbody>
        <template v-for="a in filtered" :key="a.id">
          <tr>
            <td>
              <span class="pill" :class="a.severity">{{ a.severity }}</span>
            </td>
            <td>{{ a.kind }}</td>
            <template v-if="!hidePageDevice">
              <td :title="a.url">{{ pageLabel(a.pageId, siteId) }}</td>
              <td>{{ a.strategy }}</td>
            </template>
            <td>
              {{
                METRIC_LABELS[a.metric as keyof typeof METRIC_LABELS] ??
                QUALITY_LABELS[a.metric as keyof typeof QUALITY_LABELS] ??
                a.metric
              }}
            </td>
            <td class="num">
              {{ a.kind === 'quality' ? a.actual : formatMetric(a.metric, a.actual) }}
            </td>
            <td class="num">
              {{ a.kind === 'quality' ? '–' : formatMetric(a.metric, a.limit) }}
            </td>
            <td style="white-space: normal">
              <button
                v-if="a.kind === 'quality'"
                type="button"
                class="issue-toggle"
                :class="{ open: openCheck === a.id }"
                :aria-expanded="openCheck === a.id"
                title="Show details"
                @click="toggleCheck(a)"
              >
                {{ a.message }}
              </button>
              <template v-else>{{ a.message }}</template>
              <ul
                v-if="issuesFor && issuesFor(a).length"
                class="small muted"
                style="margin: 0.3rem 0 0; padding-left: 1.1rem"
              >
                <li v-for="i in issuesFor(a)" :key="i.id">
                  <button
                    type="button"
                    class="issue-toggle"
                    :class="{ open: openIssue === `${a.id}:${i.id}` }"
                    :aria-expanded="openIssue === `${a.id}:${i.id}`"
                    title="Show details"
                    @click="toggle(`${a.id}:${i.id}`)"
                  >
                    {{ i.title }}</button><template v-if="i.savings">
                    — ~{{
                      a.metric === 'cls' ? i.savings.toFixed(3) : Math.round(i.savings) + ' ms'
                    }}
                  </template>
                  <IssueDetail
                    v-if="openIssue === `${a.id}:${i.id}`"
                    :description="i.description"
                    :details="i.details"
                  />
                </li>
              </ul>
              <template v-if="contextFor && contextFor(a)">
                <div
                  v-if="contextFor(a)!.alsoFlagged.length"
                  class="small muted"
                  style="margin-top: 0.3rem"
                >
                  Also flagged (no estimated gain):
                  <template v-for="(i, idx) in contextFor(a)!.alsoFlagged" :key="i.id"
                    ><template v-if="idx">, </template
                    ><button
                      type="button"
                      class="issue-toggle"
                      :class="{ open: openIssue === `${a.id}:${i.id}` }"
                      :aria-expanded="openIssue === `${a.id}:${i.id}`"
                      title="Show details"
                      @click="toggle(`${a.id}:${i.id}`)"
                    >
                      {{ i.title }}
                    </button></template
                  >
                  <IssueDetail
                    v-for="i in contextFor(a)!.alsoFlagged.filter(
                      (x) => openIssue === `${a.id}:${x.id}`
                    )"
                    :key="i.id"
                    :description="i.description"
                    :details="i.details"
                  />
                </div>
                <div v-if="contextFor(a)!.total" class="small" style="margin-top: 0.3rem">
                  <a href="#" @click.prevent="contextFor(a)!.open()"
                    >see all {{ contextFor(a)!.total }} issues of this page × device</a
                  >
                </div>
              </template>
            </td>
          </tr>
          <tr v-if="a.kind === 'quality' && openCheck === a.id">
            <td
              :colspan="hidePageDevice ? 6 : 8"
              style="white-space: normal; padding: 0.4rem 0.6rem"
            >
              <div class="issue-detail" style="margin: 0">
                <template v-if="checkFor(a) === undefined">
                  <span class="muted small">{{
                    loading ? 'Loading…' : 'Details unavailable.'
                  }}</span>
                </template>
                <CheckDetail
                  v-else-if="checkFor(a)?.details"
                  :details="checkFor(a)!.details!"
                  :only="a.metric as QualityMetric"
                />
                <span v-else class="muted small">
                  {{
                    checkFor(a)?.error
                      ? `Browser check failed: ${checkFor(a)!.error}`
                      : 'No browser-check detail stored for this page and device.'
                  }}
                </span>
              </div>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>
