<script setup lang="ts">
import type { Alert } from '~~/server/db/schema'
import type { IssueDetails } from '~~/server/utils/psi'
import { formatMetric, formatDate } from '~~/shared/utils/format'
import { METRIC_LABELS } from '~~/shared/types/sentinel'

export interface AlertIssue {
  id: string
  title: string
  savings: number | null
  description?: string | null
  details?: IssueDetails | null
}

defineProps<{
  alerts: Alert[]
  showRun?: boolean
  /** Site the alerts belong to (for page labels). */
  siteId?: string | null
  /** Optional: Lighthouse issues that affect the alert's metric, shown under the message. */
  issuesFor?: (alert: Alert) => AlertIssue[]
}>()
const { pageLabel } = useSentinel()
const openIssue = ref<string | null>(null)
const toggle = (key: string) => (openIssue.value = openIssue.value === key ? null : key)
</script>

<template>
  <div v-if="!alerts.length" class="empty">No alerts.</div>
  <table v-else>
    <thead>
      <tr>
        <th v-if="showRun">Run</th>
        <th>Severity</th>
        <th>Kind</th>
        <th>Page</th>
        <th>Device</th>
        <th>Metric</th>
        <th class="num">Actual</th>
        <th class="num">Limit / baseline</th>
        <th>Message</th>
        <th v-if="showRun">When</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="a in alerts" :key="a.id">
        <td v-if="showRun">
          <NuxtLink :to="`/runs/${a.runId}`">#{{ a.runId }}</NuxtLink>
        </td>
        <td>
          <span class="pill" :class="a.severity">{{ a.severity }}</span>
        </td>
        <td>{{ a.kind }}</td>
        <td :title="a.url">{{ pageLabel(a.pageId, siteId) }}</td>
        <td>{{ a.strategy }}</td>
        <td>{{ METRIC_LABELS[a.metric as keyof typeof METRIC_LABELS] ?? a.metric }}</td>
        <td class="num">{{ formatMetric(a.metric, a.actual) }}</td>
        <td class="num">
          {{ formatMetric(a.metric, a.kind === 'threshold' ? a.limit : a.baseline) }}
        </td>
        <td style="white-space: normal">
          {{ a.message }}
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
                >{{ i.title }}</span
              ><template v-if="i.savings">
                — ~{{ a.metric === 'cls' ? i.savings.toFixed(3) : Math.round(i.savings) + ' ms' }}
              </template>
              <IssueDetail
                v-if="openIssue === `${a.id}:${i.id}`"
                :description="i.description"
                :details="i.details"
              />
            </li>
          </ul>
        </td>
        <td v-if="showRun" class="muted small">{{ formatDate(a.createdAt) }}</td>
      </tr>
    </tbody>
  </table>
</template>
