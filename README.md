# Web Quality Sentinel

Monitors the quality of a website over time and flags regressions. Every run asks
[Google PageSpeed Insights](https://developers.google.com/speed/docs/insights/v5/get-started)
(Lighthouse) for the performance, accessibility, best-practices and SEO scores plus the lab
timings (LCP, CLS, TBT, FCP, Speed Index, TTFB) of each configured page, on mobile and desktop.
Results are stored in a local SQLite database and shown in a dashboard with history, trends,
run-to-run comparison and alerts.

Everything runs locally in a single Node process — no Docker, no external database, only free
tools.

## Set up for your site

The whole procedure for a new team or a new website takes about 10 minutes.

### 1. Prerequisites

- Node.js LTS (22.21+, 24 or 26) and pnpm: `npm install -g pnpm`. Behind a corporate proxy that
  re-signs HTTPS, `npm`/`corepack` may fail with `SELF_SIGNED_CERT_IN_CHAIN`; run
  `npm config set strict-ssl false` once (or point `NODE_EXTRA_CA_CERTS` to the proxy root
  certificate) and retry.
- A free Google API key with the **PageSpeed Insights API** enabled: in the
  [Google Cloud console](https://console.cloud.google.com/), create a project, open
  _APIs & Services → Library_ and enable "PageSpeed Insights API", then _Credentials → Create
  credentials → API key_ (optionally restrict the key to that API). Each team should use its own
  key: the quota is 25 000 requests per day per project. Without a key the anonymous quota is
  tiny and shared, so requests are often rejected with `429`.

### 2. Install

```bash
git clone https://github.com/Tensai-Xander/web-quality-sentinel.git
cd web-quality-sentinel
pnpm install
cp .env.example .env         # then put your key in NUXT_PSI_API_KEY=
```

### 3. Choose the pages to monitor

The repository ships with the Toyota Community pages in [`sentinel.config.ts`](./sentinel.config.ts).
Replace them with your own site, either from its sitemap (recommended):

```bash
pnpm sentinel:init https://www.your-site.com --force
```

or by editing `site` and `pages` by hand (see [Configuration](#configuration)). In both cases open
`sentinel.config.ts` afterwards and remove the pages that require a login or are not worth
measuring: every page costs about 75 seconds per run.

### 4. Run

```bash
pnpm dev                     # http://localhost:3000
```

Click **Run now** in the top bar. A run of 8 pages × 2 devices × 3 samples takes roughly 10
minutes because PSI is slow and requests are spaced out to respect the quota; the overview page
refreshes itself while a run is in progress. Results are stored in `.data/sentinel.db` on the
machine that runs the app, so each installation has its own history. Regression alerts appear from
the third run (two previous runs are needed as a baseline).

For an always-on local service, build once and run the compiled server:

```bash
pnpm build
pnpm start                   # same URL, no file watching
```

## Configuration

Everything lives in [`sentinel.config.ts`](./sentinel.config.ts):

| Key          | What it does                                                                                                                                                                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `site`       | Name and base URL of the monitored site.                                                                                                                                                                                                                                        |
| `pages`      | Pages to check (`id`, `label`, `path`). Optional `thresholds` override the global ones for that page.                                                                                                                                                                           |
| `strategies` | `['mobile', 'desktop']` — remove one to halve the number of PSI requests.                                                                                                                                                                                                       |
| `psi`        | `samples` (median is stored), `delayMs` between requests, Lighthouse `categories`.                                                                                                                                                                                              |
| `thresholds` | Absolute limits: minimum scores (0–100) and maximum LCP/CLS/TBT/FCP. Defaults are Lighthouse's red ("poor") boundaries. Breaches raise _threshold_ alerts. Pages that are not indexable (`noindex`, detected via the Lighthouse `is-crawlable` audit) are never alerted on SEO. |
| `regression` | Relative limits vs. the baseline (median of the previous `baselineRuns` completed runs).                                                                                                                                                                                        |

Restart the dev server after editing the file. Environment variables (`.env`):

| Variable            | Purpose                                                              |
| ------------------- | -------------------------------------------------------------------- |
| `NUXT_PSI_API_KEY`  | PageSpeed Insights API key.                                          |
| `NUXT_DB_PATH`      | SQLite file location (default `.data/sentinel.db`).                  |
| `NUXT_PSI_ENDPOINT` | Override the PSI URL — used to point at the mock during development. |

### Bootstrapping the page list from a sitemap

For a new site, let the sitemap propose the list instead of writing it by hand:

```bash
pnpm sentinel:init https://www.example.com
```

It reads `robots.txt` (`Sitemap:` lines, falling back to `/sitemap.xml`), follows sitemap indexes and keeps one representative URL per page _template_: `/blog/post-a`, `/blog/post-b`, … become a single `/blog/*` entry (numeric/UUID segments, and segments with more than 3 distinct values under the same parent, are treated as parameters; top-level sections are always kept). It writes `site` and `pages` into `sentinel.config.ts` when the page list is empty; if the file already has pages (as in a fresh clone, which contains the Toyota Community pages) it only prints the snippet, and `--force` makes it overwrite them. Review the result: delete pages behind a login or of no interest, and rename ids/labels as you like.

## How regressions are detected

1. **Noise reduction** – each page × device is measured `psi.samples` times (default 3) and the
   median of every metric is stored.
2. **Thresholds** – each stored value is compared with the absolute limits. `warn` when it is
   slightly over, `fail` when it is far over (score 10+ points below, timing 1.5× the limit).
3. **Baseline** – the median of the same page × device × metric over the previous
   `regression.baselineRuns` completed runs (at least 2 runs are required, so the first two runs
   never produce regression alerts).
4. **Regression** – a score lower than the baseline by `scoreDrop` points, or a timing higher by
   `timingIncreasePct` _and_ by more than the per-metric noise floor `minDelta`.

## Triggering a run from a release pipeline

`POST /api/runs` starts a run and answers `202` with the run id (`409` if a run is already in
progress):

```bash
curl -X POST http://localhost:3000/api/runs \
  -H 'content-type: application/json' \
  -d '{"trigger":"release","releaseTag":"v1.4.2"}'
```

Optional `pageIds: ["home", "faq"]` limits the run to some pages. The release tag is shown in the
run list and on the trend charts, which makes release-to-release comparison easy in **Compare**.

## API

| Method   | Path                     | Description                                           |
| -------- | ------------------------ | ----------------------------------------------------- |
| `GET`    | `/api/config`            | Effective configuration (+ whether an API key is set) |
| `GET`    | `/api/runs?limit=`       | Run list with alert counts                            |
| `POST`   | `/api/runs`              | Start a run                                           |
| `GET`    | `/api/runs/:id`          | Run with page results (incl. samples) and alerts      |
| `DELETE` | `/api/runs/:id`          | Delete a run and its data                             |
| `GET`    | `/api/trends?strategy=`  | Metric history per page for the trend charts          |
| `GET`    | `/api/compare?from=&to=` | Results of two runs side by side                      |
| `GET`    | `/api/alerts?limit=`     | Latest alerts                                         |

## Development without burning quota

`scripts/mock-psi.mjs` is a fake PSI endpoint that returns plausible random Lighthouse data:

```bash
node scripts/mock-psi.mjs                       # terminal 1, listens on :3999
NUXT_PSI_ENDPOINT=http://localhost:3999 pnpm dev   # terminal 2
curl -X POST localhost:3999/degrade             # make the next runs ~30% slower → regression alerts
curl -X POST localhost:3999/reset
```

Other useful commands: `pnpm lint`, `pnpm lintfix`, `pnpm typecheck`, `pnpm db:studio`
(browse the SQLite file with Drizzle Studio).

## Project layout

```
sentinel.config.ts      pages, thresholds, regression rules
shared/                 types and formatting helpers shared by server and UI
server/db/              Drizzle schema + SQL migrations (applied automatically at startup)
server/utils/psi.ts     PageSpeed Insights client and median aggregation
server/utils/regression.ts  threshold and baseline/regression rules
server/utils/runner.ts  run orchestration (one run at a time, progress, error handling)
server/api/             JSON API used by the dashboard and by CI
app/                    Nuxt dashboard: overview, run detail, trends, compare, alerts, settings
scripts/mock-psi.mjs    fake PSI endpoint for development
```

## Roadmap

- Playwright crawler: broken links, HTTP errors, JavaScript console errors, meta/Open Graph tags,
  JSON-LD validation
- Slack notifications when a run produces `fail` alerts
- GitHub Actions step that calls `POST /api/runs` after each deployment
- CrUX field data trends, screenshot diffs
