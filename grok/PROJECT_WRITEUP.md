# Alcohol Label Verification Prototype - Implementation Overview & Tech Stack Analysis

## Project Background & Goals

This prototype was built to address the TTB Compliance Division's need for an AI-assisted tool to help review alcohol beverage label applications (COLA). The core problem: agents spend significant time on routine verification tasks—matching brand names, ABV percentages, net contents, producer info, and the mandatory Government Health Warning against the submitted form data and the actual label artwork.

From stakeholder discovery (summarized from the original project brief / OG_README.md):
- ~150k applications/year handled by a small team of ~47 agents (down from 100+ due to budget).
- Much of the work is "pattern matching" / data entry verification that could be accelerated.
- Strict requirements from discovery:
  - **Speed**: Results in ~5 seconds or agents won't use it (prior pilot was 30-40s and rejected).
  - **Usability**: Accessible to mixed tech comfort (Dave who prints emails to Jenny fresh out of college; "my mother could figure it out" — age 73, just learned video calls).
  - **Batch support**: Importers dumping 200-300 apps at peak; currently manual one-by-one.
  - **Privacy/Security**: Prototype, but real concerns around PII, document retention, FedRAMP-like constraints in production. No crazy cloud outbound during analysis (firewalls blocked prior ML endpoints).
  - **Real-world photos**: Angles, glare, small text, busy backgrounds; agents currently reject bad photos and request better ones.
- Nuance noted by agents: exact word-for-word + formatting for the warning ("GOVERNMENT WARNING:" all caps/bold); judgment calls for minor brand variations ("STONE'S THROW" vs "Stone's Throw"); different requirements per beverage class (Malt Beverage, Wine, Distilled Spirits).

The implemented system is a fully working prototype that directly targets these needs. It is **client-side heavy for all image analysis and OCR** (privacy-friendly, low latency once warmed, works within typical government network constraints). Backend (Next API routes) is used only for persistence (submissions, assessments, batch history) and asset storage.

Core flows:
- **Client/Submitter**: Upload photos + structured form (brand, type, alcohol content/unit, net contents/unit, producer, country, warning, type-specific extras like sulfiteDeclaration/appellationOfOrigin/ageStatement/etc.). Live quality gates (blur/flash), OCR, field extraction, fuzzy matching → assessment score + per-field status. Supports single and bulk (CSV + images). Batch review/correction UI for low-scorers.
- **Gov/Agent**: Queue of submissions (sortable/filterable, simulated reviewer assignment). Side-by-side review with images + editable fields + match badges. Accept/reject with notes. Stats dashboard.

**Key technical innovations** (iteratively refined per grok/checklist.md):
- Consolidated OpenCV pass (one worker roundtrip for crop/deskew/quality/rects).
- OCR worker pool + work splitting (parallel sparse + auto whole passes + rect distribution).
- Aggressive but safe preprocessing: Otsu + polarity binarize, multi-rotation, PAD + conditional expansion, large-rect splitting for phrases like "BUD LIGHT", whole passes, highConf words.
- Fuzzy field matching generalized across **all** fields (flexible .*, Levenshtein rescue, numeric/keyword/fragment rescues, looseWordRescue) plus dedicated warning rescue.
- Memory/perf discipline: downscaling, MAX_RECTS=8, time budgets, LRU content-keyed cache (only final ParsedFields), unmount cleanup, heuristic-gated extra rects (upper, right for split layouts).
- Layout robustness: explicit full/upper/right rect injection (with busyness heuristic so right rect only on photos with left-busy/right-cleaner split — e.g., artwork left + text/ingredients right). No per-image hardcoding.
- Wine support: metric net, producer keywords (winery/cellars/vintners/produced by...), explicit extraction for appellationOfOrigin + sulfiteDeclaration.

The system is deliberately **not** a black-box "upload and trust the AI." It surfaces raw OCR snippets, per-rect confidence, quality flags, and fuzzy match details so agents can quickly verify or correct. Matches the "Dave and Jenny" usability bar and the "5 seconds" target (warm WASM + parallel workers).

## Solution Overview

The app is a Next.js full-stack prototype with two parallel experiences sharing the same analysis primitives (useLabelAssessment, useLabelAnalysisWorkers, parseFromRects, computeFieldMatches).

**Client flow** (upload → assessment → batch correction):
- Single photo wizard or bulk CSV + image upload.
- Per-photo: blur/flash gate → OpenCV analysis (rect proposals + quality metrics + downscaled buffers) → pooled OCR workers (per-rect with rotations/binarize/expand + dual whole-image passes) → parsing (spatial words, high-conf filtering, type-aware extraction for alcohol/net/producer/brand/warning + wine extras) → fuzzy multi-strategy matching against submitted inputs → score.
- Correction UI for batch: edit fields, re-analyze, accept/reject.

**Gov flow** (queue + stats):
- List of submissions with filters (by score, reviewer, status), sorting, search.
- Review modal: images + parsed/matched fields + accept/reject workflow.
- Stats: charts of submissions, scores, common issues (recharts).

**Core innovation**: A robust, offline-capable label analysis pipeline that combines OpenCV preprocessing for quality + text region proposal, pooled Tesseract workers for parallel per-region + whole-image OCR (with binarization, multi-rotation, padding/expansion, large-rect splitting, and dual PSM passes), sophisticated post-OCR parsing using word-level data, spatial joining, high-confidence filtering, and type-aware extraction, plus fuzzy field matching with multiple rescue strategies generalized across all fields.

All heavy lifting happens in-browser via WASM in dedicated workers. Caches (content-based, LRU, only final small ParsedFields) + worker reuse + downscaling keep it practical on real devices. The "guaranteed" full/upper/right rects + busyness heuristic make it tolerant of the real label photos agents actually receive.

## Tech Stack

### Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS 4
**Role**: Full-stack framework. App Router for file-based routing (client/ pages, gov/ pages, API routes). React Server Components where possible, heavy client components + hooks for the interactive analysis UI. TypeScript for safety across domain types (ParsedFields, FieldMatches, ImageAnalysis, etc.). Tailwind for rapid, consistent styling of the many domain-specific components (ChecklistGroup, ImageAnnotator, MatchBadge, SubmissionReviewLayout, etc.).

**Pros**:
- Outstanding DX and iteration speed for a time-boxed prototype (hot reload, built-in optimizations, excellent TS support).
- Natural client/server split without a separate backend service. API routes handle persistence while the heavy CV/OCR stays client-side (perfect for the privacy/offline constraints in the brief).
- First-class support for the public/ static assets needed for WASM workers and local tesseract/opencv libs.
- Easy path to Vercel deployment (aligns with the "prototype on Azure later" reality in the brief).
- App Router features (layouts, parallel routes, streaming) help with the multi-step wizards and review UIs.
- Tailwind 4 keeps the UI bundle tiny and the component library maintainable.

**Cons**:
- App Router mental model (especially "use client" boundaries, suspense, and streaming) has a learning curve.
- When doing heavy client-side WASM + workers + canvas/OffscreenCanvas work, you must be very disciplined about hydration, memory, and avoiding main-thread blocks—Next doesn't solve those for you.
- TypeScript helps a lot but worker postMessage contracts and OpenCV's loose C++-style JS bindings still require manual types and care.

**Why chosen / trade-offs vs alternatives**: Next.js was the pragmatic choice for a full working prototype with both rich interactive UI and lightweight persistence in one codebase. A pure SPA (Vite + separate API) would have added deployment complexity and latency. SvelteKit or SolidStart might have produced smaller bundles, but the Vercel ecosystem + existing patterns for Blob/Postgres made Next the fastest path to a deployable, testable artifact that satisfies the "working prototype we can access and test" deliverable. The client-heavy nature of the actual analysis (Tesseract + OpenCV) meant the framework choice was secondary to the worker/WASM architecture anyway.

### Vercel Postgres + Vercel Blob (with local-disk fallback)
**Role**: Persistence and asset storage. Postgres stores submissions, assessments (scores, fieldMatches, blurry/flash/ocrConfidence flags, type-specific extras), batch history, and simulated reviewer assignment. Blob (or /public/uploads fallback) stores the uploaded label images so they can be re-analyzed client-side by URL or during batch correction.

**Pros**:
- Zero-ops serverless fit for a prototype—exactly what the brief wanted ("standalone proof-of-concept" not a full COLA integration).
- Public image URLs make client-side re-analysis and caching trivial (content-signature cache keys).
- Direct helpers (sql, put) keep API routes tiny.
- Local fallback in storage.ts means the app works out-of-the-box without any Vercel secrets.

**Cons**:
- Vendor lock-in (migrating the schema or assets later would require work).
- Free-tier limits (row count, bandwidth, blob size) would be hit quickly in a real 150k/year workload.
- No advanced analytics or full-text search out of the box (fine for prototype; production would need something more).
- The local fallback is a development convenience but means two code paths to test and is not prod-like.

**Why chosen / alternatives**: The stakeholder notes explicitly mention Azure in real infrastructure and the desire for a low-friction prototype. Vercel Postgres + Blob is the path of least resistance inside the Next.js world and satisfies the "don't do anything crazy" security note. Supabase or PlanetScale would have been more full-featured Postgres alternatives but would have split the deployment story. Self-hosted would have added ops burden that distracts from the core OCR/matching problem. The dual-mode storage is a pragmatic acknowledgment that not everyone has a BLOB_READ_WRITE_TOKEN during local testing or CI.

### Tesseract.js (v4, with local WASM/core + eng.traineddata in public/libs)
**Role**: The OCR engine. Runs entirely in dedicated Web Workers (public/ocr-worker.js). Heavily pre-processed input (Otsu binarize + polarity correction, multi-rotation, padding/expansion, large-rect splitting into overlapping subs, dual whole-image PSM passes) is fed to it. Word-level output (text + confidence + bbox) is captured and fed to parseFromRects and the fuzzy matcher.

**Pros**:
- 100% client-side / offline / no API keys → perfect privacy story and works behind the restrictive firewalls mentioned in the stakeholder notes (the prior scanning vendor pilot failed partly because cloud ML endpoints were blocked).
- No per-recognition cost or data exfiltration.
- With the preprocessing pipeline (and the generalized fuzzy rescues), it is "good enough" on the kinds of real printed labels that agents actually see.
- Word data enables all the downstream sophistication (highConfWordText, spatial joining, fragment rescues for "Bup LUGHy", "GOVERNMENT WARNING"/"Surgeon General", wine terms, etc.).

**Cons**:
- Large initial payload (WASM + traineddata in public/libs).
- CPU- and memory-intensive. Requires aggressive mitigation: downscaling (MAX_DIM 1200 in OCR, 1600 in OpenCV), time budgets (230s worker / 270s hook), worker pooling + work splitting, LRU content-only caching (never raw images/buffers), unmount termination, and the "only parsed results" rule.
- Accuracy is highly dependent on input quality. Real photos produce fragmentation, misreads ("Bup" for "Bud", "LUGHy" for "Light"), and low-confidence output on script fonts, glare, small text, or busy backgrounds. This is why so much investment went into OpenCV preprocessing + rescue matching + the "guaranteed" full/upper/right rects + the busyness heuristic for split layouts.
- English-only for the prototype; no easy path to other languages without shipping more data.

**Why chosen / alternatives considered**: Cloud OCR services would have been faster and more accurate out of the box but directly contradict the privacy, firewall, and "no outbound for analysis" constraints from the brief (and the failed prior pilot). Server-side Tesseract or alternatives would have required a GPU backend and re-introduced latency. The combination of local Tesseract + heavy client preprocessing + fuzzy post-processing was the only approach that kept the system fully client-side while still being usable on real labels. The word-level output and the generalized rescue logic were the pragmatic answer to the accuracy limitations.

### OpenCV.js (local WASM build in public/libs)
**Role**: All image preprocessing and intelligent region proposal. Single long-lived worker (public/opencv-worker.js) performs downscaling, optional deskew (projection-profile method via canvas, since the build lacks warpAffine), label crop (border-dark detection), Laplacian blur variance, flash detection (bright compact non-border contours after threshold), adaptive threshold + 3x3 dilation, contour finding (RETR_LIST + area/fill/dedup filters), and returns candidate rects + the downscaled buffer(s). Also supplies the explicit full/upper/right rects for robustness.

**Pros**:
- Extremely powerful and fully offline (no cloud vision API).
- Enables the quality gates that stop bad photos early (blur variance < 100, flash circularity > 0.55 + area ratio > 0.0008, with the elongated filter to reject design-line false positives on synthetic/label-software images).
- Intelligent focus: feeding raw full photos to Tesseract would be far worse. Contours + dilation recover broken text; the guaranteed rects + busyness heuristic recover cases where contours miss the main content (photo-left + text-right layouts, low-contrast script, small regulatory text, etc.).
- Highly tunable (the entire grok/checklist.md history is the story of tuning area thresholds, dilation, busyness heuristic, min-area for small labels, etc.).

**Cons**:
- Large WASM binary + verbose and error-prone JS bindings (manual .delete() for every Mat to avoid leaks; easy to introduce memory issues).
- Must be extremely performance-conscious (MAX_DIM 1600, MAX_RECTS=8, single consolidated pass instead of multiple round-trips that would re-init WASM, time budgets, downscaling before anything else).
- Contour-based detection is heuristic and produces noisy/tiny rects on photos with graphics or photos on the left side of the label. This is exactly why the full/upper/right injection + busyness heuristic were added.
- The provided build is limited (no cv.warpAffine or some other advanced functions → custom OffscreenCanvas rotation for skew; no CLAHE in the final tuned version because of perf/memory cost).

**Why chosen / alternatives considered**: Pure Canvas or hand-written JS for line detection / contours would have been slower and more code for inferior results (adaptive threshold, dilation, Laplacian, contour area/fill, etc.). Cloud Vision APIs were ruled out for the same privacy/firewall reasons as cloud OCR. OpenCV.js + workers + downscaling + the "guaranteed rects" strategy was the pragmatic way to get good enough region proposals and quality signals while staying 100% client-side and within the prototype scope. The busyness heuristic for the right rect is the latest example of making the guarantees general rather than hard-coded per image.

### Custom Web Workers (opencv-worker.js + pooled ocr-worker.js in public/)
**Role**: Keep the heavy synchronous WASM work off the main UI thread. One persistent OpenCV worker (lazy-created). A small pool (normally 2) of OCR workers so per-rect work and the two whole-image passes (sparse vs auto) can run in parallel across workers. Heavy use of transferable ArrayBuffers for images. Request IDs + timeout wrappers for robustness against stale responses. Content-signature (length + cheap hash of first bytes) LRU cache only for final small ParsedFields (never raw images or buffers).

**Pros**:
- UI stays responsive during the multi-second analysis windows that are typical on real photos (critical for the "my mother could use it" and mixed-tech-comfort requirements).
- Parallelism via splitting rects across workers + giving each a different whole pass (sparse + auto) is a major wall-clock win.
- Clean isolation: long-running or crashing WASM doesn't freeze the tab.
- Reusability + caching story (lazy init once per page load, LRU parsed-results cache, unmount termination of workers + cache clear) keeps memory and repeated-analysis cost under control. The cache is the reason repeated batch-review sessions feel instant.

**Cons**:
- Message-passing and transferable semantics add complexity (buffers can be transferred only once; the pool path therefore has to slice/clone in some cases; reqId dance for stale responses).
- Debugging is harder (stack traces cross the worker boundary; logging must be explicitly forwarded via postMessage 'log' events).
- Memory discipline is mandatory and was the dominant theme of the entire development history (see grok/checklist.md). Limited caches, only ever cache tiny final objects, unmount cleanup, downscaling everywhere, MAX_RECTS, time budgets, etc. One leak and the tab OOMs or freezes (the reason analysis buffer caching was removed and OCR cache was capped at 8).
- Browser support / init time for WASM inside workers, plus the need for careful transferable handling.

**Why chosen**: Non-negotiable for a usable UX when doing heavy client CV + OCR. Running everything on the main thread would have violated the speed and usability bars from the brief. This is the standard, well-understood pattern for browser-based heavy compute. The pooling + work splitting + content-only cache were the specific engineering moves that made the perf acceptable while keeping memory safe.

### Other notable pieces
- **Recharts**: Simple React charting for the gov/stats page. Pros: zero-config, React-friendly. Cons: adds some bundle weight (acceptable for a prototype; a production stats view would likely be server-rendered or use a lighter library).
- **PDF.js (pdf.worker.min.mjs)**: Client-side PDF → canvas/image conversion for uploads that arrive as PDF. Pros: keeps the whole pipeline client-side and private. Cons: another sizable dependency (mitigated by running in its own worker).
- **@vercel/blob + local fs fallback in storage.ts + uploadImages**: Pragmatic dual-mode so the app works in CI/local without secrets and in production with Blob. The fallback writes to public/uploads with safe names.
- **Overall client-side-only analysis (no server-side CV/ML for the images themselves)**: Deliberate architectural choice that gives privacy, latency (once WASM is warm), and firewall compatibility at the cost of device variance and the need for all the preprocessing + fuzzy rescue machinery. Matches the "no outbound for analysis" constraint from the Marcus interview and the failed prior cloud-ML pilot.

## Architecture & Data Flow (High Level)

1. **Ingestion** — Client single or bulk (CSV + images) upload → images stored (Vercel Blob or local /public/uploads fallback) → public URLs + structured form data (brand, typeDesignation, alcoholContent/Unit, netContents/Unit/Secondary, producer, country, warning, type-specific extras, isImported, etc.).
2. **Per-photo Analysis** (useLabelAssessment + useLabelAnalysisWorkers):
   - OpenCV worker (one long-lived): quality (blurVariance, flash detection) + candidate rects (contours after adaptive thresh + dilation + filters) + downscaled buffer(s) + orientations (with explicit full + upper + conditional right rects when the busyness heuristic triggers).
   - OCR worker pool (2 workers): parallel per-rect (with the full preprocessing: scale, binarize, rotations, expand, split for large) + different whole-image passes (sparse + auto).
   - parseFromRects: spatial wordItems (from word bboxes), highConfWordText (MIN_WORD_CONF=50), rectsPreferredSource vs effectiveJoined (with whole prepend for brand coverage), type-aware extraction (alcohol/net regexes tolerant to junk between number and unit, producer keyword expansion for wine, brand logic with large-rect fallback, etc.).
   - computeFieldMatches: multi-strategy (user-as-regex, escaped literal, flexible per-char .*, numeric value rescue for alc/net, type keyword rescue, brand fragment rescue, general looseWordRescue at 0.5, edit-distance rescue, dedicated warningRescue) + normalization.
3. **Persistence** — API routes (ensureTable, uploadImages, sql inserts) save the submission + full assessment (assessmentScore, fieldMatches JSON, blurry/flash/warningPresent/surgeonGeneral/ocrConfidence, type extras, etc.).
4. **Review & Correction** — Client batch-review or Gov queue uses the stored parsed + matches for side-by-side image + editable fields + match status. Re-analysis is possible and benefits from the OCR result cache.
5. **Caching & Cleanup** — Content-keyed LRU for parsed results only (bufferSig on the downscaled buffers); worker termination + cache clear on unmount.

The "ChecklistLog:" console output you see in the user's logs is produced by addLog inside the hooks and workers.

## Key Decisions, Trade-offs, Challenges & How They Were Addressed

- **Client-side WASM vs. anything cloud or server-side for the actual image analysis**: Privacy, latency once warm, and "works behind government firewalls" (per the Marcus notes and the failed prior pilot) won decisively. The cost was large payloads + the entire body of optimization work documented in grok/checklist.md (workers, budgets, preprocessing, fuzzy rescues, guaranteed rects with busyness heuristic, memory discipline, cache design that only ever stores tiny final objects). This was the right trade-off for the scope.
- **Contours + heavy preprocessing vs. "just OCR the whole photo"**: Pure whole-image would be simpler but far worse quality and slower (Tesseract hates noise/glare/small text). Contours give focus and the quality gates (blur/flash), but are fragile on real photos → explicit full/upper/right rect injection + the busyness heuristic for split layouts + the whole family of rescues. The full + upper + conditional right strategy is the scalable generalization of "don't rely on contours alone."
- **Exact warning vs. fuzzy matching**: Agents and the brief stress that the warning must be exact (word-for-word, "GOVERNMENT WARNING:" all-caps/bold, etc.). We kept strong extraction heuristics (and the dedicated warningRescue) while still allowing the fuzzy layer on the submitted full text, because real OCR on real photos is imperfect. The position-based lowest-y rescue for sideways warning is another example of the "help the agent, don't replace judgment" philosophy.
- **Memory & freeze prevention**: The dominant theme of the entire development history (see the full iterative log in grok/checklist.md). Analysis buffer caching was removed because it held ArrayBuffers. OCR cache is tiny and only final ParsedFields. Unmount cleanup, downscaling everywhere, MAX_RECTS=8, time budgets, single consolidated OpenCV pass, LRU with explicit eviction, etc. One leak and the tab becomes unusable.
- **Scalability across label designs without per-image tuning**: The "guaranteed region coverage" (full + upper + heuristic right) + generalized fuzzy rescues (applied to every field) + wine-specific keyword/extraction work are attempts to make the system robust across beer cans, standard wines, split-layout wines with artwork, etc. The busyness heuristic for the right rect is the latest example — it is a general signal, not "if this exact photo."
- **Batch & review UX**: Not bolted on. The same analysis primitives power both the interactive checklist and the batch/gov review flows, so behavior stays consistent and re-analysis is cheap (thanks to the content cache).
- **Type-specific fields (Malt Beverage / Wine / Distilled Spirits)**: Handled via TYPE_FIELD_CONFIG + EXTRA_FIELD_DB_COLUMNS + explicit extraction for the wine ones (appellationOfOrigin, sulfiteDeclaration). Keeps the core simple while supporting the real regulatory differences.

**Limitations / Assumptions** (honest for a prototype):
- Depends on photo quality. Very poor photos (tiny text, heavy glare, extreme angles, script fonts on busy backgrounds) will still produce low-confidence or missing fragments. The rescues help but cannot invent text that was never captured.
- English-only Tesseract data and traineddata.
- No real authentication, audit trail, or document retention (out of scope for the prototype).
- Scale is limited by client device and the 8-rect/2-worker design. Fine for the 1–few photo interactive case and small batches; a real 200-photo importer dump would need server-side help or much more aggressive downsampling.
- The fuzzy rescues are tuned on the observed failure modes from the test set and user-provided hard photos (Bup LUGHy, mangled warning, numeric OCR errors, split layouts). New failure modes will require new rescues or better upstream capture.
- Local fallback storage is a dev/CI convenience; production would always use Blob (or equivalent).
- The "5 seconds" target is achievable once WASM is warm and on reasonable hardware. Cold start + very low-end device + worst-case photo can still be slower.

## Alignment with Original Requirements & Evaluation Criteria

- **Correctness and completeness of core requirements**: Brand, class/type, alcohol content, net contents, producer, country, Government Warning, and the type-specific extras (sulfite, appellation, age, etc.) are all handled with extraction + fuzzy matching. Quality gates (blur/flash) and OCR confidence are present. Batch upload + review is fully supported.
- **Code quality and organization**: Domain logic is cleanly separated in lib/domain (pure functions + hooks). Workers are isolated in public/. Components are organized by flow (clientStack/govStack) with a shared ui/ library. TypeScript throughout.
- **Appropriate technical choices for the scope**: Client-side WASM + workers was the only way to satisfy privacy, latency, and firewall constraints while still delivering a working prototype. The heavy investment in preprocessing + fuzzy rescues was the pragmatic answer to real OCR limitations on real labels.
- **User experience and error handling**: Simple checklist UI, clear match badges, side-by-side review, early quality gates that stop bad photos, visible "ChecklistLog" output for debugging, graceful degradation (main-thread fallback in some paths), timeouts on workers.
- **Attention to requirements**: Directly addresses the speed target (once warm), the batch need, the mixed-tech-comfort bar (simple UI + transparent results), and the real-world photo challenges mentioned by Jenny and Dave.
- **Creative problem-solving**: The entire "guaranteed rects + busyness heuristic" approach for split layouts, the generalization of the fragment rescue to all fields, the content-only cache design, the large-rect splitting + expansion for phrases like "BUD LIGHT", the word-level high-conf extraction, the dual whole-image passes, etc. All of these were invented or heavily tuned to make the system work on the kinds of labels that actually exist in the real world.

We understand this is time-constrained. A working core application with clean code and honest documentation of trade-offs is exactly what was delivered.

## How to Run, Test, and Explore

See the root README.md for the basics.

**Strongly recommended for any serious testing of the analysis pipeline**: `npm run build && npm run start`. Dev mode with HMR + the WASM workers + large canvases/OffscreenCanvases can be memory-sensitive (as repeatedly noted throughout the checklist history and user reports). Production build + start is the reliable path the user has been using successfully.

Test data lives in `data/images/` (individual label photos, including the wine_2.png and the hard "Bup LUGHy" style examples) and `tests/bulk-upload-sample.csv` (includes the wine_2 row with "ABC Winery American Red Wine", 13, 750 mL, "XYZ Cellars", "American", "Contains Sulfites", full warning, etc.).

**Key files to explore for the "how"**:
- `lib/domain/labelAnalysis.ts` — the pure parsing + matching heart (parseFromRects with all the word/spatial/highConf/wine logic, computeFieldMatches with all the rescues and the generalized looseWordRescue, TYPE_FIELD_CONFIG, etc.).
- `lib/domain/useLabelAnalysisWorkers.ts` + `useLabelAssessment.ts` — the hooks that own the workers, the content-signature LRU cache (only final ParsedFields), the parallel OCR pool, the runImageAnalysis + runOCRFromOrientations pipeline, and the end-to-end checklist state.
- `public/{opencv,ocr}-worker.js` — the actual WASM code (preprocessing, contour detection with the busyness heuristic, binarize, rotations, splitting, recognizeCanvas with config, etc.).
- `app/client/` (upload, bulk-upload, batch-review, dashboard) and `app/gov/` (queue, stats) for the two experiences.
- `app/api/submissions/` + storage.ts (the dual Blob/local upload) + db.ts for the persistence layer.
- `grok/checklist.md` for the detailed, dated, step-by-step log of every single optimization (memory safety, capture improvements for "BUD LIGHT", generalization of fuzzy matching, split-layout handling, wine support, warning rescue, etc.).

## Limitations, Open Questions & Potential Next Steps

- **Capture quality on the hardest photos** remains the dominant limiter (as seen in the repeated wine_2 logs the user has shared). Better upstream (more sophisticated OpenCV for script fonts/low-contrast text, explicit small-text or ingredients-region pass, contrast enhancement targeted at the right/upper rects when the busyness heuristic fires, or even a tiny learned proposal model) would reduce reliance on the downstream fuzzy rescues.
- **Scale**: The current design (8 rects, 2 OCR workers, client-side only) is perfectly fine for the interactive 1–few photo case and small batches. A real 200-photo importer dump (the scenario Janet from Seattle has been asking about for years) would benefit from server-side fallback/hybrid mode, more aggressive downsampling for the second-tier rects, or batching the analysis work.
- **Production concerns deliberately left out of the prototype scope**: Real auth + audit trail, document retention policies, integration hooks into the legacy COLA system, multi-language support, A/B measurement of agent time saved vs. pure manual review, monitoring of "what fraction of real labels produce usable fragments" (invaluable for prioritizing future preprocessing work), etc.
- **The fuzzy rescues are tuned on the observed failure modes**. The "Bup LUGHy", mangled warning, numeric OCR errors, "SUFLITES" spelling variations, split-layout cases, etc. drove the rescues and the 0.5 threshold. New hard photos will surface new mangling patterns; the rescues are easy to extend but do require ongoing maintenance as the test corpus grows.
- **The busyness heuristic (1.25 factor) for split layouts**: It is a general signal, not a hard-coded "if this exact photo." It can be made more sophisticated (additional signals such as vertical edge density change, configurable factor, "only add right rect if we have < 5 decent contours") if broader testing shows the need.

**Potential high-value next steps** (if this were to go beyond a take-home prototype into a real pilot):
- Server-side hybrid mode (same preprocessing + worker logic, or a thin Node wrapper around the same WASM) for very low-end devices or huge batches.
- More telemetry on which rescues are actually firing on real production-like data.
- A/B test against pure manual review during a limited real pilot (the only way to know if the "5 seconds + transparent results" UX actually moves the needle for Dave and Jenny).
- Expand the "guaranteed region coverage" strategy (maybe a bottom-right for net/sulfites on certain layouts, or make the busyness heuristic even cheaper with more signals).
- Production hardening of the UI (better empty states for "no usable text captured", clearer "why this was rescued via fuzzy" explanations in the correction flow, keyboard-driven bulk correction, etc.).

This document is a comprehensive, honest draft meant to help you organize and articulate the work in your own voice. Feel free to rewrite any section, add screenshots (the ChecklistLog output + the side-by-side review UIs with match badges are very illustrative), architecture diagrams (Mermaid is great for the worker + parsing + rescue flow), specific code walk-throughs with line references, or additional stakeholder-alignment commentary. The goal was to give you a structured, detailed starting point that covers the full tech stack with pros/cons, the major decisions and trade-offs, the challenges that were actually encountered and solved (with references to the checklist history), and how the implementation maps back to the original requirements in OG_README.md.

You now have a solid foundation. Take it, make it yours, cut what you don't need, expand the parts that excite you, and good luck with the final submission and presentation!
ENDOFFILE
Write-Output "PROJECT_WRITEUP.md populated successfully via search_replace."
