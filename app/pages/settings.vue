<script setup lang="ts">
import {
  SCORE_METRICS,
  METRIC_LABELS,
  type Metric,
  type Thresholds,
} from '~~/shared/types/sentinel'
import { formatMetric } from '~~/shared/utils/format'
import type { ClientSite, ClientPage } from '~/composables/useSentinel'

interface Proposal {
  id: string
  label: string
  path: string
  template: string
}
interface SitemapResult {
  origin: string
  urlCount: number
  pages: Proposal[]
  estimatedMinutes: number
  warnings: string[]
}

const { config, refresh, siteId } = useSentinel()
const timingThresholds = ['lcp', 'cls', 'tbt', 'fcp'] as const
const thresholdKeys = [...SCORE_METRICS, ...timingThresholds] as (keyof Thresholds)[]

const busy = ref(false)
const errors = reactive<Record<string, string>>({})
const drop = (o: object, k: string) => Reflect.deleteProperty(o, k)
// Dynamic URLs defeat Nitro's typed $fetch (TS "excessive stack depth"); use a plain string fetch.
const api = <T = unknown,>(url: string, opts?: Record<string, unknown>) =>
  ($fetch as unknown as (u: string, o?: unknown) => Promise<T>)(url, opts)

function isRunning(site: string) {
  return config.value?.activeRun?.siteId === site
}

async function call<T>(key: string, fn: () => Promise<T>): Promise<T | undefined> {
  busy.value = true
  drop(errors, key)
  try {
    const r = await fn()
    await refresh()
    return r
  } catch (e) {
    const err = e as { data?: { statusMessage?: string }; message?: string }
    errors[key] = err.data?.statusMessage ?? err.message ?? 'Request failed'
  } finally {
    busy.value = false
  }
}

/* ---------- pages ---------- */
type PageForm = { label: string; path: string; thresholds: Record<string, number | null> }
const pageEdit = reactive<Record<string, PageForm>>({}) // key: site/page
const newPage = reactive<Record<string, { label: string; path: string }>>({})
const confirmPage = reactive<Record<string, boolean>>({})
const confirmSite = reactive<Record<string, boolean>>({})
const deleteHistory = reactive<Record<string, boolean>>({})

function emptyThresholds() {
  return Object.fromEntries(thresholdKeys.map((k) => [k, null])) as Record<string, number | null>
}
function startPageEdit(site: ClientSite, p: ClientPage) {
  pageEdit[`${site.id}/${p.id}`] = {
    label: p.label,
    path: p.path,
    thresholds: { ...emptyThresholds(), ...pageOverrides(site, p) },
  }
}
/** Per-page overrides = effective thresholds that differ from the site's defaults. */
function pageOverrides(site: ClientSite, p: ClientPage) {
  const base = { ...config.value!.thresholds, ...(site.thresholds ?? {}) }
  const out: Record<string, number> = {}
  for (const k of thresholdKeys) if (p.thresholds[k] !== base[k]) out[k] = p.thresholds[k]
  return out
}
async function savePage(site: ClientSite, p: ClientPage) {
  const key = `${site.id}/${p.id}`
  const f = pageEdit[key]!
  const thresholds = Object.fromEntries(
    Object.entries(f.thresholds).filter(([, v]) => v != null && v !== ('' as unknown))
  )
  const r = await call(key, () =>
    api(`/api/sites/${site.id}/pages/${p.id}`, {
      method: 'PATCH',
      body: { label: f.label, path: f.path, thresholds },
    })
  )
  if (r) drop(pageEdit, key)
}
async function addPage(site: ClientSite) {
  const f = newPage[site.id] ?? { label: '', path: '' }
  const r = await call(site.id, () =>
    api(`/api/sites/${site.id}/pages`, {
      method: 'POST',
      body: { label: f.label, path: f.path },
    })
  )
  if (r) newPage[site.id] = { label: '', path: '' }
}
async function removePage(site: ClientSite, p: ClientPage) {
  const key = `${site.id}/${p.id}`
  const r = await call(key, () =>
    api(`/api/sites/${site.id}/pages/${p.id}`, {
      method: 'DELETE',
      query: { deleteRuns: deleteHistory[key] ? 1 : 0 },
    })
  )
  if (r) {
    drop(confirmPage, key)
    drop(deleteHistory, key)
  }
}

/* ---------- sites ---------- */
const siteEdit = reactive<Record<string, { name: string; baseUrl: string }>>({})
const newSite = reactive({ name: '', baseUrl: '', fromSitemap: true })

async function saveSite(site: ClientSite) {
  const f = siteEdit[site.id]!
  const r = await call(site.id, () => api(`/api/sites/${site.id}`, { method: 'PATCH', body: f }))
  if (r) drop(siteEdit, site.id)
}
async function removeSite(site: ClientSite) {
  const r = await call(site.id, () =>
    api(`/api/sites/${site.id}`, {
      method: 'DELETE',
      query: { deleteRuns: deleteHistory[site.id] ? 1 : 0 },
    })
  )
  if (r) {
    drop(confirmSite, site.id)
    if (siteId.value === site.id) siteId.value = config.value?.sites[0]?.id ?? ''
  }
}
async function addSite() {
  const created = await call('new-site', () =>
    api<ClientSite>('/api/sites', {
      method: 'POST',
      body: { name: newSite.name, baseUrl: newSite.baseUrl },
    })
  )
  if (!created) return
  const url = newSite.baseUrl
  newSite.name = ''
  newSite.baseUrl = ''
  if (newSite.fromSitemap) await openImport(created.id, url)
}

/* ---------- sitemap import ---------- */
const importing = reactive<Record<string, { loading: boolean; result: SitemapResult | null }>>({})
const selected = reactive<Record<string, Set<string>>>({})

async function openImport(site: string, url: string) {
  importing[site] = { loading: true, result: null }
  const result = await call(site, () =>
    api<SitemapResult>('/api/sitemap', { method: 'POST', body: { url } })
  )
  if (!result) {
    drop(importing, site)
    return
  }
  const existing = new Set(config.value?.sites.find((s) => s.id === site)?.pages.map((p) => p.path))
  importing[site] = { loading: false, result }
  selected[site] = new Set(result.pages.filter((p) => !existing.has(p.path)).map((p) => p.path))
}
function toggleProposal(site: string, path: string) {
  const set = selected[site]!
  if (set.has(path)) set.delete(path)
  else set.add(path)
}
async function addSelected(site: ClientSite) {
  const result = importing[site.id]?.result
  if (!result) return
  const pages = result.pages
    .filter((p) => selected[site.id]?.has(p.path))
    .map(({ id, label, path }) => ({ id, label, path }))
  if (!pages.length) return
  const r = await call(site.id, () =>
    api(`/api/sites/${site.id}/pages`, { method: 'POST', body: { pages } })
  )
  if (r) drop(importing, site.id)
}
function alreadyHas(site: ClientSite, path: string) {
  return site.pages.some((p) => p.path === path)
}
</script>

<template>
  <div v-if="config">
    <section class="card">
      <h1>Settings</h1>
      <p class="muted small">
        Sites and pages are stored in <code>{{ config.sitesFile }}</code> and can be edited below
        (changes apply to the next run). Thresholds, regression rules and PSI options come from
        <code>sentinel.config.ts</code>.
      </p>
      <p v-if="config.sitesError" class="small" style="color: var(--poor)">
        ⚠ {{ config.sitesError }}
      </p>
      <table>
        <tbody>
          <tr>
            <th>Devices</th>
            <td>{{ config.strategies.join(', ') }}</td>
          </tr>
          <tr>
            <th>PSI samples</th>
            <td>{{ config.psi.samples }} per page × device, {{ config.psi.delayMs }} ms apart</td>
          </tr>
          <tr>
            <th>Browser checks</th>
            <td>
              <template v-if="config.crawl.enabled">
                Playwright on {{ config.strategies.join(' and ') }}: HTTP status, JavaScript errors,
                broken links (up to {{ config.crawl.maxLinks }} per page), meta tags, JSON-LD,
                accessibility audit (axe-core)
              </template>
              <span v-else class="pill">disabled</span>
            </td>
          </tr>
          <tr>
            <th>PSI API key</th>
            <td>
              <span v-if="config.hasApiKey" class="pill completed">configured</span>
              <span v-else class="pill fail">missing — set NUXT_PSI_API_KEY in .env</span>
            </td>
          </tr>
          <tr>
            <th>Release trigger</th>
            <td>
              <code>POST /api/runs</code> with
              <code
                >{ "siteId": "{{ config.sites[0]?.id ?? 'my-site' }}", "trigger": "release",
                "releaseTag": "v1.2.3" }</code
              >
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <section v-for="s in config.sites" :key="s.id" class="card">
      <div class="card-header">
        <div>
          <template v-if="!siteEdit[s.id]">
            <h2 style="margin: 0">
              {{ s.name }} <code class="muted small">{{ s.id }}</code>
            </h2>
            <div class="muted small">
              <a :href="s.baseUrl" target="_blank" rel="noopener">{{ s.baseUrl }}</a>
              · {{ s.pages.length }} pages · a full run ≈
              {{ Math.round((s.pages.length * 6 * 12) / 60) }} min
            </div>
          </template>
          <div v-else class="row">
            <input v-model="siteEdit[s.id]!.name" placeholder="Name" style="width: 200px" />
            <input
              v-model="siteEdit[s.id]!.baseUrl"
              placeholder="https://www.example.com"
              style="width: 320px"
            />
            <button class="primary" :disabled="busy" @click="saveSite(s)">Save</button>
            <button :disabled="busy" @click="drop(siteEdit, s.id)">Cancel</button>
          </div>
        </div>
        <div class="row">
          <span
            v-if="isRunning(s.id)"
            class="pill running"
            title="Editing is disabled while a run of this site is in progress"
            >run in progress</span
          >
          <button
            :disabled="busy || isRunning(s.id)"
            @click="siteEdit[s.id] = { name: s.name, baseUrl: s.baseUrl }"
          >
            Edit site
          </button>
          <button :disabled="busy || isRunning(s.id)" @click="openImport(s.id, s.baseUrl)">
            Import from sitemap
          </button>
          <button
            class="danger"
            :disabled="busy || isRunning(s.id)"
            @click="confirmSite[s.id] = true"
          >
            Remove site
          </button>
        </div>
      </div>
      <p v-if="errors[s.id]" class="small" style="color: var(--poor)">⚠ {{ errors[s.id] }}</p>

      <div v-if="confirmSite[s.id]" class="confirm row">
        <span
          >Remove <strong>{{ s.name }}</strong> and its {{ s.pages.length }} pages from the
          configuration?</span
        >
        <label class="small"
          ><input v-model="deleteHistory[s.id]" type="checkbox" /> also delete its runs and
          results</label
        >
        <button class="danger" :disabled="busy" @click="removeSite(s)">Remove</button>
        <button :disabled="busy" @click="drop(confirmSite, s.id)">Cancel</button>
      </div>

      <div v-if="importing[s.id]" class="confirm">
        <div v-if="importing[s.id]!.loading" class="muted">
          Reading the sitemap of {{ s.baseUrl }}…
        </div>
        <template v-else-if="importing[s.id]!.result">
          <div class="row" style="justify-content: space-between">
            <strong>
              {{ importing[s.id]!.result!.urlCount }} URLs in the sitemap →
              {{ importing[s.id]!.result!.pages.length }} kinds of page. Tick the ones to monitor.
            </strong>
            <div class="row">
              <span class="muted small">{{ selected[s.id]?.size ?? 0 }} selected</span>
              <button
                class="primary"
                :disabled="busy || !selected[s.id]?.size"
                @click="addSelected(s)"
              >
                Add selected
              </button>
              <button :disabled="busy" @click="drop(importing, s.id)">Close</button>
            </div>
          </div>
          <p v-if="!importing[s.id]!.result!.pages.length" class="muted small">
            No sitemap found. Add pages by hand below.
          </p>
          <table v-else class="small" style="margin-top: 0.5rem">
            <thead>
              <tr>
                <th />
                <th>Kind of page</th>
                <th>Example URL</th>
                <th>Label</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in importing[s.id]!.result!.pages" :key="p.path">
                <td>
                  <input
                    type="checkbox"
                    :checked="selected[s.id]?.has(p.path)"
                    :disabled="alreadyHas(s, p.path)"
                    @change="toggleProposal(s.id, p.path)"
                  />
                </td>
                <td>
                  <code>{{ p.template }}</code>
                </td>
                <td>
                  <a :href="s.baseUrl + p.path" target="_blank" rel="noopener">{{ p.path }}</a>
                  <span v-if="alreadyHas(s, p.path)" class="pill" style="margin-left: 0.4em"
                    >already monitored</span
                  >
                </td>
                <td>{{ p.label }}</td>
              </tr>
            </tbody>
          </table>
          <p class="muted small" style="margin: 0.4rem 0 0">
            Each page adds about 75 s to a run. Pages that need a login or redirect elsewhere are
            measured as what PSI sees (often the login page) — leave them out.
          </p>
        </template>
      </div>

      <table>
        <thead>
          <tr>
            <th>Page</th>
            <th v-for="m in SCORE_METRICS" :key="m" class="num">{{ METRIC_LABELS[m] }} ≥</th>
            <th v-for="m in timingThresholds" :key="m" class="num">{{ METRIC_LABELS[m] }} ≤</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <template v-for="p in s.pages" :key="p.id">
            <tr v-if="!pageEdit[`${s.id}/${p.id}`]">
              <td>
                <strong>{{ p.label }}</strong>
                <span
                  v-if="Object.keys(pageOverrides(s, p)).length"
                  class="pill"
                  style="margin-left: 0.4em"
                  title="This page has its own thresholds"
                  >custom</span
                >
                <div class="muted small" :title="p.url">{{ p.path }}</div>
              </td>
              <td v-for="m in SCORE_METRICS" :key="m" class="num">{{ p.thresholds[m] }}</td>
              <td v-for="m in timingThresholds" :key="m" class="num">
                {{ formatMetric(m, p.thresholds[m]) }}
              </td>
              <td class="num" style="white-space: nowrap">
                <template v-if="confirmPage[`${s.id}/${p.id}`]">
                  <label class="small"
                    ><input v-model="deleteHistory[`${s.id}/${p.id}`]" type="checkbox" /> delete
                    history</label
                  >
                  <button class="danger small" :disabled="busy" @click="removePage(s, p)">
                    Remove
                  </button>
                  <button
                    class="small"
                    :disabled="busy"
                    @click="drop(confirmPage, `${s.id}/${p.id}`)"
                  >
                    Cancel
                  </button>
                </template>
                <template v-else>
                  <button
                    class="small"
                    :disabled="busy || isRunning(s.id)"
                    title="Edit label, path and thresholds"
                    @click="startPageEdit(s, p)"
                  >
                    Edit
                  </button>
                  <button
                    class="small danger"
                    :disabled="busy || isRunning(s.id)"
                    @click="confirmPage[`${s.id}/${p.id}`] = true"
                  >
                    Remove
                  </button>
                </template>
              </td>
            </tr>
            <tr v-else class="editing">
              <td class="edit-page">
                <input v-model="pageEdit[`${s.id}/${p.id}`]!.label" placeholder="Label" />
                <input v-model="pageEdit[`${s.id}/${p.id}`]!.path" placeholder="/path" />
                <div class="muted small" style="margin-top: 0.3rem">
                  id <code>{{ p.id }}</code> (history key, unchanged)
                </div>
              </td>
              <td v-for="m in thresholdKeys" :key="m" class="num">
                <input
                  v-model.number="pageEdit[`${s.id}/${p.id}`]!.thresholds[m]"
                  type="number"
                  :step="m === 'cls' ? 0.01 : 1"
                  min="0"
                  :placeholder="String({ ...config.thresholds, ...(s.thresholds ?? {}) }[m])"
                  class="threshold-input"
                  :title="`Leave empty to use the default (${METRIC_LABELS[m]} ${formatMetric(m, { ...config.thresholds, ...(s.thresholds ?? {}) }[m])})`"
                />
              </td>
              <td class="num" style="white-space: nowrap">
                <button class="primary small" :disabled="busy" @click="savePage(s, p)">Save</button>
                <button class="small" :disabled="busy" @click="drop(pageEdit, `${s.id}/${p.id}`)">
                  Cancel
                </button>
              </td>
            </tr>
            <tr v-if="errors[`${s.id}/${p.id}`]">
              <td
                :colspan="thresholdKeys.length + 2"
                class="small"
                style="color: var(--poor); white-space: normal"
              >
                ⚠ {{ errors[`${s.id}/${p.id}`] }}
              </td>
            </tr>
          </template>
          <tr class="add-row">
            <td :colspan="thresholdKeys.length + 2">
              <div class="row">
                <span class="muted small">Add a page:</span>
                <input
                  :value="newPage[s.id]?.label ?? ''"
                  placeholder="Label (optional)"
                  style="width: 200px"
                  :disabled="isRunning(s.id)"
                  @input="
                    newPage[s.id] = {
                      label: ($event.target as HTMLInputElement).value,
                      path: newPage[s.id]?.path ?? '',
                    }
                  "
                />
                <input
                  :value="newPage[s.id]?.path ?? ''"
                  placeholder="/path/of/the/page"
                  style="width: 320px"
                  :disabled="isRunning(s.id)"
                  @input="
                    newPage[s.id] = {
                      label: newPage[s.id]?.label ?? '',
                      path: ($event.target as HTMLInputElement).value,
                    }
                  "
                  @keyup.enter="addPage(s)"
                />
                <button
                  class="primary"
                  :disabled="busy || isRunning(s.id) || !newPage[s.id]?.path"
                  @click="addPage(s)"
                >
                  Add
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="card">
      <h2>Add a site</h2>
      <div class="row">
        <input
          v-model="newSite.baseUrl"
          placeholder="https://www.example.com"
          style="width: 320px"
          @keyup.enter="addSite"
        />
        <input
          v-model="newSite.name"
          placeholder="Name (optional)"
          style="width: 200px"
          @keyup.enter="addSite"
        />
        <label class="small"
          ><input v-model="newSite.fromSitemap" type="checkbox" /> then propose pages from its
          sitemap</label
        >
        <button class="primary" :disabled="busy || !newSite.baseUrl" @click="addSite">
          Add site
        </button>
      </div>
      <p v-if="errors['new-site']" class="small" style="color: var(--poor)">
        ⚠ {{ errors['new-site'] }}
      </p>
      <p class="muted small" style="margin: 0.5rem 0 0">
        Same as <code>pnpm sentinel:init &lt;url&gt;</code>. Each site has its own pages, history
        and selector entry in the top bar.
      </p>
    </section>

    <section class="card">
      <h2>Regression rules</h2>
      <ul>
        <li>
          Baseline = median of the previous
          <strong>{{ config.regression.baselineRuns }}</strong> completed runs of the same site
          (minimum 2).
        </li>
        <li>
          Score regression when a category drops by ≥
          <strong>{{ config.regression.scoreDrop }}</strong> points.
        </li>
        <li>
          Timing regression when a metric increases by ≥
          <strong>{{ config.regression.timingIncreasePct }}%</strong>
          and by more than the noise floor:
          <span
            v-for="(v, m) in config.regression.minDelta"
            :key="m"
            class="pill"
            style="margin-left: 0.3em"
          >
            {{ METRIC_LABELS[m as Metric] }} {{ formatMetric(m, v) }}
          </span>
        </li>
      </ul>
      <p class="muted small">Edit <code>sentinel.config.ts</code> and restart to change these.</p>
    </section>
  </div>
</template>
