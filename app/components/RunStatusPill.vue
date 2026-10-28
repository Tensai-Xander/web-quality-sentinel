<script setup lang="ts">
defineProps<{ status: string }>()
</script>

<template>
  <span class="pill" :class="status">{{ status }}</span>
</template>
