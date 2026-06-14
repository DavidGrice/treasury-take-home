# Treasury Take Home Assessment

**Deployed app:** [treasury-take-home-drab.vercel.app](https://treasury-take-home-drab.vercel.app/)

## Demo

[![Demo video](https://img.youtube.com/vi/R1XpoP1KDFA/hqdefault.jpg)](https://youtu.be/R1XpoP1KDFA)

## Setup

### Prerequisites

- Node.js 20+ (matches `@types/node": "^20"`)
- npm (the repo has a `package-lock.json`)
- A Postgres database reachable from your machine — any Postgres works, since the code just uses `@vercel/postgres`'s `sql` helper against `POSTGRES_URL` / `DATABASE_URL` (I used Vercel Postgres/Neon)
- An IDE — I used [VS Code](https://code.visualstudio.com/)

### Clone Repository via CLI (or download)
```bash
git clone https://github.com/DavidGrice/treasury-take-home.git
```

### Install dependencies

```bash
npm install
```

### Configure environment variables

Create `.env.local` in `next-app/` (this file is git-ignored). At minimum you
need a Postgres connection string:

```bash
# Required — any Postgres connection string works with @vercel/postgres
POSTGRES_URL="postgres://user:password@host:5432/dbname?sslmode=require"

# Optional — enables Vercel Blob for image storage.
# If omitted, uploaded images are written to public/uploads/ instead.
BLOB_READ_WRITE_TOKEN="vercel_blob_rw_..."
```

> If you provision storage through the Vercel dashboard/CLI
> `vercel env pull .env.local` will generate this file for you with
> all of `POSTGRES_URL`, `POSTGRES_URL_NON_POOLING`, `DATABASE_URL`,
> `BLOB_READ_WRITE_TOKEN`, etc. already filled in.

### Run it

```bash
npm run build
npm run start
```

- Open [http://localhost:3000](http://localhost:3000) in a browser.
- This lands on `/auth`, a mimicked government "forced watch" modal with typical wording.
- **Client Login** — create labels via a form or bulk upload/batch process, and view accepted/rejected/queued submissions.
- **Government Login** (no real auth in this prototype) — view an employee's review queue and stats.

### Test/sample data

- `data/images/` — sample label photos (beer, wine, distilled spirits, including some intentionally "hard" photos used to tune the OCR pipeline).
- `tests/fixtures/bulk-upload-sample.csv` — a sample CSV for `/client/bulk-upload` matching the column spec in `lib/domain/bulkUploadFormatSpec.ts`.
- `api/*_checklist_information.json` — TTB mandatory-label-element reference data per beverage type, used to populate the "info" (`i`) tooltips in the upload form (`lib/data/checklistData.ts`).

---

## Documentation

### Approach

I read through the stakeholder interviews and pulled out the core values each person wanted:

- **Deputy Director Sarah Chen** — Results in ~5 seconds (latency); ~150,000 applications/year across 47 agents, ~5-10 min/label today; most review is routine "matching" (brand, ABV, warning presence vs. application); UI must work for low-tech-comfort users ("my mother could figure it out"); needs batch upload support.
- **IT Systems Administrator Marcus Williams** — Standalone proof-of-concept, not integrated with production; light security/PII touch for the prototype but keep prod retention/PII norms in mind; outbound traffic to external domains is often blocked.
- **Senior Compliance Agent David Morrison** — Exact-match logic is too rigid; needs judgment/nuance; skeptical of "modernization" — the tool must reduce workload, not add friction.
- **Junior Compliance Agent Jenny Park** — Warning statement must be exact (all caps, bold "GOVERNMENT WARNING:"); case/formatting deviations are valid rejections; would be valuable if the tool could still extract data from imperfect images.

Given the time constraint, these requirements pointed toward a fairly specific toolset (see below). My working assumption was that this tool needs to be versatile and easy to use — able to quickly generate and bulk-upload photos and labels. The interviewees were mostly dealing with rejections, but a lot of that checking can happen client-side first. So the workflow is: client submits → passes/fails an assessment checklist → only submissions needing review go to the government queue.

### Tools Used

- **Languages**: TypeScript / JavaScript, SQL
- **OCR**: Tesseract.js + OpenCV Wasm (for label region detection)
- **Parsing/validation**: Regular expressions
- **Frontend**: React / Next.js
- **Database**: Postgres via `@vercel/postgres`
- **Deployment**: Vercel
- **LLM assistance**: Copilot (initial project setup), Claude (GUI), Grok (tuning the OCR/ML backend)

### Assumptions & Trade-offs

- The prototype runs entirely in-browser with locally hosted OCR/text parsing, since it can't rely on external CDNs/APIs (per Marcus's firewall constraints).
- Client-side validation handles the "easy" checks (the routine matching Sarah described), so the government queue mainly sees submissions that need human judgment.
- Light security/PII handling only — adequate for a demo, not for production.
- Ideally this would run as a proper pipeline — labels/images offloaded to a server with agents pulling from a queue into a processing/analysis stage — but that's out of scope for this prototype.