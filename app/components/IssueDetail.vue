<script setup lang="ts">
import type { IssueCell, IssueDetails } from '~~/server/utils/psi'

defineProps<{
  description?: string | null
  details?: IssueDetails | null
}>()

/** Lighthouse descriptions are Markdown with [text](url) links and `code`. */
function renderDescription(md: string) {
  const esc = (t: string) =>
    t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  return esc(md)
    .replace(
      /\[([^\]]+)\]\((https?:[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener">$1</a>'
    )
    .replace(/`([^`]+)`/g, '<code>$1</code>')
}

function fmt(valueType: string, v: IssueCell | undefined) {
  if (v == null || v === '') return '–'
  if (typeof v === 'number') {
    switch (valueType) {
      case 'ms':
      case 'timespanMs':
        return v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${Math.round(v)} ms`
      case 'bytes':
        return v >= 1024 * 1024
          ? `${(v / 1024 / 1024).toFixed(1)} MiB`
          : `${(v / 1024).toFixed(1)} KiB`
      default:
        return Number.isInteger(v) ? String(v) : v.toFixed(2)
    }
  }
  return String(v)
}

function shortUrl(u: string) {
  try {
    const url = new URL(u)
    const path = url.pathname + url.search
    return `${path.length > 60 ? path.slice(0, 57) + '…' : path} (${url.host})`
  } catch {
    return u
  }
}
</script>

<template>
  <div class="issue-detail small">
    <!-- eslint-disable-next-line vue/no-v-html -->
    <p v-if="description" class="muted" v-html="renderDescription(description)" />
    <table v-if="details" class="small">
      <thead>
        <tr>
          <th
            v-for="h in details.headings"
            :key="h.key"
            :class="{ num: ['ms', 'timespanMs', 'bytes', 'numeric'].includes(h.valueType) }"
          >
            {{ h.label }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, i) in details.items" :key="i">
          <td
            v-for="h in details.headings"
            :key="h.key"
            :class="{ num: ['ms', 'timespanMs', 'bytes', 'numeric'].includes(h.valueType) }"
            style="white-space: normal"
          >
            <a
              v-if="h.valueType === 'url' && /^https?:/.test(String(row[h.key] ?? ''))"
              :href="String(row[h.key])"
              :title="String(row[h.key])"
              target="_blank"
              rel="noopener"
              @click.stop
              >{{ shortUrl(String(row[h.key])) }}</a
            >
            <code v-else-if="h.valueType === 'code' || h.valueType === 'node'">{{
              fmt(h.valueType, row[h.key])
            }}</code>
            <template v-else>{{ fmt(h.valueType, row[h.key]) }}</template>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-else class="muted">No breakdown available for this issue.</p>
  </div>
</template>
