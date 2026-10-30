# Web Quality Sentinel

Monitors the quality of one or several websites over time and flags regressions. Every run asks
[Google PageSpeed Insights](https://developers.google.com/speed/docs/insights/v5/get-started)
(Lighthouse) for the performance, accessibility, best-practices and SEO scores plus the lab
timings (LCP, CLS, TBT, FCP, Speed Index, TTFB) of each configured page, on mobile and desktop.
Results are stored in a local SQLite database and shown in a dashboard with history, trends,
run-to-run comparison and alerts. Several sites can be monitored from the same dashboard (site
selector in the top bar); each site has its own page list and its own history.

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

### 3. Add your site and choose the pages to monitor

Sites live in the `sites` list of [`sentinel.config.ts`](./sentinel.config.ts); the repository
ships with two examples (Toyota Community and KINTO Mobility) that you can keep or delete. Add
yours from its sitemap (recommended):

```bash
pnpm sentinel:init https://www.your-site.com
```

or by hand (see [Configuration](#configuration)). Then open `sentinel.config.ts`, and remove the
pages that require a login or are not worth measuring: every page costs about 75 seconds per run.

### 4. Run

```bash
pnpm dev                     # http://localhost:3000
```

Pick the site in the top-bar selector and click **Run now**: it measures every page of that site
(one run at a time, whatever the site). A run of 8 pages × 2 devices × 3 samples takes roughly 10
minutes because PSI is slow and requests are spaced out to respect the quota; the overview page
refreshes itself while a run is in progress. Results are stored in `.data/sentinel.db` on the
machine that runs the app, so each installation has its own history. Regression alerts appear from
the third run of a site (two previous runs of the same site are needed as a baseline).

For an always-on local service, build once and run the compiled server:

```bash
pnpm build
pnpm start                   # same URL, no file watching
```

## Configuration

Everything lives in [`sentinel.config.ts`](./sentinel.config.ts):

| Key          | What it does                                                                                                                                                                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sites`      | Monitored websites: `id` (stored with every run — keep it stable), `name`, `baseUrl`, `pages`, optional `thresholds` overrides. The first site is selected by default in the dashboard.                                                                                         |
| `pages`      | Per site: `id` (stable key of the page's history), `label`, `path` (appended to `baseUrl`), optional per-page `thresholds`.                                                                                                                                                     |
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

### Adding a site from its sitemap

Let the sitemap propose the page list instead of writing it by hand:

```bash
pnpm sentinel:init https://www.example.com
```

It reads `robots.txt` (`Sitemap:` lines, falling back to `/sitemap.xml`), follows sitemap indexes and keeps one representative URL per page _template_: `/blog/post-a`, `/blog/post-b`, … become a single `/blog/*` entry (numeric/UUID segments, and segments with more than 3 distinct values under the same parent, are treated as parameters; top-level sections are always kept). It appends the site (id derived from the host name, e.g. `kinto-mobility`) to the `sites` list of `sentinel.config.ts`. If a site with that id already exists it only prints the snippet; `--force` replaces the existing entry (its history is kept, as it is linked to the site id). Review the result: delete pages behind a login or of no interest, and rename ids/labels as you like.

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
  -d '{"siteId":"toyota-community","trigger":"release","releaseTag":"v1.4.2"}'
```

`siteId` defaults to the first configured site. Optional `pageIds: ["home", "faq"]` limits the run to some pages. The release tag is shown in the
run list and on the trend charts, which makes release-to-release comparison easy in **Compare**.

## API

| Method   | Path                          | Description                                                       |
| -------- | ----------------------------- | ----------------------------------------------------------------- |
| `GET`    | `/api/config`                 | Effective configuration, sites and pages (+ whether a key is set) |
| `GET`    | `/api/runs?site=&limit=`      | Run list with alert counts (`site` optional: all sites if absent) |
| `POST`   | `/api/runs`                   | Start a run (`siteId`, `trigger`, `releaseTag`, `pageIds`)        |
| `GET`    | `/api/runs/:id`               | Run with page results (incl. samples) and alerts                  |
| `DELETE` | `/api/runs/:id`               | Delete a run and its data                                         |
| `GET`    | `/api/trends?site=&strategy=` | Metric history per page of one site for the trend charts          |
| `GET`    | `/api/compare?from=&to=`      | Results of two runs side by side                                  |
| `GET`    | `/api/alerts?site=&limit=`    | Latest alerts (`site` optional)                                   |

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
sentinel.config.ts      sites and their pages, thresholds, regression rules
shared/                 types and formatting helpers shared by server and UI
server/db/              Drizzle schema + SQL migrations (applied automatically at startup)
server/utils/psi.ts     PageSpeed Insights client and median aggregation
server/utils/regression.ts  threshold and baseline/regression rules
server/utils/runner.ts  run orchestration (one run at a time, progress, error handling)
server/api/             JSON API used by the dashboard and by CI
app/                    Nuxt dashboard: overview, run detail, trends, compare, alerts, settings
scripts/init-config.mjs add a site to the config from its sitemap
scripts/mock-psi.mjs    fake PSI endpoint for development
```

## Roadmap

- Playwright crawler: broken links, HTTP errors, JavaScript console errors, meta/Open Graph tags,
  JSON-LD validation
- Slack notifications when a run produces `fail` alerts
- GitHub Actions step that calls `POST /api/runs` after each deployment
- CrUX field data trends, screenshot diffs
