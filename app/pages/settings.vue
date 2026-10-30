<script setup lang="ts">
import { SCORE_METRICS, METRIC_LABELS, type Metric } from '~~/shared/types/sentinel'
import { formatMetric } from '~~/shared/utils/format'

const { config } = useSentinel()
const timingThresholds = ['lcp', 'cls', 'tbt', 'fcp'] as const
</script>

<template>
  <div v-if="config">
    <section class="card">
      <h1>Settings</h1>
      <p class="muted small">
        Read-only view of <code>sentinel.config.ts</code>. Edit that file and restart the server to
        change it.
      </p>
      <table>
        <tbody>
          <tr>
            <th>Sites</th>
            <td>
              <div v-for="s in config.sites" :key="s.id">
                {{ s.name }} (<code>{{ s.id }}</code
                >) —
                <a :href="s.baseUrl" target="_blank" rel="noopener">{{ s.baseUrl }}</a>
                · {{ s.pages.length }} pages
              </div>
            </td>
          </tr>
          <tr>
            <th>Devices</th>
            <td>{{ config.strategies.join(', ') }}</td>
          </tr>
          <tr>
            <th>PSI samples</th>
            <td>{{ config.psi.samples }} per page × device, {{ config.psi.delayMs }} ms apart</td>
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
                >{ "siteId": "{{ config.sites[0]?.id }}", "trigger": "release", "releaseTag":
                "v1.2.3" }</code
              >
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <section v-for="s in config.sites" :key="s.id" class="card">
      <h2>Thresholds — {{ s.name }}</h2>
      <table>
        <thead>
          <tr>
            <th>Page</th>
            <th v-for="m in SCORE_METRICS" :key="m" class="num">{{ METRIC_LABELS[m] }} ≥</th>
            <th v-for="m in timingThresholds" :key="m" class="num">{{ METRIC_LABELS[m] }} ≤</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in s.pages" :key="p.id">
            <td>
              <strong>{{ p.label }}</strong>
              <div class="muted small">{{ p.url }}</div>
            </td>
            <td v-for="m in SCORE_METRICS" :key="m" class="num">{{ p.thresholds[m] }}</td>
            <td v-for="m in timingThresholds" :key="m" class="num">
              {{ formatMetric(m, p.thresholds[m]) }}
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="card">
      <h2>Regression rules</h2>
      <ul>
        <li>
          Baseline = median of the previous
          <strong>{{ config.regression.baselineRuns }}</strong> completed runs (minimum 2).
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
    </section>
  </div>
</template>
