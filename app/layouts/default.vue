<script setup lang="ts">
const { config, refresh: refreshConfig, siteId, site, siteName } = useSentinel()
const running = computed(() => config.value?.activeRun != null)
const starting = ref(false)

async function runNow() {
  starting.value = true
  try {
    await $fetch('/api/runs', { method: 'POST', body: { trigger: 'manual', siteId: siteId.value } })
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
      <NuxtLink to="/" class="brand">Web Quality Sentinel</NuxtLink>
      <select
        v-if="config && config.sites.length > 1"
        v-model="siteId"
        class="site-select"
        title="Monitored site"
      >
        <option v-for="s in config.sites" :key="s.id" :value="s.id">{{ s.name }}</option>
      </select>
      <small v-else-if="site" class="muted">· {{ site.name }}</small>
      <nav>
        <NuxtLink to="/">Overview</NuxtLink>
        <NuxtLink to="/trends">Trends</NuxtLink>
        <NuxtLink to="/alerts">Alerts</NuxtLink>
        <NuxtLink to="/compare">Compare</NuxtLink>
        <NuxtLink to="/settings">Settings</NuxtLink>
      </nav>
      <span v-if="config?.activeRun" class="pill running">
        Run #{{ config.activeRun.id }}
        <template v-if="config.activeRun.siteId !== siteId">
          ({{ siteName(config.activeRun.siteId) }})
        </template>
        in progress…
      </span>
      <button
        class="primary"
        :disabled="running || starting"
        :title="site ? `Run all pages of ${site.name} now` : ''"
        @click="runNow"
      >
        Run now
      </button>
    </header>
    <main>
      <slot />
    </main>
  </div>
</template>
