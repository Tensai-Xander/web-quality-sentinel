<script setup lang="ts">
import type { Alert } from '~~/server/db/schema'
import { formatMetric, formatDate } from '~~/shared/utils/format'
import { METRIC_LABELS } from '~~/shared/types/sentinel'

defineProps<{ alerts: Alert[]; showRun?: boolean }>()
const { pageLabel } = useSentinel()
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
        <td :title="a.url">{{ pageLabel(a.pageId) }}</td>
        <td>{{ a.strategy }}</td>
        <td>{{ METRIC_LABELS[a.metric as keyof typeof METRIC_LABELS] ?? a.metric }}</td>
        <td class="num">{{ formatMetric(a.metric, a.actual) }}</td>
        <td class="num">
          {{ formatMetric(a.metric, a.kind === 'threshold' ? a.limit : a.baseline) }}
        </td>
        <td style="white-space: normal">{{ a.message }}</td>
        <td v-if="showRun" class="muted small">{{ formatDate(a.createdAt) }}</td>
      </tr>
    </tbody>
  </table>
</template>
