<script setup lang="ts">
const { config, refresh: refreshConfig } = useSentinel()
const running = computed(() => config.value?.activeRunId != null)
const starting = ref(false)

async function runNow() {
  starting.value = true
  try {
    await $fetch('/api/runs', { method: 'POST', body: { trigger: 'manual' } })
    await refreshConfig()
    await navigateTo('/')
  } finally {
    starting.value = false
  }
}

let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(() => refreshConfig(), 5000)
})
onUnmounted(() => clearInterval(timer))
</script>

<template>
  <div>
    <header class="topbar">
      <NuxtLink to="/" class="brand">
        Web Quality Sentinel
        <small v-if="config">· {{ config.site.name }}</small>
      </NuxtLink>
      <nav>
        <NuxtLink to="/">Overview</NuxtLink>
        <NuxtLink to="/trends">Trends</NuxtLink>
        <NuxtLink to="/alerts">Alerts</NuxtLink>
        <NuxtLink to="/compare">Compare</NuxtLink>
        <NuxtLink to="/settings">Settings</NuxtLink>
      </nav>
      <span v-if="running" class="pill running">Run #{{ config?.activeRunId }} in progress…</span>
      <button class="primary" :disabled="running || starting" @click="runNow">Run now</button>
    </header>
    <main>
      <slot />
    </main>
  </div>
</template>
