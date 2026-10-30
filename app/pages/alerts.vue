<script setup lang="ts">
import type { Alert } from '~~/server/db/schema'

const { site, siteId } = useSentinel()
const { data: alerts } = await useFetch<Alert[]>('/api/alerts', {
  query: { limit: 500, site: siteId },
  default: () => [],
})
const kind = ref<'all' | 'threshold' | 'regression'>('all')
const severity = ref<'all' | 'warn' | 'fail'>('all')
const filtered = computed(() =>
  alerts.value.filter(
    (a) =>
      (kind.value === 'all' || a.kind === kind.value) &&
      (severity.value === 'all' || a.severity === severity.value)
  )
)
</script>

<template>
  <section class="card">
    <div class="card-header">
      <h1>Alerts — {{ site?.name }}</h1>
      <div class="row">
        <select v-model="kind">
          <option value="all">All kinds</option>
          <option value="threshold">Threshold</option>
          <option value="regression">Regression</option>
        </select>
        <select v-model="severity">
          <option value="all">All severities</option>
          <option value="fail">Fail</option>
          <option value="warn">Warn</option>
        </select>
      </div>
    </div>
    <AlertTable :alerts="filtered" :site-id="siteId" show-run />
  </section>
</template>
