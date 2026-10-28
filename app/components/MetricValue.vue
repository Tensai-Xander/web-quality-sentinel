<script setup lang="ts">
import { formatMetric, isScoreMetric } from '~~/shared/utils/format'

const props = defineProps<{
  metric: string
  value: number | null | undefined
  /** Previous value to show a delta against. */
  previous?: number | null
}>()

const delta = computed(() => {
  if (props.value == null || props.previous == null) return null
  return props.value - props.previous
})
const deltaClass = computed(() => {
  if (delta.value == null || Math.abs(delta.value) < 1e-6) return ''
  const improved = isScoreMetric(props.metric) ? delta.value > 0 : delta.value < 0
  return improved ? 'better' : 'worse'
})
const deltaText = computed(() => {
  if (delta.value == null) return ''
  const sign = delta.value > 0 ? '+' : '−'
  const abs = Math.abs(delta.value)
  if (isScoreMetric(props.metric)) return `${sign}${Math.round(abs)}`
  if (props.metric === 'cls') return `${sign}${abs.toFixed(3)}`
  return `${sign}${formatMetric(props.metric, abs)}`
})
</script>

<template>
  <span>
    <ScoreBadge v-if="isScoreMetric(metric)" :value="value" />
    <template v-else>{{ formatMetric(metric, value) }}</template>
    <span v-if="delta != null && deltaClass" class="delta" :class="deltaClass">{{
      deltaText
    }}</span>
  </span>
</template>
