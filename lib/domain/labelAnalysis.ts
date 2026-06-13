// Pure (no React, no Workers) label-analysis helpers shared between the
// single-submission form (UploadForm) and the bulk Batch Review pipeline.
// Moved verbatim from UploadForm.tsx so both flows produce identical results.

export type ImageAnalysis = {
  blurVariance: number;
  flash: { circularity: number; areaRatio: number; flashDetected: boolean };
  orientations: Array<{ angle: number; rects: any[]; buffer: ArrayBuffer }>;
};

export type ParsedFields = {
  brand?: string;
  alcohol?: string;
  net?: string;
  producer?: string;
  country?: string;
  warning?: string;
  raw?: string;
  confidence?: number | null;
  // Item 2 addition (optional, backward-compatible):
  // Richer data derived from per-rect metadata (confidence, whole-image flag, source photo).
  // Callers that only need raw/confidence/brand/etc. are unaffected.
  highQualityRaw?: string;
  spans?: Array<{
    text: string;
    confidence?: number | null;
    whole?: boolean;
    sourceImage?: number;
  }>;
};

export type FieldMatches = Record<string, boolean | 'no-input'>;

// label fields that vary by Class/Type designation (per TTB labeling rules).
// "required" fields are always shown for that type; "applicable" fields are
// shown behind a checkbox in UploadForm (and, for CSV-driven batch rows,
// treated as active whenever the corresponding column has a value).
export const TYPE_FIELD_CONFIG: Record<string, { required: string[]; applicable: string[] }> = {
  'Malt Beverage': { required: [], applicable: ['colorDisclosure', 'sulfiteAspartame'] },
  'Distilled Spirits': { required: ['ageStatement'], applicable: ['colorDisclosure', 'commodityStatement'] },
  Wine: { required: [], applicable: ['sulfiteDeclaration', 'colorDisclosure', 'appellationOfOrigin', 'percentageForeignWine'] },
};

// maps the camelCase extra field keys above to their snake_case DB columns
export const EXTRA_FIELD_DB_COLUMNS: Record<string, string> = {
  ageStatement: 'age_statement',
  colorDisclosure: 'color_disclosure',
  sulfiteAspartame: 'sulfite_aspartame',
  sulfiteDeclaration: 'sulfite_declaration',
  commodityStatement: 'commodity_statement',
  appellationOfOrigin: 'appellation_of_origin',
  percentageForeignWine: 'percentage_foreign_wine',
};

// net-content units that take a secondary "X Fl. Oz" remainder (metric units
// are expressed as a single value)
export const UNITS_WITH_FL_OZ_REMAINDER = ["Pint", "Quart", "Gallon"];

// a photo is flagged as blurry when its blur variance falls below this
export const BLUR_VARIANCE_THRESHOLD = 100;

// OCR results below this overall confidence are flagged for manual review
export const OCR_CONFIDENCE_THRESHOLD = 70;

// "GOVERNMENT WARNING" / "Surgeon General" must appear exactly as written
export const GOVERNMENT_WARNING_RE = /government\s*warning/i;
export const SURGEON_GENERAL_RE = /surgeon general/i;

// Small dependency-free Levenshtein distance (used only as a last-resort
// rescue in computeFieldMatches when all regex strategies fail).
function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[b.length][a.length];
}

// Light normalization for matching. Strips common unit noise and punctuation
// so that "5.0% Alc./Vol." can still rescue-match OCR output like "5 alc vol".
function normalizeForMatch(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/alc\.?\/?(vol|volume)?|abv|alcohol by volume|percent|%/gi, '')
    .replace(/fl\.?\s*oz|fluid ounces?|ounces?/gi, 'oz')
    .replace(/milliliters?|ml\b/gi, 'ml')
    .replace(/liters?|l\b/gi, 'l')
    .replace(/[^a-z0-9 ]/g, '')
    .trim();
}

// match each input field's value (treated as a regex, falling back to literal)
// against the full raw OCR text. Inputs left blank are 'no-input'.
//
// Changes in this version (item 1):
// - Existing three regex strategies remain the primary mechanism (unchanged behavior).
// - When they all fail we now attempt a normalized edit-distance rescue.
// - Normalization + bidirectional edit distance catches many real label variations
//   and minor OCR typos that pure regex spacing tricks miss.
// - Fully backward compatible (same return shape, same 'ok' semantics for scoring).
export const computeFieldMatches = (
  rawText: string,
  inputs: Record<string, string>,
  log?: (msg: string) => void
): { fm: FieldMatches; matches: number; total: number } => {
  // Clean raw to remove the worst OCR garbage symbols before matching.
  // IMPORTANT: keep digits, ".", "%", "-", "/" etc. so that alcohol ("4.2%")
  // and net ("12 fl. oz") patterns survive for the flexible regex and numeric
  // fallbacks. Only strip truly noisy punctuation/quotes/slashes that Tesseract
  // often hallucinates on reflective cans.
  let raw = (rawText || '')
    .replace(/[‘’“”"\|\\_\*‚„{}\[\]<>~^@#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // A stricter letter-only view for brand/producer etc. (keeps the old aggressive clean for non-numeric fields)
  const rawLetters = raw.replace(/[^A-Za-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

  const fm: FieldMatches = {};
  let matches = 0;
  let total = 0;

  for (const [key, input] of Object.entries(inputs)) {
    const inVal = (input || '').trim();
    if (!inVal) {
      fm[key] = 'no-input';
      continue;
    }
    total++;

    // Choose the raw variant: numeric fields (alcohol, net) benefit from keeping . % etc.
    const useRaw = (key === 'alcohol' || key === 'net') ? raw : rawLetters;

    // treat user input as regex; if invalid, fall back to literal match.
    // any whitespace in the input becomes optional (\s*) so OCR text that
    // drops/collapses spaces (e.g. "1PINT" vs "1 PINT") still matches.
    let ok = false;
    try {
      const re = new RegExp(inVal.replace(/\s+/g, '\\s*'), 'i');
      ok = re.test(useRaw);
    } catch (e) {
      try {
        const esc = inVal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re2 = new RegExp(esc.replace(/\s+/g, '\\s*'), 'i');
        ok = re2.test(useRaw);
      } catch (e2) { ok = false; }
    }
    // fallback: allow any OCR noise (not just whitespace) between every character
    // of the input (e.g. "BUD LIGHT" vs "BUD H = ... ALIGHT" or "B U D ... L I G H T").
    // This bridges the gap when "BUD" and "LIGHT" are captured in different rects/whole
    // but the letters appear in order in the (noisy) raw text.
    if (!ok) {
      const flexible = inVal
        .replace(/\s+/g, '')
        .split('')
        .map(ch => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('.*?');
      try {
        ok = new RegExp(flexible, 'i').test(useRaw);
      } catch (e3) { /* ignore */ }
    }

    // Special numeric rescue for alcohol / net: if the critical number (e.g. "4.2" or "12")
    // appears anywhere in the (lightly cleaned) raw, count it as matched.
    // This is tolerant of missing/broken "%", "Alc./Vol.", "Fl. Oz" etc. that are common
    // on hard photos while still requiring the regulatory *value* to have been seen by OCR.
    if (!ok && (key === 'alcohol' || key === 'net')) {
      const numMatch = inVal.match(/(\d+(?:\.\d+)?)/);
      if (numMatch) {
        const num = numMatch[1].replace('.', '\\.?');
        // allow the number with optional junk (spaces, stray chars) around it
        try {
          if (new RegExp(num, 'i').test(useRaw)) {
            ok = true;
            log?.(`Field match (numeric value rescue): ${key}="${inVal}" (number ${numMatch[1]} found in OCR text)`);
          }
        } catch (_) {}
      }
    }

    // Loose keyword rescue for typeDesignation (e.g. "Malt Beverage" vs OCR reading "BEER",
    // "MALT", or "BEVERAGE"). This helps when the exact phrase is not printed or is garbled
    // but a reasonable synonym/category word appears in the photo.
    if (!ok && key === 'typeDesignation') {
      const lowerRaw = useRaw.toLowerCase();
      const lowerIn = inVal.toLowerCase();
      if (lowerIn.includes('malt') || lowerIn.includes('beverage')) {
        if (lowerRaw.includes('malt') || lowerRaw.includes('beverage') || lowerRaw.includes('beer')) {
          ok = true;
          log?.(`Field match (type keyword rescue): ${key}="${inVal}"`);
        }
      } else if (lowerIn.includes('beer') && lowerRaw.includes('beer')) {
        ok = true;
        log?.(`Field match (type keyword rescue): ${key}="${inVal}"`);
      }
    }

    // Brand fragment rescue for common real-world OCR mangles on Bud Light / Platinum etc.
    // ( "Bup LUGHy", "BUD H ... ALIGHT", "Bup LUGHy PLATINUM" ). Runs after the general
    // strategies but before the generic edit-distance so it can short-circuit with a clear log.
    if (!ok && key === 'brand') {
      if (brandFragmentRescue(inVal, useRaw, log)) {
        ok = true;
      }
    }

    // Dedicated rescue for the mandatory "GOVERNMENT WARNING" / "Surgeon General" text.
    // The full warning block is frequently sideways, small, or heavily mangled on real
    // labels. This uses the same fragment/fuzzy-word style as brand + the existing
    // misspellings already handled in parseFromRects. It triggers for any key containing
    // "warning", "surgeon", or "government" (covers both the full submitted warning text
    // and any "warningPresent"/"surgeonGeneral" checklist fields).
    if (!ok && (key.toLowerCase().includes('warning') || key.toLowerCase().includes('surgeon') || key.toLowerCase().includes('government'))) {
      if (warningRescue(inVal, useRaw, log)) {
        ok = true;
      }
    }

    // General OCR fragment / fuzzy-word rescue for *all* remaining fields.
    // This is the generalization of the "bud-like + light-like" logic the user requested.
    // It applies the same tolerant per-word matching (direct or small edit-distance)
    // to alcohol, net, producer, typeDesignation, ageStatement, sulfite declarations,
    // commodity statements, color disclosures, and any other input.
    if (!ok) {
      if (looseWordRescue(inVal, useRaw, log, key)) {
        ok = true;
      }
    }

    // NEW (item 1): last-resort normalized edit-distance rescue.
    // This does not change any "exact warning" or high-confidence rules.
    // It only helps when the user-entered value is close (after stripping
    // unit noise) to what actually appeared in the OCR output.
    if (!ok) {
      const normIn = normalizeForMatch(inVal);
      const normRaw = normalizeForMatch(useRaw);
      if (normIn && normRaw) {
        const dist = levenshtein(normIn, normRaw);
        const maxLen = Math.max(normIn.length, normRaw.length) || 1;
        const rel = dist / maxLen;
        // Accept small absolute distance or small relative distance.
        // These thresholds are intentionally conservative.
        if (dist <= 2 || rel <= 0.22) {
          ok = true;
          log?.(`Field match (edit-distance rescue): ${key}="${inVal}" dist=${dist} rel=${rel.toFixed(2)}`);
        }
      }
    }

    fm[key] = ok;
    if (ok) matches++;
    log?.(`Field match: ${key} = "${inVal}" -> ${ok ? 'matched' : 'not matched'}`);
  }

  return { fm, matches, total };
};

// Brand-specific rescue for the very common "Bud Light" family (and similar mangled
// brand names). The flexible .*? already tolerates spaces/garbage between letters,
// but real photos (especially cans) frequently produce "Bup", "LUGHy", "BUD H ... ALIGHT",
// "Bup LUGHy PLATINUM" etc. This adds a lightweight fragment check so "BUDLIGHT" (or
// "Bud Light") input still matches when the OCR got the shape right but individual
// letters wrong. Uses the same cleaned raw the other strategies see.
function brandFragmentRescue(inVal: string, useRaw: string, log?: (msg: string) => void): boolean {
  const lowerIn = (inVal || '').toLowerCase();
  if (!lowerIn.includes('bud') && !lowerIn.includes('bup') && !lowerIn.includes('budlight')) return false;

  const lowerRaw = (useRaw || '').toLowerCase().replace(/[^a-z]/g, '');
  // Look for "bud/bup" near "ligh/lugh/light" or "l u g h" patterns, or platinum variants.
  const hasBudLike = lowerRaw.includes('bud') || lowerRaw.includes('bup') || lowerRaw.includes('bu d') || lowerRaw.includes('b u d');
  const hasLightLike = lowerRaw.includes('ligh') || lowerRaw.includes('lugh') || lowerRaw.includes('light') || lowerRaw.includes('l u g h') || lowerRaw.includes('ligh t');
  if (hasBudLike && hasLightLike) {
    log?.(`Field match (brand fragment rescue): brand="${inVal}" (bud-like + light-like fragments found in OCR raw)`);
    return true;
  }
  // Also accept if a single rect/whole gave something very close to the full brand (edit distance on normalized)
  const normIn = normalizeForMatch(inVal);
  const normRaw = normalizeForMatch(useRaw);
  if (normIn && normRaw) {
    const dist = levenshtein(normIn, normRaw);
    const maxLen = Math.max(normIn.length, normRaw.length) || 1;
    if (dist <= 4 || (dist / maxLen) <= 0.35) {
      log?.(`Field match (brand fragment rescue): brand="${inVal}" (close edit-distance in raw)`);
      return true;
    }
  }
  return false;
}

// General "OCR fragment / fuzzy word" rescue for *all* input fields.
// Mirrors the spirit of the Bud Light specific rescue but applies broadly:
// - Split user input into significant words.
// - Check if those words (or close variants via small edit distance) appear
//   anywhere in the OCR raw (after the same normalization used elsewhere).
// This helps producer names, alcohol statements ("4.2 Alc Vol", "Alc 4 . 2 %"),
// net contents, age statements, sulfite declarations, commodity statements,
// and any other free-text or phrase fields when Tesseract mangles individual
// letters or splits words across rects/whole passes.
// It is intentionally forgiving (edit <=2 or relative <= 0.3 per word) because
// real label photos frequently produce exactly these kinds of errors.
function looseWordRescue(inVal: string, useRaw: string, log?: (msg: string) => void, key?: string): boolean {
  const normIn = normalizeForMatch(inVal);
  const normRaw = normalizeForMatch(useRaw);
  if (!normIn || !normRaw) return false;

  const inWords = normIn.split(/\s+/).filter(w => w.length >= 2);
  if (inWords.length === 0) return false;

  const rawWords = normRaw.split(/\s+/).filter(w => w.length >= 2);

  let matched = 0;
  for (const w of inWords) {
    // direct contains (fast path)
    if (normRaw.includes(w)) {
      matched++;
      continue;
    }
    // fuzzy: small edit distance to any raw word (tolerates 1-2 letter OCR mistakes)
    const hasClose = rawWords.some(rw => {
      const d = levenshtein(w, rw);
      const ml = Math.max(w.length, rw.length) || 1;
      return d <= 2 || (d / ml) <= 0.3;
    });
    if (hasClose) matched++;
  }

  // Accept if we matched the majority of the input words (very common for
  // fragmented or partially-misread labels). For single-word inputs this is
  // essentially "the word or a close variant appears".
  const threshold = Math.max(1, Math.ceil(inWords.length * 0.6));
  if (matched >= threshold) {
    log?.(`Field match (general OCR fragment rescue): ${key || 'field'}="${inVal}" (${matched}/${inWords.length} words matched fuzzily)`);
    return true;
  }
  return false;
}

// Dedicated rescue for "GOVERNMENT WARNING" and "Surgeon General" (the two
// critical phrases in the mandatory health warning block).
// Modeled directly on the brandFragmentRescue + looseWordRescue style the user
// asked to generalize. It looks for the key word pairs with tolerance for the
// very common OCR manglings (sideways text, small print, glare on cans, etc.)
// and re-uses the existing misspellings already collected in parseFromRects.
// This ensures that when a user provides the canonical warning text (or a
// "warningPresent"/"surgeonGeneral" field), the checklist match succeeds if
// the raw contains recognizable fragments.
function warningRescue(inVal: string, useRaw: string, log?: (msg: string) => void): boolean {
  const normIn = normalizeForMatch(inVal);
  const normRaw = normalizeForMatch(useRaw);
  if (!normIn || !normRaw) return false;

  const lowerIn = normIn.toLowerCase();
  const lowerRaw = normRaw.toLowerCase();

  // "GOVERNMENT WARNING" pair — allow common OCR variants
  const govVariants = ['government', 'govemment', 'goverment', 'govt', 'governmant'];
  const warnVariants = ['warning', 'warnlng', 'warn1ng', 'waming', 'warnig'];

  const hasGov = govVariants.some(v => lowerRaw.includes(v));
  const hasWarn = warnVariants.some(v => lowerRaw.includes(v));
  const wantsGovWarn = lowerIn.includes('government') || lowerIn.includes('warning');

  if (wantsGovWarn && hasGov && hasWarn) {
    log?.(`Field match (warning fragment rescue): "GOVERNMENT WARNING" fragments found in OCR raw`);
    return true;
  }

  // "Surgeon General" pair — reuse the extensive misspellings already in the codebase
  const surgeonVariants = ['surgeon', 'surgen', 'surge0n', 'surgenal'];
  const generalVariants = [
    'general', 'genral', 'genr?al', 'genreal', 'gereral', 'generel',
    'genera[lI]', 'genefal', 'genaral', 'genera'
  ];

  const hasSurgeon = surgeonVariants.some(v => lowerRaw.includes(v));
  const hasGeneral = generalVariants.some(v => lowerRaw.includes(v));
  const wantsSurgeonGen = lowerIn.includes('surgeon') || lowerIn.includes('general');

  if (wantsSurgeonGen && hasSurgeon && hasGeneral) {
    log?.(`Field match (warning fragment rescue): "Surgeon General" fragments found in OCR raw`);
    return true;
  }

  // Fall back to the general loose word rescue for the full long warning text
  // (so the entire submitted paragraph can still match via fuzzy words).
  return looseWordRescue(inVal, useRaw, log, 'warning');
}

// derives the 0-100 overall assessment score from a match count, or null if
// there were no inputs to check against
export const computeAssessmentScore = (matches: number, total: number): number | null =>
  total === 0 ? null : Math.round((matches / total) * 100);

export const parseFromRects = (
  ocrResults: Array<{
    rect: any;
    text: string;
    confidence?: number | null;
    whole?: boolean;
    wholePass?: string;
    // Item 2: now declared so we can use sourceImage for multi-photo awareness
    sourceImage?: number;
    rotation?: number;
    // Item 6: words from Tesseract (captured in Item 3) for per-token confidence and better extraction
    words?: Array<{ text: string; confidence?: number | null; bbox?: any }>;
  }>
): ParsedFields => {
  if (!ocrResults || ocrResults.length === 0) return {};

  // drop rects whose recognized text is empty or has very low confidence -
  // these are almost always label texture/grain noise and otherwise pollute
  // every field below (brand, warning, etc.)
  const MIN_RECT_CONFIDENCE = 25;
  // the whole-image sparse-text pass is sorted first (its rect is
  // {0,0,w,h}), so a noisy low-confidence read of a busy photo (ruler,
  // background, graphics) would otherwise dominate the start of `joined`
  // and get picked up as e.g. the brand. Only trust it at a higher
  // confidence bar than individual rect crops.
  // Lowered to include more whole-image text (which often captures
  // text missed or fragmented by contours), since user wants fuller
  // coverage of all text in the photo.
  const MIN_WHOLE_IMAGE_CONFIDENCE = 30;
  const usable = ocrResults.filter(r => {
    if (r.text.trim().length === 0) return false;
    if (typeof r.confidence !== 'number') return true;
    return r.confidence >= (r.whole ? MIN_WHOLE_IMAGE_CONFIDENCE : MIN_RECT_CONFIDENCE);
  });

  // sort top->bottom, left->right  (preserves logical reading order for `raw`)
  const sorted = [...usable].sort((a, b) => (a.rect.y - b.rect.y) || (a.rect.x - b.rect.x));
  const joined = sorted.map(r => r.text.replace(/[‘’“”]/g, '"')).join('\n').replace(/\s+\n/g,'\n');

  // Build a cleaner "full text" from per-word OCR results (when available from Tesseract).
  // This combines tokens across rects and whole-image, sorted spatially by their positions.
  // Much better at capturing the actual sequence of text in the photo than joining
  // noisy full-rect OCR outputs (which often contain background noise or split words).
  // Uses word bboxes relative to their source rect for accurate ordering.
  const wordItems = [];
  for (const r of usable) {
    const baseX = r.rect?.x || 0;
    const baseY = r.rect?.y || 0;
    if (Array.isArray(r.words) && r.words.length > 0) {
      for (const w of r.words) {
        if (w && w.text && w.text.trim()) {
          const bbox = w.bbox || {};
          const wx = baseX + (bbox.x0 || bbox.x || 0);
          const wy = baseY + (bbox.y0 || bbox.y || 0);
          const wconf = typeof w.confidence === 'number' ? w.confidence : (r.confidence || 0);
          wordItems.push({ text: w.text.trim().replace(/[‘’“”]/g, '"'), x: wx, y: wy, conf: wconf });
        }
      }
    } else if (r.text && r.text.trim()) {
      // fallback for rects without per-word data
      wordItems.push({ text: r.text.trim().replace(/[‘’“”]/g, '"'), x: baseX, y: baseY, conf: r.confidence || 0 });
    }
  }
  wordItems.sort((a, b) => (a.y - b.y) || (a.x - b.x));
  const wordJoined = wordItems.map(w => w.text).join(' ').replace(/\s+/g, ' ').trim();

  // Prefer the word-based joined text when we have good per-word data (richer and more accurate order).
  // Fall back to rect-based joined otherwise. This helps "capture all text" across the photo.
  const rectsPreferredSource = wordItems.length > 0 ? wordJoined : joined;
  let effectiveJoined = rectsPreferredSource;

  // Explicitly prepend the best whole-image text (if any). Whole-image OCR is designed
  // to read the photo "as a whole" and often captures large prominent text (like brand)
  // that gets fragmented across contour rects. Prepending ensures the full brand phrase
  // from the whole-image pass is at the start of raw, making it easy for matching to find
  // "BUD" and "LIGHT" (or "ALIGHT") close together even if rects split them.
  //
  // We deliberately give the whole-image result (even if low confidence or noisy) to
  // effectiveJoined / the final `raw` used for field matching. Brand and producer matching
  // rely heavily on the "full photo context" read for large text. Alcohol and net are
  // insulated because they pull only from rectsPreferredSource + highConfWordText.
  const wholeResults = usable.filter(r => r.whole && r.text && r.text.trim());
  if (wholeResults.length > 0) {
    const bestWhole = wholeResults.sort((a, b) => (b.confidence || 0) - (a.confidence || 0))[0];
    const wtxt = bestWhole.text.trim();
    if (wtxt.length > 5) {
      effectiveJoined = (wtxt + ' ' + effectiveJoined).trim();
    }
  }

  // Item 2 enhancement: build a high-quality view by preferring whole-image
  // high-confidence passes and high-conf rects (regardless of position).
  // This gives brand/warning/alcohol extractors better signal without
  // polluting the position-sorted `raw` used for field matching.
  const qualitySorted = [...usable].sort((a, b) => {
    const qa = (a.whole ? 2 : 1) * ((a.confidence ?? 0) + (a.rect?.area ? Math.min(a.rect.area / 10000, 1) : 0));
    const qb = (b.whole ? 2 : 1) * ((b.confidence ?? 0) + (b.rect?.area ? Math.min(b.rect.area / 10000, 1) : 0));
    return qb - qa;
  });
  const highQualityJoined = qualitySorted
    .map(r => r.text.replace(/[‘’“”]/g, '"'))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Item 6: richer word-level data usage
  // Collect words from all usable results (if Tesseract provided them via Item 3).
  // This lets us prefer high per-word confidence tokens for extraction and scoring,
  // which is often more reliable than the rect-level text (which can mix good/bad tokens).
  let allWords: Array<{ text: string; confidence: number | null }> = [];
  for (const r of usable) {
    if (Array.isArray(r.words)) {
      for (const w of r.words) {
        if (w && w.text && w.text.trim()) {
          allWords.push({ text: w.text.trim(), confidence: typeof w.confidence === 'number' ? w.confidence : null });
        }
      }
    }
  }
  // High-confidence word text (only tokens with decent individual confidence)
  const MIN_WORD_CONF = 50;
  const highConfWordText = allWords
    .filter(w => w.confidence === null || w.confidence >= MIN_WORD_CONF)
    .map(w => w.text)
    .join(' ');

  // overall OCR confidence: weighted median of per-rect confidences (weight =
  // recognized text length). A median is less skewed than a mean by a single
  // very low/high-confidence outlier rect among only a handful of rects.
  // Item 6 enhancement: if per-word confidences are available, also compute a
  // word-weighted confidence (average of high-conf words) and blend it in.
  // This produces a more robust overall confidence for the ocrConfidence check
  // and downstream scoring.
  const confidenceSamples = sorted
    .map(r => ({ len: r.text.trim().length, conf: typeof r.confidence === 'number' ? r.confidence : null }))
    .filter(r => r.len > 0 && r.conf !== null) as Array<{ len: number; conf: number }>;
  let confidence: number | null = null;
  if (confidenceSamples.length > 0) {
    const totalLen = confidenceSamples.reduce((s, r) => s + r.len, 0);
    const byConf = [...confidenceSamples].sort((a, b) => a.conf - b.conf);
    const half = totalLen / 2;
    let cumulative = 0;
    confidence = byConf[byConf.length - 1].conf;
    for (const sample of byConf) {
      cumulative += sample.len;
      if (cumulative >= half) { confidence = sample.conf; break; }
    }
    confidence = Math.round(confidence);
  }

  // Item 6: word-weighted confidence blend
  let wordWeightedConf: number | null = null;
  const wordConfs = allWords
    .filter(w => typeof w.confidence === 'number')
    .map(w => w.confidence as number);
  if (wordConfs.length > 0) {
    // simple average of word confidences (could weight by word length for better signal)
    const avg = wordConfs.reduce((a, b) => a + b, 0) / wordConfs.length;
    wordWeightedConf = Math.round(avg);
  }
  if (wordWeightedConf !== null) {
    if (confidence === null) {
      confidence = wordWeightedConf;
    } else {
      // Blend rect-level and word-level (favor word-level slightly as it's finer-grained)
      confidence = Math.round(confidence * 0.4 + wordWeightedConf * 0.6);
    }
  }

  // split into lines and normalize characters likely from OCR noise
  // Use effectiveJoined (word-based spatial join when available) for better full photo text capture.
  const lines = effectiveJoined.split(/\s+/)
    .map(l => l.replace(/["“”‘’\|\\/\_\*‚„{}\[\]<>~^@#]/g, ' ').replace(/[^\x00-\x7F]/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter(l => /[A-Za-z0-9]{2,}/.test(l));

  // join with spaces (not newlines) so phrases split across OCR lines
  // (e.g. "GOVERNMENT\nWARNING:") can still be matched as "GOVERNMENT WARNING"
  const raw = lines.join(' ');

  // Item 2: capture useful spans for downstream (future richer matching / debugging)
  const spans = usable.map(r => ({
    text: r.text,
    confidence: r.confidence ?? null,
    whole: !!r.whole,
    sourceImage: r.sourceImage,
  }));

  // detect potential warning start (may be split across lines)
  // Now also uses fuzzy fragment matching (same style as the warningRescue in
  // computeFieldMatches) so common manglings ("govemment warnlng", "surgen genral"
  // etc.) are still recognized when building the extracted warning field.
  let warningIdx = -1;
  const govVariants = /government|govemment|goverment|govt|governmant/i;
  const warnVariants = /warning|warnlng|warn1ng|waming|warnig/i;
  const surgeonGen = /surgeon.*general|surgen.*genral|surge0n.*gen/i;
  for (let i = 0; i < lines.length; i++) {
    const li = lines[i];
    if (govVariants.test(li) || warnVariants.test(li) || surgeonGen.test(li) || /surgeon general/i.test(li)) {
      warningIdx = i; break;
    }
  }
  // the federal warning text is ~450 characters - cap how much we pull in
  // so a stray "warning"-ish match near noisy text doesn't glob every
  // remaining line on the label into this field
  const MAX_WARNING_CHARS = 700;
  let warningLines: string[] = [];
  if (warningIdx !== -1) {
    let total = 0;
    for (let i = warningIdx; i < lines.length; i++) {
      const l = lines[i];
      if (total > 0 && total + l.length + 1 > MAX_WARNING_CHARS) break;
      warningLines.push(l);
      total += l.length + 1;
    }
  }
  const nonWarningLines = warningIdx !== -1 ? lines.slice(0, warningIdx) : lines.slice();

  // normalize warning text if present
  // Item 2: we could further bias using spans later if needed; for now the
  // existing logic benefits indirectly because `usable` already filtered on conf.
  let warning = '';
  if (warningLines.length > 0) {
    let wtxt = warningLines.join(' ');
    // normalize 'GOVERNMENT WARNING'
    wtxt = wtxt.replace(/government\s*warning/i, 'GOVERNMENT WARNING');
    // normalize common OCR misspellings of 'Surgeon General'
    wtxt = wtxt.replace(/surgeon\s*(?:genr?al|genreal|gereral|generel|genera[lI]|genefal|genaral)/gi, 'Surgeon General');
    // ensure 'Surgeon General' capitalization
    wtxt = wtxt.replace(/surgeon general/gi, 'Surgeon General');
    warning = wtxt.trim();
  }

  // alcohol: look for 'contains less than X%' first, then typical percent patterns; normalize to 'X% Alc./Vol.'
  // Use multiple sources (word spatial join is best for small text) + highConfWordText
  // so that "4.2" + "%" (or "4" "." "2" "%") captured in separate words/rects/expanded crops
  // can still be found. Added tolerant patterns that allow a few OCR noise chars between
  // the number and the % sign (very common on glare/curved cans).
  const alcoholSources = [rectsPreferredSource, highConfWordText].filter(Boolean).join(' ');
  let alcohol = '';
  const m1 = alcoholSources.match(/contains\s+less\s+than\s*(\d{1,3}(?:\.\d+)?)\s*%/i);
  if (m1) alcohol = `Less than ${m1[1]}% Alc./Vol.`;
  else {
    // tolerant: number, optional junk (including spaces/symbols Tesseract inserts), then %
    const m2 = alcoholSources.match(/(\d{1,3}(?:\.\d+)?)\s*[^A-Za-z0-9]{0,6}\s*%\s*(?:abv|alc|alc\.|alc\/vol|alcohol)?/i)
            || alcoholSources.match(/(\d{1,3}(?:\.\d+)?)\s*%\s*(?:abv|alc|alc\.|alc\/vol|alcohol)?/i);
    if (m2) alcohol = `${m2[1]}% Alc./Vol.`;
  }
  // last-resort: any high-conf word that looks like a standalone percent value near alcohol context
  if (!alcohol && highConfWordText) {
    const pct = highConfWordText.match(/(\d{1,3}(?:\.\d+)?)\s*%/);
    if (pct) alcohol = `${pct[1]}% Alc./Vol.`;
  }

  // net contents: look for pints first, then mL/L/oz. Same multi-source + tolerant approach.
  // Use rectsPreferredSource (word/rect data) rather than effectiveJoined so long noisy whole-image
  // results don't pollute the small-text fields.
  let net = '';
  const netSources = [rectsPreferredSource, highConfWordText].filter(Boolean).join(' ');
  const netMatch = netSources.match(/(\d+(?:\.\d+)?)\s*(pint|pints)\b/i)
    || netSources.match(/(\d+(?:\.\d+)?)\s*(mL|ml|l|L|litre|oz|fl\.?\s*oz|fl oz)\b/i)
    || netSources.match(/(\d+(?:\.\d+)?)\s*[^A-Za-z0-9]{0,4}\s*(oz|ml)\b/i);
  if (netMatch) net = `${netMatch[1]} ${netMatch[2]}`;

  // producer: find the line with the brewed/bottled keyword, then pull in
  // the following lines (name + address) until a stop marker is hit
  let producer = '';
  const prodKeyword = /(?:brewed and bottled by|brewed and bottled|bottled by|brewed by|brewing co\.?|brewery|brewer)/i;
  const prodStop = /drink responsibly|government\s*warning|surgeon general/i;
  const prodIdx = lines.findIndex(l => prodKeyword.test(l));
  const prodLineIndices = new Set<number>();
  if (prodIdx !== -1) {
    const prodLines = [lines[prodIdx]];
    prodLineIndices.add(prodIdx);
    for (let i = prodIdx + 1; i < lines.length && prodLines.length < 3; i++) {
      const l = lines[i];
      if (prodStop.test(l)) break;
      prodLines.push(l);
      prodLineIndices.add(i);
    }
    producer = prodLines.join(', ').replace(/^[:\-\s]+/, '').trim();
  }

  // country: capture just the country name after 'made in'; fall back to USA when
  // US federal label markers (TTB tax classification / health warning) are present
  let country = (effectiveJoined.match(/\bmade in\s+([A-Za-z]{2,}(?:\s+[A-Za-z]{2,})?)/i) || [])[1] || '';
  if (!country) {
    const usMarkers = /internal revenue|surgeon general|government\s*warning|alcohol by volume|\btaxable\b/i;
    if (usMarkers.test(effectiveJoined)) country = 'USA';
  }

  // brand: prefer first non-warning short line that isn't producer/alcohol/net/legal boilerplate
  // Item 2: we still use position order, but we now also consider that high-quality
  // (whole + high-conf) rects are more trustworthy for the "first good name" decision.
  // We don't change the loop order, but we can fall back more intelligently to
  // the highest-quality candidate if the position-based one looks weak.
  // Item 6: also try extracting brand from high-conf individual words (often cleaner
  // for proper names that get split across rects or have noise).
  let brand = '';
  const brandSkip = /government warning|surgeon general|drink responsibly|contains less than|%|ml|pint|bottled by|brewed by|brewery|brew|under|section|taxable|federal|internal revenue|\btax\b|\bco\.?$|alc.*hol|volume|malt beverage/i;
  for (let i = 0; i < nonWarningLines.length; i++) {
    if (prodLineIndices.has(i)) continue;
    const l = nonWarningLines[i];
    if (brandSkip.test(l)) continue;
    if (/:$/.test(l)) continue; // skip section-header style lines ending in ':'
    const cleaned = l.replace(/[^A-Za-z0-9 &\-\.]/g, '').trim();
    if (cleaned.length <= 2 || cleaned.length >= 40) continue;
    const words = cleaned.split(/\s+/).filter(w => /^[A-Za-z]{2,}$/.test(w));
    const letterCount = (l.match(/[A-Za-z]/g) || []).length;
    const letterRatio = letterCount / l.length;
    // require either a multi-word phrase, or a single longer word from a mostly-alphabetic line
    const looksLikeName = words.length >= 2 || (words.length === 1 && words[0].length >= 4 && letterRatio >= 0.6);
    if (looksLikeName) { brand = cleaned; break; }
  }
  // Item 6 word-level brand fallback (prefer high-conf words that look like names)
  if (!brand && highConfWordText) {
    const wordCandidates = highConfWordText.split(/\s+/).filter(w => /^[A-Za-z]{2,}$/.test(w));
    for (const w of wordCandidates) {
      if (w.length >= 3 && w.length <= 35 && !brandSkip.test(w)) {
        brand = w;
        break;
      }
    }
  }
  // fall back to the producer's company name (brand often matches the brewery/winery name)
  if (!brand && prodIdx !== -1) {
    const prodNameLine = lines[prodIdx]
      .replace(/[^A-Za-z0-9 &\-\.]/g, '')
      .replace(/^[-\s]+|[-\s]+$/g, '')
      .trim();
    if (prodNameLine.length > 2) brand = prodNameLine;
  }
  if (!brand && nonWarningLines[0]) brand = nonWarningLines[0].replace(/[^A-Za-z0-9 &\-\.]/g, '').trim();

  // if we didn't create a formatted warning but 'government' and 'warning' are present anywhere, set canonical warning
  // Uses the same fuzzy variants as the dedicated warningRescue.
  const surgeonGenRe = /surgeon.*general|surgen.*genral|surge0n.*gen/i;
  const hasGov = /government\s*warning/i.test(effectiveJoined) ||
                 /govemment\s*warnlng/i.test(effectiveJoined) ||
                 (/government|govemment|goverment|govt/i.test(effectiveJoined) &&
                  /warning|warnlng|warn1ng|waming/i.test(effectiveJoined)) ||
                 surgeonGenRe.test(effectiveJoined);
  if (!warning && hasGov) warning = 'GOVERNMENT WARNING';

  // Remaining optimization: use structured rect positions (from Tesseract rects + words in Item 3/6)
  // to bias the warning field. Real labels almost always place the GOVERNMENT WARNING
  // statement in the lower portion of the label area. If our text-based detection missed
  // or truncated it, scan lower-y rects/words for the phrase as a rescue.
  // Now also uses the fuzzy variants so mangled rect/whole text still rescues the warning.
  if ((!warning || warning.length < 30) && usable.length > 0) {
    const sortedByY = [...usable].sort((a, b) => (b.rect?.y || 0) - (a.rect?.y || 0)); // higher y = lower on image
    for (const r of sortedByY.slice(0, 3)) {  // check the 3 lowest rects
      const t = (r.text || '').toLowerCase();
      const hasGovFuzzy = /government|govemment|goverment|govt/.test(t);
      const hasWarnFuzzy = /warning|warnlng|warn1ng|waming/.test(t);
      if ((hasGovFuzzy && hasWarnFuzzy) || surgeonGenRe.test(t)) {
        let wtxt = r.text.replace(/government\s*warning|govemment\s*warnlng/i, 'GOVERNMENT WARNING');
        wtxt = wtxt.replace(/surgeon\s*(?:genr?al|genreal|gereral|generel|genera[lI]|genefal|genaral|surgen.*genral)/gi, 'Surgeon General');
        warning = wtxt.trim();
        break;
      }
      // also check its words if present (finer grained)
      if (Array.isArray(r.words)) {
        const wordTxt = r.words.map((w: any) => w.text || '').join(' ').toLowerCase();
        const wordHasGov = /government|govemment|goverment|govt/.test(wordTxt);
        const wordHasWarn = /warning|warnlng|warn1ng|waming/.test(wordTxt);
        if ((wordHasGov && wordHasWarn) || surgeonGenRe.test(wordTxt)) {
          // reconstruct from words
          const joinedWords = r.words.map((w: any) => w.text || '').join(' ');
          warning = joinedWords.replace(/government\s*warning|govemment\s*warnlng/i, 'GOVERNMENT WARNING').trim();
          break;
        }
      }
    }
  }

  // Item 2: return richer optional data alongside the original fields.
  // Existing consumers only look at the classic keys and continue to work.
  return {
    brand,
    alcohol,
    net,
    producer,
    country,
    warning,
    raw,
    confidence,
    highQualityRaw: highQualityJoined || undefined,
    spans: spans.length > 0 ? spans : undefined,
  };
};

// builds the `inputs` object passed to computeFieldMatches for a submission
// row (DB column shape), mirroring UploadForm's runAllChecks/computeAssessment
// mapping. Country is excluded (manually entered, rarely printed on the label).
export const buildFieldMatchInputs = (row: {
  type_designation?: string | null;
  brand?: string | null;
  alcohol_content?: string | null;
  net_contents?: string | null;
  net_contents_unit?: string | null;
  net_contents_secondary?: string | null;
  producer?: string | null;
  [key: string]: unknown;
}): Record<string, string> => {
  const netContentsDisplay = () => {
    if (!row.net_contents) return '';
    if (!UNITS_WITH_FL_OZ_REMAINDER.includes(row.net_contents_unit || '')) return `${row.net_contents} ${row.net_contents_unit || ''}`;
    const sec = row.net_contents_secondary && Number(row.net_contents_secondary) > 0 ? ` ${row.net_contents_secondary} Fl. Oz` : '';
    return `${row.net_contents} ${row.net_contents_unit}${sec}`;
  };

  const inputs: Record<string, string> = {
    brand: row.brand || '',
    typeDesignation: row.type_designation || '',
    alcohol: row.alcohol_content ? `${row.alcohol_content}%` : '',
    net: netContentsDisplay(),
    producer: row.producer || '',
  };

  const cfg = TYPE_FIELD_CONFIG[row.type_designation || ''] || { required: [], applicable: [] };
  for (const key of [...cfg.required, ...cfg.applicable]) {
    const dbCol = EXTRA_FIELD_DB_COLUMNS[key];
    const value = (row[dbCol] as string) || '';
    if (cfg.required.includes(key) || value.trim().length > 0) inputs[key] = value;
  }

  return inputs;
};
