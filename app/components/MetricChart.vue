<script setup lang="ts">
import { Line } from 'vue-chartjs'
import {
  Chart,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import { formatMetric, isScoreMetric } from '~~/shared/utils/format'

Chart.register(LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler)

const props = defineProps<{
  metric: string
  labels: string[]
  series: { label: string; data: (number | null)[] }[]
  threshold?: number | null
}>()

const palette = [
  '#0b57d0',
  '#0f9d58',
  '#f29900',
  '#d93025',
  '#7b1fa2',
  '#00897b',
  '#5d4037',
  '#455a64',
]

const chartData = computed(() => ({
  labels: props.labels,
  datasets: [
    ...props.series.map((s, i) => ({
      label: s.label,
      data: s.data,
      borderColor: palette[i % palette.length],
      backgroundColor: palette[i % palette.length],
      tension: 0.25,
      spanGaps: true,
      pointRadius: 3,
    })),
    ...(props.threshold != null
      ? [
          {
            label: isScoreMetric(props.metric) ? 'Minimum' : 'Maximum',
            data: props.labels.map(() => props.threshold as number),
            borderColor: '#d93025',
            borderDash: [6, 4],
            pointRadius: 0,
            borderWidth: 1,
          },
        ]
      : []),
  ],
}))

const options = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index' as const, intersect: false },
  scales: {
    y: {
      beginAtZero: true,
      ...(isScoreMetric(props.metric) ? { max: 100 } : {}),
      ticks: { callback: (v: number | string) => formatMetric(props.metric, Number(v)) },
    },
  },
  plugins: {
    legend: { position: 'bottom' as const, labels: { boxWidth: 10 } },
    tooltip: {
      callbacks: {
        label: (ctx: { dataset: { label?: string }; parsed: { y: number | null } }) =>
          `${ctx.dataset.label}: ${formatMetric(props.metric, ctx.parsed.y)}`,
      },
    },
  },
}))
</script>

<template>
  <div class="chart">
    <Line :data="chartData" :options="options" />
  </div>
</template>
