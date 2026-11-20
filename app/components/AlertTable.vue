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

const props = defineProps<{
  alerts: Alert[]
  /** Site the alerts belong to (for page labels). */
  siteId?: string | null
  /** Optional: Lighthouse issues that affect the alert's metric, shown under the message. */
  issuesFor?: (alert: Alert) => AlertIssue[]
  /**
   * Browser checks of the alerts' run, so quality alerts can expand their detail in place.
   * When omitted (alerts of several runs), the run is fetched on first expand.
   */
  checks?: CheckRow[]
}>()
const { pageLabel } = useSentinel()
const kind = ref<'all' | 'threshold' | 'quality'>('all')
const severity = ref<'all' | 'warn' | 'fail'>('all')
const filtered = computed(() =>
  props.alerts.filter(
    (a) =>
      (kind.value === 'all' || a.kind === kind.value) &&
      (severity.value === 'all' || a.severity === severity.value)
  )
)
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
      <span class="muted small">{{ filtered.length }} / {{ alerts.length }}</span>
    </div>
    <div v-if="!filtered.length" class="empty">No alerts match the filters.</div>
    <table v-else>
      <thead>
        <tr>
          <th>Severity</th>
          <th>Kind</th>
          <th>Page</th>
          <th>Device</th>
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
            <td :title="a.url">{{ pageLabel(a.pageId, siteId) }}</td>
            <td>{{ a.strategy }}</td>
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
              <span
                v-if="a.kind === 'quality'"
                class="issue-toggle"
                :class="{ open: openCheck === a.id }"
                title="Show details"
                @click="toggleCheck(a)"
                >{{ a.message }}</span
              >
              <template v-else>{{ a.message }}</template>
              <ul
                v-if="issuesFor && issuesFor(a).length"
                class="small muted"
                style="margin: 0.3rem 0 0; padding-left: 1.1rem"
              >
                <li v-for="i in issuesFor(a)" :key="i.id">
                  <span
                    class="issue-toggle"
                    :class="{ open: openIssue === `${a.id}:${i.id}` }"
                    title="Show details"
                    @click="toggle(`${a.id}:${i.id}`)"
                    >{{ i.title }}</span><template v-if="i.savings">
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
            </td>
          </tr>
          <tr v-if="a.kind === 'quality' && openCheck === a.id">
            <td colspan="8" style="white-space: normal; padding: 0.4rem 0.6rem">
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
