# TTB Label Verification Prototype — Codebase Writeup

This document is a full walkthrough of the codebase: what it is, how it maps
back to the original brief (`OG_README.md`), how it's organized, and—most
importantly—**how to get it running locally and deployed on Vercel from a
completely fresh account** (database, blob storage, env vars, the works).

---

## 1. What this project is

This is a prototype "AI-Powered Alcohol Label Verification App" built for the
TTB (Alcohol and Tobacco Tax and Trade Bureau) Compliance Division, per the
brief in `OG_README.md`. The brief described:

- ~150k label applications/year, reviewed manually by ~47 agents.
- Most of the work is **matching** — does the brand/ABV/net contents/producer
  on the **application form** match what's printed on the **label photo**?
- A mandatory, *exact* **Government Health Warning** check (all-caps,
  word-for-word).
- A hard **~5 second** response time requirement (a prior vendor pilot at
  30–40s was abandoned by agents).
- A UI usable by agents with widely varying tech comfort ("my mother could
  figure it out").
- **Batch upload** support for importers dumping 200–300 applications at once.
- Privacy/firewall constraints — no reliance on cloud ML APIs ("our network
  blocks outbound traffic... half their features didn't work because our
  firewall blocked connections to their ML endpoints").

### How the app answers each of those requirements

| Requirement | Where it's implemented |
| --- | --- |
| Form ↔ label matching (brand, type, ABV, net contents, producer, country, warning, type-specific extras) | `lib/domain/labelAnalysis.ts` (`computeFieldMatches`, `parseFromRects`) |
| Exact Government Warning / Surgeon General check | `GOVERNMENT_WARNING_RE`, `SURGEON_GENERAL_RE` in `labelAnalysis.ts`, plus a dedicated "warning rescue" fuzzy pass |
| ~5 second turnaround | All OCR/CV runs **client-side** in Web Workers (`public/opencv-worker.js`, `public/ocr-worker.js`) using WASM (OpenCV.js + Tesseract.js), pooled and cached — no network round trip to a cloud vision API |
| Simple, "my mother could use it" UI | Step-by-step wizard (`components/clientStack/home/UploadForm.tsx`), big buttons, checklist-style status icons (`✓`/`✖`/`–`) |
| Batch upload (200–300 at once) | `app/client/bulk-upload` (CSV + images → batch) and `app/client/batch-review` (queue processing + correction UI) |
| No cloud ML / works behind restrictive firewalls | 100% client-side analysis — OpenCV.js and Tesseract.js WASM binaries are vendored locally in `public/libs/`, no external API calls for image analysis |
| Quality gates for bad photos (blur, glare/flash) | `useLabelAssessment` + `opencv-worker.js` (`blurVariance`, flash detection) |
| Two user types: submitter ("Client") vs reviewer ("Gov") | `/client/*` and `/gov/*` route groups, each with their own layout/sidebar |

The deeper "how the OCR pipeline actually works" story (the iterative tuning
of OpenCV contours, Tesseract preprocessing, fuzzy-match rescues, etc.) is
documented at length in `grok/PROJECT_WRITEUP.md` and `grok/checklist.md` —
this document focuses on the codebase map and **running the project**.

---

## 2. Tech stack at a glance

- **Next.js 16 (App Router)** + **React 19** + **TypeScript**
- **Tailwind CSS 4** for styling (plus a fair amount of hand-written CSS in
  `app/globals.css` for the dashboard/table/modal/checklist look)
- **Vercel Postgres** (`@vercel/postgres`) — submission + assessment storage
- **Vercel Blob** (`@vercel/blob`) — label photo storage, with a **local-disk
  fallback** (`public/uploads/`) so the app runs without any Vercel secrets
- **Tesseract.js v4** — OCR, fully client-side via Web Workers + WASM
  (binaries vendored under `public/libs/`)
- **OpenCV.js** — image preprocessing / region proposal / quality checks, also
  client-side via a Web Worker (`public/libs/opencv.js`)
- **pdf.js** — converts PDF uploads to images client-side
  (`public/pdf.worker.min.mjs`)
- **Recharts** — charts on the `/gov/stats` dashboard

---

## 3. Top-level folder map

```
next-app/
├── app/                    Next.js App Router pages + API routes
│   ├── page.tsx            "/" → redirects to /auth
│   ├── auth/                Landing page: choose Client vs Government portal
│   ├── client/              Submitter-facing pages (layout + sidebar nav)
│   │   ├── dashboard/        List of your submissions, "New Form" modal
│   │   ├── upload/            (single-form upload entry point)
│   │   ├── bulk-upload/      CSV + multi-image batch upload
│   │   └── batch-review/     Per-batch processing queue + correction UI
│   ├── gov/                 Reviewer-facing pages (layout + sidebar nav)
│   │   ├── queue/             Submission queue: filter/sort/review/accept/reject
│   │   └── stats/             Charts: decisions over time, reviewer/type
│   │                           breakdowns, rejection-reason & audit stats
│   └── api/submissions/      Backend API routes (Postgres + Blob)
│       ├── route.ts           GET (list pending) / POST (create submission)
│       ├── [id]/route.ts      PATCH (update status/assessment/decision)
│       ├── all/route.ts       GET — every submission incl. history (for stats)
│       ├── batch/route.ts     POST/PATCH/GET — bulk-upload batch lifecycle
│       ├── stats/route.ts     GET — aggregate stats
│       ├── db.ts               schema (ensureTable, ensureHistoryTables, SQL)
│       └── storage.ts          uploadImages() — Blob or local-disk fallback
│
├── components/
│   ├── authStack/           Auth/landing page UI
│   ├── clientStack/
│   │   ├── home/             UploadForm (the big multi-step wizard)
│   │   └── upload/            BatchReviewQueue and bulk-upload helpers
│   ├── govStack/             Government queue/home components
│   └── ui/                   Shared design-system pieces (Button, Modal,
│                              DashboardBox, SidebarNav, SortableTh,
│                              ChecklistGroup, MatchBadge, ImageAnnotator,
│                              RejectionReviewModal, AcceptedReviewModal,
│                              CertificateBlock, FilterStat, Spinner, etc.)
│
├── lib/
│   ├── constants/            statuses.ts, units.ts (enums/lookups)
│   ├── data/                 checklistData.ts, countries.ts, usStates.json,
│   │                          employees.ts
│   ├── context/              NavLoadingContext, NewFormModalContext
│   ├── hooks/                useSubmissions.ts (client data-fetching hook)
│   └── domain/                Pure logic + the analysis pipeline:
│       ├── labelAnalysis.ts        parsing + fuzzy matching "brain"
│       ├── useLabelAssessment.ts   per-photo checklist state machine
│       ├── useLabelAnalysisWorkers.ts  worker pool + caching
│       ├── opencvLoader.ts         loads OpenCV.js in the worker
│       ├── pdfToImage.ts           PDF → image conversion
│       ├── csvParser.ts            bulk-upload CSV parsing
│       ├── bulkUploadFormatSpec.ts CSV column spec/help text
│       ├── sortSubmissions.ts, submissionFields.ts
│       └── reviewerStats.ts, auditStats.ts  (gov/stats data shaping)
│
├── public/
│   ├── libs/                 Vendored OpenCV.js + Tesseract.js WASM/core/tessdata
│   ├── opencv-worker.js      OpenCV Web Worker (preprocessing/region proposal)
│   ├── ocr-worker.js         Tesseract Web Worker (pooled OCR)
│   ├── pdf.worker.min.mjs    pdf.js worker
│   └── uploads/              Local-disk fallback for uploaded label images
│
├── data/                     Sample label images (data/images/) + checklist
│                              reference JSON for each beverage type (api/*.json)
├── tests/fixtures/           bulk-upload-sample.csv (sample batch for testing)
├── scripts/
│   ├── populate-libs.js      Copies Tesseract/OpenCV builds into public/libs
│   └── reset-submissions.mjs Wipes the submissions table + uploaded blobs
├── grok/                      Prior AI-assisted design notes / changelog
├── OG_README.md              The original take-home brief (read-only reference)
├── AGENTS.md / CLAUDE.md      Instructions for AI coding agents working in this repo
└── README.md                  Default create-next-app README
```

---

## 4. The two user-facing "stacks"

### 4.1 Client (submitter) — `/client/*`

- **`/client/dashboard`** — table of your submissions (status, score,
  submitted date), with column filters and sorting. "New Form" in the sidebar
  opens the upload wizard as a **modal overlay** on top of whatever client
  page you're on (via `lib/context/NewFormModalContext.tsx`).
- **`UploadForm`** (`components/clientStack/home/UploadForm.tsx`) — the core
  3-step wizard:
  1. **Label info** — organized into three labeled sub-sections: "General
     Information" (brand, class/type designation, ABV, net contents),
     "Bottler / Producer" (name, city, state — state via `SearchableSelect`
     over `lib/data/usStates.json`), plus country (if imported) and a
     "`{type}` Specific Information" section with type-specific fields (age
     statement, sulfite declaration, appellation of origin, etc. — driven by
     `TYPE_FIELD_CONFIG` in `labelAnalysis.ts`).
  2. **Photo(s)** — drag/drop or file picker (images or PDFs, converted via
     `pdfToImage.ts`), with live image annotation.
  3. **Checklist / assessment** — runs the OpenCV + OCR pipeline, shows a
     live checklist (blur/flash, each field matched/not matched, warning
     present, OCR confidence, overall score), then Save/Submit.
- **`/client/bulk-upload`** — upload a CSV (see
  `lib/domain/bulkUploadFormatSpec.ts` for the expected columns, and
  `tests/fixtures/bulk-upload-sample.csv` for an example) plus the
  corresponding label images; creates a batch of "Queued" submissions.
- **`/client/batch-review`** — pick a batch, click "Start Processing" to run
  the analysis pipeline row-by-row (claims rows so multiple tabs can
  cooperate), then "Review All" to correct any rows that scored below the
  passing threshold before they're submitted to the Gov queue.

### 4.2 Government (reviewer) — `/gov/*`

- **`/gov/queue`** — sortable/filterable table of all pending submissions
  (by ID, brand, score, status, submitted date), each assigned to a simulated
  reviewer (`lib/data/employees.ts`). Clicking a row opens a side-by-side
  review: label photo(s) + submitted fields + match badges
  (`MatchBadge`/`ChecklistGroup`), with **Accept**/**Reject** actions
  (rejection requires checklist reasons + optional comment —
  `RejectionReviewModal`). Decisions move the row into
  `approved_submissions` / `rejected_submissions` history tables and generate
  a certificate number (`CertificateBlock`, `AcceptedReviewModal`).
- **`/gov/stats`** — Recharts dashboards: decisions over time, accept-rate
  trend, reviewer breakdown, product-type breakdown, plus an "Audit" section
  (rejection reasons, automated pre-assessment checklist stats, label
  field-match rates, regex-derived rejection-comment themes/keywords) — all
  filterable by reviewer / product type / date range
  (`lib/domain/reviewerStats.ts`, `lib/domain/auditStats.ts`).

### 4.3 Shared UI/infrastructure

- `lib/context/NavLoadingContext.tsx` — disables the sidebar nav while the
  active page is loading/processing, to avoid mid-fetch navigation bugs.
- `lib/context/NewFormModalContext.tsx` — hosts the "New Form" upload modal at
  the client layout level so it can be opened from any `/client/*` page.
- `components/ui/SidebarNav.tsx` — the persistent left-hand navigation for
  both stacks.

---

## 5. Backend / data model

All persistence is via `@vercel/postgres` (`app/api/submissions/db.ts`):

- **`submissions`** — the active queue. One row per label application:
  brand, type designation, alcohol content/unit, net contents/unit/secondary,
  producer, producer_city, producer_state, country, warning, type-specific
  extra fields, `image_url` / `image_urls` (JSONB), `status`, `submitted_at`,
  `assigned_to` (simulated reviewer), `batch_id` / `batch_claimed_at`
  (bulk-upload tracking).
- **`assessments`** — 1:1 with `submissions`, holds the automated analysis
  results: `blurry`, `flash`, `warning_present`, `surgeon_general`,
  `ocr_confidence`, `assessment_score`, `field_matches` (JSONB), `ocr_raw`.
- **`approved_submissions`** / **`rejected_submissions`** — history tables. A
  decided submission is copied here (with `decided_by`, `decided_at`,
  `certificate_number`, `rejection_reasons`, `rejection_comment`) and removed
  from `submissions`.
- **`ALL_SUBMISSIONS_QUERY`** — a `UNION ALL` across all three tables, used by
  `/api/submissions/all` for the dashboard and stats pages.

`ensureTable()` / `ensureHistoryTables()` run `CREATE TABLE IF NOT EXISTS` +
`ALTER TABLE ... ADD COLUMN IF NOT EXISTS` on every relevant request, so **no
manual migration step is required** — the schema self-heals on first use.

### Image storage

`app/api/submissions/storage.ts` → `uploadImages()`:
- If `BLOB_READ_WRITE_TOKEN` is set, uploads to **Vercel Blob** under
  `images/<id>-<filename>` (public access).
- Otherwise (or if the Blob call fails), falls back to writing into
  `public/uploads/` and returning a local `/uploads/...` URL.

This means **the app runs fully locally with zero Vercel configuration** —
Blob is optional, Postgres is the only hard requirement (and even that could
theoretically be swapped, though `@vercel/postgres` is used directly).

---

## 6. Running the project locally

### 6.1 Prerequisites

- Node.js 20+ (matches `@types/node": "^20"`)
- npm (the repo has a `package-lock.json`)
- A Postgres database reachable from your machine (Vercel Postgres/Neon is
  the path of least resistance — see §7 — but any Postgres works since the
  code just uses `@vercel/postgres`'s `sql` helper against `POSTGRES_URL` /
  `DATABASE_URL`)

### 6.2 Install dependencies

```bash
npm install
```

### 6.3 Vendor the OCR/CV WASM assets into `public/libs/`

The OCR/CV pipeline needs Tesseract.js's worker/core/wasm/tessdata files and
an OpenCV.js build sitting in `public/libs/`. Most of these are **already
checked into this repo** (`public/libs/*.js`, `tessdata/`), but if you ever
need to (re)populate them from `node_modules` after an `npm install`:

```bash
node scripts/populate-libs.js
```

This best-effort script copies Tesseract's `tesseract.min.js`,
`tesseract-core*.wasm.js`/`worker.min.js`, `tessdata/eng.traineddata`, and an
`opencv.js` build from `node_modules` into `public/libs/`. If OpenCV isn't
found in `node_modules` (it isn't an npm dependency in `package.json`), make
sure `public/libs/opencv.js` already exists (it does in this repo) — the
script will warn but the existing file is sufficient.

### 6.4 Configure environment variables

Create `.env.local` in `next-app/` (this file is git-ignored). At minimum you
need a Postgres connection string:

```bash
# Required — any Postgres connection string works with @vercel/postgres
POSTGRES_URL="postgres://user:password@host:5432/dbname?sslmode=require"

# Optional — enables Vercel Blob for image storage.
# If omitted, uploaded images are written to public/uploads/ instead.
BLOB_READ_WRITE_TOKEN="vercel_blob_rw_..."
```

> If you provision storage through the Vercel dashboard/CLI (recommended —
> see §7), `vercel env pull .env.local` will generate this file for you with
> all of `POSTGRES_URL`, `POSTGRES_URL_NON_POOLING`, `DATABASE_URL`,
> `BLOB_READ_WRITE_TOKEN`, etc. already filled in.

### 6.5 Run it

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — it redirects to `/auth`,
where you choose **Client Login** or **Government Login** (no real auth in
this prototype — these are just two portals into the same data).

> **Note on dev vs. production build**: per `grok/PROJECT_WRITEUP.md`, the
> WASM-heavy OCR/CV workers are memory-sensitive under Next's dev server
> (HMR + large canvases/OffscreenCanvases). For serious testing of the
> upload → analysis → submit flow, prefer:
> ```bash
> npm run build
> npm run start
> ```

### 6.6 Other useful scripts

```bash
npm run lint                 # ESLint
node scripts/reset-submissions.mjs   # wipe the submissions table + their Blob images
                                       # (reads .env.local; destructive — use with care)
```

### 6.7 Test/sample data

- `data/images/` — sample label photos (beer, wine, distilled spirits,
  including some intentionally "hard" photos used to tune the OCR pipeline).
- `tests/fixtures/bulk-upload-sample.csv` — a sample CSV for `/client/bulk-upload`
  matching the column spec in `lib/domain/bulkUploadFormatSpec.ts`.
- `api/*_checklist_information.json` — TTB mandatory-label-element reference
  data per beverage type, used to populate the "info" (`i`) tooltips in the
  upload form (`lib/data/checklistData.ts`).

---

## 7. Automated test suite & CI

The app has an automated test suite built on **Vitest**, with 83 tests across
13 files. Run it with:

```bash
npm test          # run once (CI mode)
npm run test:watch  # watch mode for local development
```

Config lives in `vitest.config.ts`; shared setup (jest-dom matchers +
React Testing Library auto-cleanup) is in `tests/setup.ts`.

### 7.1 Test layout

- **`tests/unit/`** — pure-logic tests for everything in `lib/domain/`
  (CSV parsing/validation, OCR field-match scoring, submission field
  formatting/sorting, reviewer/audit stats, the bulk-upload CSV template) and
  for the pure helpers in `app/api/submissions/db.ts` (ID generation,
  reviewer assignment, certificate number formatting). These run in a plain
  Node environment — no DOM, no network.
- **`tests/components/`** — React component tests using
  `@testing-library/react` in a jsdom environment (opt in per-file via the
  `// @vitest-environment jsdom` directive). Covers `SearchableSelect`,
  `MatchBadge`, `SortableTh`, and `FilterStat` — rendering, click/keyboard
  interactions, and conditional styling/visibility.
- **`tests/api/`** — tests for the Next.js API route handlers (e.g.
  `app/api/submissions/[id]/route.ts`'s `PATCH` handler) with `@vercel/postgres`
  mocked via `vi.mock`. The mock covers both ways the code calls `sql`
  (as a tagged template and via `sql.query(text, params)`), so the tests
  assert on real generated SQL/params without touching a database — e.g.
  verifying the approve/reject flow inserts into `approved_submissions`/
  `rejected_submissions` with `producer_city`/`producer_state` intact, and
  that batch resubmission only applies `CORRECTABLE_FIELDS`-allowlisted
  corrections.

### 7.2 CI: GitHub Actions

`.github/workflows/test.yml` runs `npx tsc --noEmit` and `npm test` on every
push and pull request via GitHub Actions (Ubuntu, Node 20). This is the
recommended way to gate merges — it requires no secrets or database access
since all DB/storage calls are mocked in tests.

`npm run lint` is intentionally **not** part of CI: this codebase ships with
a large number of pre-existing ESLint warnings/errors unrelated to any
specific change, so wiring it into CI would make every run fail regardless of
new code. New files added by this test suite are lint-clean.

### 7.3 Vercel pipeline

Vercel's deploy pipeline runs `next build`, not `npm test` — it does not gate
deploys on a test suite by default. Two ways to incorporate these tests into
the Vercel flow if desired:

- **Build-time gate**: change the Vercel project's "Build Command" (Project
  Settings → Build & Development Settings) to `npm test && npm run build` (or
  `npm run test && next build`). A failing test suite then fails the build and
  blocks the deploy — for both Production and Preview deployments.
- **Rely on GitHub Actions + branch protection** (recommended): keep Vercel's
  build command as-is, and require the GitHub Actions "Test" check to pass
  before a PR can be merged (Settings → Branches → branch protection rules →
  required status checks). Vercel still builds/deploys preview URLs for every
  PR for manual QA, while CI independently guards `main`/`master`.

---

## 8. Deploying to Vercel (from a brand-new account)

This walks through everything needed to get a **fresh Vercel account** to a
working deployment with Postgres + Blob storage, matching the
`POSTGRES_URL` / `BLOB_READ_WRITE_TOKEN` env vars the app expects.

### Step 1 — Create a Vercel account & install the CLI

1. Go to [vercel.com](https://vercel.com) and sign up (GitHub login is the
   easiest — it also makes Step 2 a one-click "Import Git Repository").
2. Install the Vercel CLI and log in:
   ```bash
   npm install -g vercel
   vercel login
   ```

### Step 2 — Create the project

From inside `next-app/`:

```bash
vercel
```

- Answer the prompts: link to a new project, accept the detected framework
  (Next.js), accept default build/output settings.
- This creates `.vercel/project.json` (already present in this checkout —
  re-running `vercel link` will let you point it at your own project/org).

Alternatively, use the dashboard: **Add New → Project → Import** your Git
repo, select the `next-app` directory as the root if your repo has it nested.

### Step 3 — Create a Postgres database

1. In the Vercel dashboard, open your project → **Storage** tab.
2. Click **Create Database** → choose **Postgres** (this provisions a Neon
   Postgres database under the hood — hence the `NEON_*` / `PG*` /
   `POSTGRES_*` variables you'll see).
3. Give it a name and create it. Vercel will offer to **connect it to your
   project** — accept this; it automatically injects the `POSTGRES_URL`,
   `POSTGRES_URL_NON_POOLING`, `POSTGRES_PRISMA_URL`, `DATABASE_URL`,
   `PGHOST`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, etc. environment variables
   into your project for all environments (Production/Preview/Development).

No manual SQL setup is needed — `ensureTable()` / `ensureHistoryTables()` in
`app/api/submissions/db.ts` create all tables/columns/indexes on first API
request.

### Step 4 — Create a Blob store

1. Still in **Storage**, click **Create Database** (or **Create Store**) again
   → choose **Blob**.
2. Name it (e.g. `label-images`) and create it.
3. Connect it to your project the same way — this injects
   `BLOB_READ_WRITE_TOKEN` (and `BLOB_STORE_ID`,
   `BLOB_WEBHOOK_PUBLIC_KEY`) into your project's environment variables.

If you skip this step, the app still works — `uploadImages()` in
`app/api/submissions/storage.ts` falls back to writing into
`public/uploads/`, but **uploads to a serverless deployment's filesystem are
ephemeral**, so Blob is strongly recommended for any real deployment.

### Step 5 — Pull env vars for local development (optional)

```bash
vercel env pull .env.local
```

This writes out everything provisioned in Steps 3–4 (`POSTGRES_URL`,
`BLOB_READ_WRITE_TOKEN`, etc.) into `next-app/.env.local` so `npm run dev`
locally talks to the same cloud Postgres/Blob as your deployment. (This repo's
`.env.local` was generated exactly this way — see the `.vercel/` directory.)

### Step 6 — Deploy

```bash
vercel deploy --prod
```

or simply push to the Git branch connected to the Vercel project (Vercel will
auto-build and deploy on push, with the env vars from Steps 3–4 already wired
up).

### Step 7 — Verify

1. Visit the deployment URL → should redirect to `/auth`.
2. Choose **Client Login** → `/client/dashboard` → "New Form" → fill out the
   wizard, upload a label photo (try one from `data/images/`), let the
   checklist run, and submit.
3. Choose **Government Login** → `/gov/queue` → the new submission should
   appear (assigned to a simulated reviewer) → open it, review the
   side-by-side match results, Accept or Reject.
4. Check `/gov/stats` for the charts to populate once a few submissions have
   been decided.

If something looks wrong on first load, it's almost always one of:
- **Postgres not connected** → `ensureTable()` will throw; double-check the
  `POSTGRES_URL` (or `DATABASE_URL`) env var is present for the environment
  you're testing (Production vs Preview vs Development each have their own
  env var sets in Vercel).
- **Blob not connected** → uploads silently fall back to `/uploads/...`
  (works, but won't persist across redeploys on Vercel's ephemeral
  filesystem).

---

## 9. Where to go next

- For the **deep technical story** of the OCR/CV pipeline (why OpenCV +
  Tesseract, the worker pooling/caching design, the fuzzy-matching rescue
  strategies, and all the trade-offs), read `grok/PROJECT_WRITEUP.md` and the
  dated iteration log in `grok/checklist.md`.
- For the **original brief** this prototype answers, see `OG_README.md`.
- For **AI-agent-specific conventions** (this is a non-standard/pre-release
  Next.js build — read the docs before assuming familiar APIs), see
  `AGENTS.md` / `CLAUDE.md`.
