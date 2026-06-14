# Treasury Take Home Assessment

## Setup

### Prerequisites

- Node.js 20+ (matches `@types/node": "^20"`)
- npm (the repo has a `package-lock.json`)
- A Postgres database reachable from your machine I used Vercel Postgres/Neon
  but any Postgres works since the code just uses `@vercel/postgres`'s `sql` helper against `POSTGRES_URL` / `DATABASE_URL`
- An IDE, I'm using [VSCODE](https://code.visualstudio.com/)
- Also a Vercel app was made, published and hosted: [click here](https://treasury-take-home-drab.vercel.app/)

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

- Open a Terminal, Command Prompt, etc. and run the following command

```bash
npm run build
npm run start
```

- Open any browser of your choosing and click this link [http://localhost:3000](http://localhost:3000)
- This will take you to the main `/auth` page which has a mimicked government forced watch modal
  indicating semi-typical wording.
- For Label Creation, choose **Client Login** where you will be able to generate labels via a form or bulk upload/batch process, view accepted/rejected/queued labels.
- For viewing the mimicked government side of things choose **Government Login** (no real auth in this prototype) can see the queue of an employee, the stats with misc. items.

### Test/sample data

- `data/images/` — sample label photos (beer, wine, distilled spirits, including some intentionally "hard" photos used to tune the OCR pipeline).
- `tests/fixtures/bulk-upload-sample.csv` — a sample CSV for `/client/bulk-upload` matching the column spec in `lib/domain/bulkUploadFormatSpec.ts`.
- `api/*_checklist_information.json` — TTB mandatory-label-element reference data per beverage type, used to populate the "info" (`i`) tooltips in the upload form (`lib/data/checklistData.ts`).

---

## Documentation

### Approach

For this assessment, I read the interviews a couple times over of the employees and extracted core values which they had wanted.

- **Deputy Director Sarah Chen**:
  * Speed/latency requirement: Results must come back in ~5 seconds.
  * Volume: ~150,000 applications/year, 47 agents, ~5-10 min per simple label.
  * Routine "matching" work: Most review is just verifying label data matches the application (brand, ABV, warning presence).
  * Accessibility/simplicity: UI must work for low-tech-comfort users ("my mother could figure it out").
  * Batch upload support: Need to handle bulk uploads.

- **IT Systems Administrator Marcus Williams**:
  * Standalone prototype: Proof-of-Concept only.
  * Security/PII: Light touch for prototype, but be mindful of document retention/PII norms for "what would be needed" in prod.
  * Network/firewall constraints: Outbound traffic to external domains often 