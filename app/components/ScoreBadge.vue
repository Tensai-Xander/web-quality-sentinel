<script setup lang="ts">
import { scoreBand } from '~~/shared/utils/format'

defineProps<{ value: number | null | undefined }>()
</script>

<template>
  <span class="badge" :class="scoreBand(value)">{{ value == null ? '–' : Math.round(value) }}</span>
</template>
