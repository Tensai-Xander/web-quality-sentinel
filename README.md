# Web Quality Sentinel

Monitors the quality of one or several websites over time and flags regressions. Every run asks
[Google PageSpeed Insights](https://developers.google.com/speed/docs/insights/v5/get-started)
(Lighthouse) for the performance, accessibility, best-practices and SEO scores plus the lab
timings (LCP, CLS, TBT, FCP, Speed Index, TTFB) of each configured page, on mobile and desktop.
Results are stored in a local SQLite database and shown in a dashboard with history, trends,
run-to-run comparison and alerts. Each alert lists the Lighthouse issues that affect its metric,
and each issue opens Lighthouse's explanation and per-URL breakdown (the same table PSI shows).
The same PSI answer also carries Google's real-user data (Chrome UX Report) for the exact URL, shown
per page as "Real users" (LCP / INP / CLS / FCP / TTFB with Google's rating, or "No data").
Every run also visits each page in a headless browser (Playwright), on a mobile and a desktop viewport, to catch what PSI does not
report: HTTP errors, JavaScript console errors, failed requests, broken same-site links, missing or
oversized meta tags (title, description, canonical, Open Graph, `lang`, `h1`), invalid JSON-LD and
accessibility violations (axe-core, with the affected elements). Several sites can be monitored from the same dashboard (site
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
  key. Without a key the anonymous quota is tiny and shared, so requests are often rejected with
  `429`.

  **PSI API quota** (Google's defaults, free, per Cloud project — visible under _APIs & Services →
  PageSpeed Insights API → Quotas_): **25 000 requests per day** and **400 requests per 100
  seconds**. One run costs `pages × devices × psi.samples` requests (e.g. 8 pages × 2 devices × 3
  samples = 48, plus retries), so the daily quota allows roughly 500 such runs; the per-100 s
  limit is never reached because requests are sequential and spaced by `psi.delayMs`. When the
  daily quota is exhausted the run stops with `PSI 429: Quota exceeded…` and the counter resets
  at midnight Pacific time. A higher quota can be requested in the same console page.

### 2. Install

```bash
git clone https://github.com/Tensai-Xander/web-quality-sentinel.git
cd web-quality-sentinel
pnpm install
pnpm exec playwright install chromium   # headless browser for the quality checks (~130 MB, once)
cp .env.example .env         # then put your key in NUXT_PSI_API_KEY=
```

### 3. Add your site and choose the pages to monitor

Sites and their pages live in [`sentinel.sites.json`](./sentinel.sites.json); the repository ships
with two examples (Toyota Community and KINTO Mobility) that you can keep or remove. Easiest is the
dashboard: start it (step 4), open **Settings**, "Add a site" with its URL — the app reads the
site's sitemap and proposes one page per kind of page; tick the ones to monitor. Pages and sites
can be added, edited and removed there at any time; changes apply to the next run. The same import
exists as a command:

```bash
pnpm sentinel:init https://www.your-site.com
```

Leave out pages that require a login or are not worth measuring: every page costs about 75 seconds
per run.

### 4. Run

```bash
pnpm dev                     # http://localhost:3000
```

Pick the site in the top-bar selector and click **Run now**: it measures every page of that site
(one run at a time, whatever the site). To measure a single page again — typically after a
`fetch failed` row — use the **re-run page** link on its row of the run page (also offered next
to the error): it starts a new run containing only that page, both devices, and opens it. A run of 8 pages × 2 devices × 3 samples takes roughly 10
minutes because PSI is slow and requests are spaced out to respect the quota; the overview page
refreshes itself while a run is in progress. Results are stored in `.data/sentinel.db` on the
machine that runs the app, so each installation has its own history. Regression alerts appear from
the third run of a site (two previous runs of the same site are needed as a baseline).

For an always-on local service, build once and run the compiled server:

```bash
pnpm build
pnpm start                   # same URL, no file watching
```

### 5. Reset the database

All history (runs, results, alerts) is the single SQLite file `.data/sentinel.db`. To start from
scratch, stop `pnpm dev`, delete it together with its journal files, and start again: an empty
database with the current schema is recreated on the next start. Sites and pages are not affected
(they live in `sentinel.sites.json`).

```bash
rm -f .data/sentinel.db .data/sentinel.db-wal .data/sentinel.db-shm
pnpm dev
```

To drop a single run instead, use **Delete** on its run page (or `DELETE /api/runs/:id`).

## Configuration

Sites and pages are in [`sentinel.sites.json`](./sentinel.sites.json) (written by the Settings
page and by `pnpm sentinel:init`; it is plain JSON, so it can also be edited by hand and shared
through git). The global rules live in [`sentinel.config.ts`](./sentinel.config.ts):

| Key          | What it does                                                                                                                                                                                                                                                                                                                                              |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sites`      | _(in `sentinel.sites.json`)_ `id` (stored with every run — keep it stable), `name`, `baseUrl`, `pages`, optional `thresholds` overrides. The first site is selected by default in the dashboard.                                                                                                                                                          |
| `pages`      | _(per site, in `sentinel.sites.json`)_ `id` (stable key of the page's history), `label`, `path` (appended to `baseUrl`), optional per-page `thresholds`. Editable in Settings.                                                                                                                                                                            |
| `strategies` | `['mobile', 'desktop']` — remove one to halve the number of PSI requests.                                                                                                                                                                                                                                                                                 |
| `psi`        | `samples` (median is stored), `delayMs` between requests, Lighthouse `categories`, `retries` / `retryDelayMs` for samples that fail on the network.                                                                                                                                                                                                       |
| `thresholds` | Absolute limits, two lines per metric `{ warn, fail }` for the scores (0–100, alert when below) and LCP/CLS/TBT/FCP (alert when above). Defaults are Google's colour-band boundaries (see below). Breaches raise _threshold_ alerts. Pages that are not indexable (`noindex`, detected via the Lighthouse `is-crawlable` audit) are never alerted on SEO. |
| `regression` | Relative limits vs. the baseline (median of the previous `baselineRuns` completed runs).                                                                                                                                                                                                                                                                  |

### Where the default thresholds come from

Each metric has two lines, matching the colours Google uses: the `warn` line is the green → orange
("good" → "needs improvement") boundary and the `fail` line the orange → red ("poor") boundary.
So a `warn` alert means "Google shows this metric in orange", a `fail` alert "in red", and the
alerts always agree with the colours of the badges in the dashboard.

| Metric                              | Google: good (green) | Needs improvement (orange) | Poor (red) | Default `warn` / `fail` | Source                                                                                                         |
| ----------------------------------- | -------------------- | -------------------------- | ---------- | ----------------------- | -------------------------------------------------------------------------------------------------------------- |
| Performance, Accessibility, BP, SEO | 90–100               | 50–89                      | 0–49       | < 90 / < 50             | [Lighthouse performance scoring](https://developer.chrome.com/docs/lighthouse/performance/performance-scoring) |
| LCP (Core Web Vital)                | ≤ 2.5 s              | 2.5–4 s                    | > 4 s      | > 2.5 s / > 4 s         | [web.dev/lcp](https://web.dev/articles/lcp)                                                                    |
| CLS (Core Web Vital)                | ≤ 0.1                | 0.1–0.25                   | > 0.25     | > 0.1 / > 0.25          | [web.dev/cls](https://web.dev/articles/cls)                                                                    |
| TBT (lab proxy for INP)             | ≤ 200 ms             | 200–600 ms                 | > 600 ms   | > 200 ms / > 600 ms     | [web.dev/tbt](https://web.dev/articles/tbt)                                                                    |
| FCP                                 | ≤ 1.8 s              | 1.8–3 s                    | > 3 s      | > 1.8 s / > 3 s         | [web.dev/fcp](https://web.dev/articles/fcp)                                                                    |

LCP and CLS are Core Web Vitals: Google states these lines officially, assessed on real users at
the 75th percentile, the same for mobile and desktop — the "Real users" section shows those field
values. TBT and FCP are lab-only metrics; their lines are the ones Lighthouse uses to colour them
(mobile). The thresholds are applied to the lab (Lighthouse) values of each run. Lighthouse
colours desktop runs with stricter internal bands (e.g. LCP 1.2 s / 2.4 s); the tool keeps the
single official set above for both devices, as PSI's own report does. Change the lines in
`sentinel.config.ts`, or per site / page in Settings (Edit → two inputs per metric, empty =
default). A site or page override may set only one of the two lines, e.g.
`"thresholds": { "performance": { "warn": 70 } }`.

Restart the dev server after editing `sentinel.config.ts` (`sentinel.sites.json` is re-read automatically). Environment variables (`.env`):

| Variable            | Purpose                                                              |
| ------------------- | -------------------------------------------------------------------- |
| `NUXT_PSI_API_KEY`  | PageSpeed Insights API key.                                          |
| `NUXT_DB_PATH`      | SQLite file location (default `.data/sentinel.db`).                  |
| `NUXT_PSI_ENDPOINT` | Override the PSI URL — used to point at the mock during development. |

### Adding a site from its sitemap

Settings → "Add a site" does this in the dashboard. From the command line:

```bash
pnpm sentinel:init https://www.example.com
```

It reads `robots.txt` (`Sitemap:` lines, falling back to `/sitemap.xml`), follows sitemap indexes and keeps one representative URL per page _template_: `/blog/post-a`, `/blog/post-b`, … become a single `/blog/*` entry (numeric/UUID segments, and segments with more than 3 distinct values under the same parent, are treated as parameters; top-level sections are always kept). It appends the site (id derived from the host name, e.g. `kinto-mobility`) to `sentinel.sites.json`. If a site with that id already exists it only prints the snippet; `--force` replaces the existing entry (its history is kept, as it is linked to the site id). Review the result: delete pages behind a login or of no interest, and rename ids/labels as you like.

## Quality checks (browser)

After the PSI samples of a page, the runner opens it in headless Chromium once per device (mobile viewport + mobile user agent, then desktop; links are checked on the first visit only) (`crawl` block of
`sentinel.config.ts`: `enabled`, `maxLinks`, `timeoutMs`) and records:

- the HTTP status of the page and every request that failed or returned ≥ 400,
- JavaScript errors (`pageerror` and `console.error`),
- the status of up to `maxLinks` distinct same-site links found on the page (HEAD, then GET),
- meta tags: title / description presence and length, canonical, `<html lang>`, Open Graph
  title/description/image, number of `<h1>`,
- JSON-LD blocks: valid JSON, `@type` and `@context` present, detected types,
- accessibility: an [axe-core](https://github.com/dequelabs/axe-core) audit of the rendered page
  (WCAG 2.x A/AA rules + axe best practices). Each failed rule is stored with its impact
  (critical / serious / moderate / minor), WCAG tags, help link, number of affected elements and
  up to 20 affected elements (visible text, HTML snippet, CSS selector, axe's reason) with an
  "Open in page" link that highlights the element's text on the live page. Lighthouse's accessibility _score_ comes from PSI; this
  audit gives the list of concrete problems behind it, on the real mobile and desktop rendering.

Each finding raises a _quality_ alert (`fail` for HTTP errors, broken links and critical/serious
accessibility violations, `warn` otherwise). Click a quality alert's message — in the Overview,
the run page or the Alerts page — to expand the matching detail in place (broken URLs and their
status, error messages, meta tag values, JSON-LD issues, failed axe rules with the affected
elements); the run page's "Quality checks" table shows the full detail of every page and device. `pnpm install` downloads
Playwright; the browser itself is fetched on first install with `pnpm exec playwright install chromium`
(see Install).

## Real users (CrUX field data)

Lab scores come from one simulated load on Google's servers. The PSI answer also contains the
**Chrome UX Report** for the exact URL: how real Chrome visitors experienced the page over the last
28 days (75th percentile of LCP, INP, CLS, FCP and TTFB, each rated good / needs improvement /
poor with Google's fixed limits). The run page shows it per page and device under "Real users".
Only the "This URL" data is used — when a page has too few Chrome visitors PSI falls back to
origin-wide data, which is ignored and shown as "No data" (small or internal sites usually have
none). Field data moves slowly (28-day window) and never raises alerts; it answers "are real
users OK?", while the lab metrics answer "did the last release change something?".

## How regressions are detected

1. **Noise reduction** – each page × device is measured `psi.samples` times (default 3) and the
   median of every metric is stored. PSI returns a cached copy when the same URL is requested
   again within a few minutes, so only the first sample uses the exact URL (it provides the
   "This URL" field data); the following ones add a throw-away `?sentinel=<id>` query parameter,
   which makes Google run a fresh Lighthouse analysis of the same page. The run page's "Samples"
   table shows the analysis time of each sample. A sample whose request never reached Google
   (`fetch failed (ENOTFOUND …)`, `ECONNRESET`, timeout — i.e. a network problem between your
   machine and `www.googleapis.com`, not a problem with the monitored site) or got a 5xx answer
   is retried `psi.retries` times after `psi.retryDelayMs`; quota (`429`) and key (`400`/`403`)
   errors are never retried and stop the run. A page × device whose samples all failed is stored
   with the last error message and no metrics.
2. **Thresholds** – each stored value is compared with the two absolute lines of its metric
   (`thresholds`, or the site/page override). Crossing a line raises a _threshold_ alert.
3. **Baseline** – the median of the same page × device × metric over the previous
   `regression.baselineRuns` completed runs (at least 2 runs are required, so the first two runs
   never produce regression alerts).
4. **Regression** – a score lower than the baseline by `scoreDrop` points, or a timing higher by
   `timingIncreasePct` _and_ by more than the per-metric noise floor `minDelta`, raises a
   _regression_ alert.

### Alert severity (`warn` / `fail`)

| Alert                              | `warn`                                 | `fail`                                     |
| ---------------------------------- | -------------------------------------- | ------------------------------------------ |
| Threshold, score (perf, a11y, …)   | below the `warn` line (default 90)     | below the `fail` line (default 50)         |
| Threshold, timing (LCP, CLS, TBT…) | above the `warn` line (e.g. LCP 2.5 s) | above the `fail` line (e.g. LCP 4 s)       |
| Regression, score                  | drop ≥ `scoreDrop` (10 pts)            | drop ≥ 2 × `scoreDrop` (20 pts)            |
| Regression, timing                 | increase ≥ `timingIncreasePct` (50 %)  | increase ≥ 2 × `timingIncreasePct` (100 %) |

Example with the default performance lines 90 / 50: a score of 72 (orange) is a `warn`, 38 (red)
is a `fail`, 93 (green) raises nothing. Quality alerts (browser checks) have their own rule: HTTP
errors, broken links and critical/serious axe violations are `fail`, everything else is `warn`.

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

| Method   | Path                           | Description                                                       |
| -------- | ------------------------------ | ----------------------------------------------------------------- |
| `GET`    | `/api/config`                  | Effective configuration, sites and pages (+ whether a key is set) |
| `GET`    | `/api/runs?site=&limit=`       | Run list with alert counts (`site` optional: all sites if absent) |
| `POST`   | `/api/runs`                    | Start a run (`siteId`, `trigger`, `releaseTag`, `pageIds`)        |
| `GET`    | `/api/runs/:id`                | Run with page results (incl. samples) and alerts                  |
| `DELETE` | `/api/runs/:id`                | Delete a run and its data                                         |
| `GET`    | `/api/trends?site=&strategy=`  | Metric history per page of one site for the trend charts          |
| `GET`    | `/api/compare?from=&to=`       | Results of two runs side by side                                  |
| `GET`    | `/api/alerts?site=&limit=`     | Latest alerts (`site` optional)                                   |
| `POST`   | `/api/sites`                   | Add a site (`baseUrl`, optional `name`, `id`, `pages`)            |
| `PATCH`  | `/api/sites/:id`               | Edit a site's `name`, `baseUrl`, `thresholds`                     |
| `DELETE` | `/api/sites/:id?deleteRuns=`   | Remove a site (history kept unless `deleteRuns=1`)                |
| `POST`   | `/api/sites/:id/pages`         | Add a page `{ path, label?, id?, thresholds? }` or `{ pages }`    |
| `PATCH`  | `/api/sites/:id/pages/:pageId` | Edit a page's `label`, `path`, `thresholds`                       |
| `DELETE` | `/api/sites/:id/pages/:pageId` | Remove a page (`deleteRuns=1` also deletes its results)           |
| `POST`   | `/api/sitemap`                 | Propose pages from a site's sitemap (`{ url }`)                   |

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
sentinel.sites.json     sites and their pages (edited from Settings / sentinel:init)
sentinel.config.ts      thresholds, regression rules, PSI options
shared/                 types and formatting helpers shared by server and UI
server/db/              Drizzle schema + SQL migrations (applied automatically at startup)
server/utils/psi.ts     PageSpeed Insights client, CrUX field data, median aggregation
server/utils/regression.ts  threshold and baseline/regression rules
server/utils/runner.ts  run orchestration (one run at a time, progress, error handling)
server/utils/crawler.ts Playwright visit: HTTP/JS errors, broken links, meta tags, JSON-LD, axe-core
server/api/             JSON API used by the dashboard and by CI
app/                    Nuxt dashboard: overview, run detail, trends, compare, alerts, settings
scripts/init-config.mjs add a site from its sitemap (CLI twin of Settings → Add a site)
scripts/lib/sitemap.mjs sitemap discovery and page-template grouping (shared with the server)
scripts/mock-psi.mjs    fake PSI endpoint for development
```

## Roadmap

- Slack notifications when a run produces `fail` alerts
- GitHub Actions step that calls `POST /api/runs` after each deployment
- Screenshot diffs between runs, field data trends
