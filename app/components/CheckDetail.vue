<script setup lang="ts">
import type { CrawlResult } from '~~/server/utils/crawler'
import type { QualityMetric } from '~~/shared/types/sentinel'

const props = defineProps<{
  details: CrawlResult
  /** Show only the section behind this quality metric (default: everything). */
  only?: QualityMetric | null
}>()
const show = (...metrics: QualityMetric[]) => !props.only || metrics.includes(props.only)
const META_KEYS = [
  'title',
  'description',
  'canonical',
  'robots',
  'lang',
  'ogTitle',
  'ogDescription',
  'ogImage',
] as const
</script>

<template>
  <div class="small">
    <div v-if="only === 'http'">
      <h3>HTTP status</h3>
      <div>
        <span class="pill" :class="(details.httpStatus ?? 500) >= 400 ? 'fail' : 'completed'">{{
          details.httpStatus ?? '–'
        }}</span>
        <span class="muted" style="margin-left: 0.4em">{{ details.finalUrl }}</span>
      </div>
    </div>
    <div class="grid">
      <div v-if="show('meta')">
        <h3>Meta tags</h3>
        <ul
          v-if="details.meta.issues.length"
          style="margin: 0 0 0.4rem; padding-left: 1.1rem; color: var(--average)"
        >
          <li v-for="i in details.meta.issues" :key="i">{{ i }}</li>
        </ul>
        <div v-else class="muted">No issue.</div>
        <table class="small">
          <tbody>
            <tr v-for="k in META_KEYS" :key="k">
              <th>{{ k }}</th>
              <td style="white-space: normal">{{ details.meta[k] ?? '–' }}</td>
            </tr>
            <tr>
              <th>h1</th>
              <td>{{ details.meta.h1Count }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="show('jsonld', 'jsErrors')">
        <template v-if="show('jsonld')">
          <h3>Structured data (JSON-LD)</h3>
          <div>
            {{ details.jsonld.count }} block(s)<template v-if="details.jsonld.types.length"
              >: {{ details.jsonld.types.join(', ') }}</template
            >
          </div>
          <ul
            v-if="details.jsonld.issues.length"
            style="margin: 0.3rem 0 0; padding-left: 1.1rem; color: var(--average)"
          >
            <li v-for="i in details.jsonld.issues" :key="i">{{ i }}</li>
          </ul>
        </template>
        <template v-if="show('jsErrors')">
          <h3 :style="only ? '' : 'margin-top: 0.8rem'">JavaScript errors</h3>
          <ul
            v-if="details.pageErrors.length || details.consoleErrors.length"
            style="margin: 0; padding-left: 1.1rem"
          >
            <li v-for="e in [...details.pageErrors, ...details.consoleErrors]" :key="e">
              <code>{{ e }}</code>
            </li>
          </ul>
          <div v-else class="muted">None.</div>
        </template>
      </div>
      <div v-if="show('brokenLinks', 'http')">
        <template v-if="show('brokenLinks')">
          <h3>
            Broken links ({{ details.brokenLinks.length }} of {{ details.linksChecked }} checked)
          </h3>
          <ul v-if="details.brokenLinks.length" style="margin: 0; padding-left: 1.1rem">
            <li v-for="l in details.brokenLinks" :key="l.url">
              <a :href="l.url" target="_blank" rel="noopener" @click.stop>{{ l.url }}</a>
              <span class="pill fail" style="margin-left: 0.3em">{{ l.status ?? l.error }}</span>
              <span v-if="l.text" class="muted"> — "{{ l.text }}"</span>
            </li>
          </ul>
          <div v-else class="muted">None.</div>
        </template>
        <h3 :style="only ? '' : 'margin-top: 0.8rem'">
          Failed requests ({{ details.failedRequests.length }})
        </h3>
        <ul v-if="details.failedRequests.length" style="margin: 0; padding-left: 1.1rem">
          <li v-for="f in details.failedRequests" :key="f.url">
            <code>{{ f.url }}</code>
            <span class="pill warn">{{ f.status ?? f.error }}</span>
          </li>
        </ul>
        <div v-else class="muted">None.</div>
      </div>
    </div>
    <div v-if="show('a11y')" :style="only ? '' : 'margin-top: 0.8rem'">
      <h3>
        Accessibility (axe-core)
        <template v-if="details.a11y">
          — {{ details.a11y.violations.length }} rule(s) failed on
          {{ details.a11y.elements }} element(s), {{ details.a11y.passes }} rules passed
        </template>
      </h3>
      <div v-if="!details.a11y" class="muted">
        Not checked (run made before the accessibility audit was added).
      </div>
      <div v-else-if="details.a11y.error" style="color: var(--poor)">
        Audit failed: {{ details.a11y.error }}
      </div>
      <div v-else-if="!details.a11y.violations.length" class="muted">No violation.</div>
      <table v-else class="small">
        <thead>
          <tr>
            <th>Impact</th>
            <th>Rule</th>
            <th class="num">Elements</th>
            <th>WCAG</th>
            <th>Examples</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="v in details.a11y.violations" :key="v.id">
            <td>
              <span
                class="pill"
                :class="v.impact === 'critical' || v.impact === 'serious' ? 'fail' : 'warn'"
                >{{ v.impact }}</span
              >
            </td>
            <td style="white-space: normal">
              <a :href="v.helpUrl" target="_blank" rel="noopener" @click.stop>{{ v.help }}</a>
              <div class="muted">
                <code>{{ v.id }}</code>
              </div>
            </td>
            <td class="num">{{ v.nodes }}</td>
            <td style="white-space: normal">
              {{ v.tags.filter((t) => t.startsWith('wcag')).join(', ') || 'best practice' }}
            </td>
            <td style="white-space: normal; max-width: 32rem">
              <div v-for="n in v.samples" :key="n.target" class="muted">
                <code :title="n.html">{{ n.target }}</code>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
