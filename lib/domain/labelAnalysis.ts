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

// match each input field's value (treated as a regex, falling back to literal)
// against the full raw OCR text. Inputs left blank are 'no-input'.
export const computeFieldMatches = (
  rawText: string,
  inputs: Record<string, string>,
  log?: (msg: string) => void
): { fm: FieldMatches; matches: number; total: number } => {
  const raw = (rawText || '').trim();
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
    // treat user input as regex; if invalid, fall back to literal match.
    // any whitespace in the input becomes optional (\s*) so OCR text that
    // drops/collapses spaces (e.g. "1PINT" vs "1 PINT") still matches.
    let ok = false;
    try {
      const re = new RegExp(inVal.replace(/\s+/g, '\\s*'), 'i');
      ok = re.test(raw);
    } catch (e) {
      try {
        const esc = inVal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re2 = new RegExp(esc.replace(/\s+/g, '\\s*'), 'i');
        ok = re2.test(raw);
      } catch (e2) { ok = false; }
    }
    // fallback: allow OCR whitespace noise between every character
    // (e.g. "MALT BEVERAGE" vs "M A L T B E V E R A G E", or
    // "1PINT" vs "1 P I N T"), regardless of which side has the spaces
    if (!ok) {
      const flexible = inVal
        .replace(/\s+/g, '')
        .split('')
        .map(ch => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('\\s*');
      try {
        ok = new RegExp(flexible, 'i').test(raw);
      } catch (e3) { /* ignore */ }
    }
    fm[key] = ok;
    if (ok) matches++;
    log?.(`Field match: ${key} = "${inVal}" -> ${ok ? 'matched' : 'not matched'}`);
  }

  return { fm, matches, total };
};

// derives the 0-100 overall assessment score from a match count, or null if
// there were no inputs to check against
export const computeAssessmentScore = (matches: number, total: number): number | null =>
  total === 0 ? null : Math.round((matches / total) * 100);

export const parseFromRects = (
  ocrResults: Array<{ rect: any; text: string; confidence?: number | null; whole?: boolean; wholePass?: string }>
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
  const MIN_WHOLE_IMAGE_CONFIDENCE = 50;
  const usable = ocrResults.filter(r => {
    if (r.text.trim().length === 0) return false;
    if (typeof r.confidence !== 'number') return true;
    return r.confidence >= (r.whole ? MIN_WHOLE_IMAGE_CONFIDENCE : MIN_RECT_CONFIDENCE);
  });

  // sort top->bottom, left->right
  const sorted = [...usable].sort((a, b) => (a.rect.y - b.rect.y) || (a.rect.x - b.rect.x));
  const joined = sorted.map(r => r.text.replace(/[‘’“”]/g, '"')).join('\n').replace(/\s+\n/g,'\n');

  // overall OCR confidence: weighted median of per-rect confidences (weight =
  // recognized text length). A median is less skewed than a mean by a single
  // very low/high-confidence outlier rect among only a handful of rects.
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

  // split into lines and normalize characters likely from OCR noise
  const lines = joined.split(/\r?\n/)
    .map(l => l.replace(/["“”‘’\|\\/\_\*‚„{}\[\]<>~^@#]/g, ' ').replace(/[^\x00-\x7F]/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter(l => /[A-Za-z0-9]{2,}/.test(l));

  // join with spaces (not newlines) so phrases split across OCR lines
  // (e.g. "GOVERNMENT\nWARNING:") can still be matched as "GOVERNMENT WARNING"
  const raw = lines.join(' ');

  // detect potential warning start (may be split across lines)
  let warningIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const li = lines[i];
    if (/government/i.test(li) || /warning/i.test(li) || /surgeon general/i.test(li)) { warningIdx = i; break; }
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
  let alcohol = '';
  const m1 = joined.match(/contains\s+less\s+than\s*(\d{1,3}(?:\.\d+)?)\s*%/i);
  if (m1) alcohol = `Less than ${m1[1]}% Alc./Vol.`;
  else {
    const m2 = joined.match(/(\d{1,3}(?:\.\d+)?)\s*%\s*(?:abv|alc|alc\.|alc\/vol|alcohol)?/i);
    if (m2) alcohol = `${m2[1]}% Alc./Vol.`;
  }

  // net contents: look for pints first, then mL/L/oz
  let net = '';
  const netMatch = joined.match(/(\d+(?:\.\d+)?)\s*(pint|pints)\b/i) || joined.match(/(\d+(?:\.\d+)?)\s*(mL|ml|l|L|litre|oz|fl oz)\b/i);
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
  let country = (joined.match(/\bmade in\s+([A-Za-z]{2,}(?:\s+[A-Za-z]{2,})?)/i) || [])[1] || '';
  if (!country) {
    const usMarkers = /internal revenue|surgeon general|government\s*warning|alcohol by volume|\btaxable\b/i;
    if (usMarkers.test(joined)) country = 'USA';
  }

  // brand: prefer first non-warning short line that isn't producer/alcohol/net/legal boilerplate
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
  const hasGov = /government\s*warning/i.test(joined) || (/government/i.test(joined) && /warning/i.test(joined));
  if (!warning && hasGov) warning = 'GOVERNMENT WARNING';

  return { brand, alcohol, net, producer, country, warning, raw, confidence };
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
