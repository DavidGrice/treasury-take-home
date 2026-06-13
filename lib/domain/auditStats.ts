import { SUBMISSION_STATUSES } from "@/lib/constants/statuses";

export type RejectionReasonRow = { reason: string; count: number };

// counts how often each rejection-reason checklist label was checked across
// the given rejected submissions (only reasons that occurred at least once
// are returned, sorted most-common first)
export function buildRejectionReasonBreakdown(rejected: any[]): RejectionReasonRow[] {
  const counts = new Map<string, number>();
  for (const f of rejected) {
    const reasons: string[] = Array.isArray(f.rejection_reasons) ? f.rejection_reasons : [];
    for (const reason of reasons) counts.set(reason, (counts.get(reason) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
}

export type AssessmentChecklistStats = {
  sampleSize: number;
  avgScore: number | null;
  avgOcrConfidence: number | null;
  blurryRate: number | null;
  flashRate: number | null;
  missingWarningRate: number | null;
  missingSurgeonGeneralRate: number | null;
};

// aggregates the automated pre-assessment checklist (image quality, OCR
// confidence, and presence of required warning text) across submissions
// that have assessment data
export function buildAssessmentChecklistStats(forms: any[]): AssessmentChecklistStats {
  const withAssessment = forms.filter((f) => typeof f.assessment_score === "number");
  const n = withAssessment.length;

  const avg = (vals: number[]) => (vals.length === 0 ? null : Math.round(vals.reduce((a, b) => a + b, 0) / vals.length));
  const rate = (pred: (f: any) => boolean) => (n === 0 ? null : Math.round((withAssessment.filter(pred).length / n) * 100));

  return {
    sampleSize: n,
    avgScore: avg(withAssessment.map((f) => f.assessment_score)),
    avgOcrConfidence: avg(withAssessment.map((f) => f.assessment_ocr_confidence).filter((v): v is number => typeof v === "number")),
    blurryRate: rate((f) => f.assessment_blurry === true),
    flashRate: rate((f) => f.assessment_flash === true),
    missingWarningRate: rate((f) => f.assessment_warning_present === false),
    missingSurgeonGeneralRate: rate((f) => f.assessment_surgeon_general === false),
  };
}

export type FieldMatchRow = { field: string; matched: number; notMatched: number; noInput: number };

// friendly labels for the camelCase keys stored in assessment_field_matches
const FIELD_MATCH_LABELS: Record<string, string> = {
  brand: "Brand",
  typeDesignation: "Type Designation",
  alcohol: "Alcohol Content",
  net: "Net Contents",
  producer: "Producer",
  ageStatement: "Age Statement",
  colorDisclosure: "Color Disclosure",
  sulfiteAspartame: "Sulfite/Aspartame",
  sulfiteDeclaration: "Sulfite Declaration",
  commodityStatement: "Commodity Statement",
  appellationOfOrigin: "Appellation of Origin",
  percentageForeignWine: "% Foreign Wine",
};

// for each label field, how often the OCR'd label text matched (vs didn't
// match, vs had no input to check) what the applicant entered on the form
export function buildFieldMatchRates(forms: any[]): FieldMatchRow[] {
  const counts = new Map<string, { matched: number; notMatched: number; noInput: number }>();
  for (const f of forms) {
    const fm = f.assessment_field_matches;
    if (!fm || typeof fm !== "object") continue;
    for (const [key, val] of Object.entries(fm)) {
      if (!counts.has(key)) counts.set(key, { matched: 0, notMatched: 0, noInput: 0 });
      const c = counts.get(key)!;
      if (val === true) c.matched += 1;
      else if (val === false) c.notMatched += 1;
      else c.noInput += 1;
    }
  }
  return Array.from(counts.entries()).map(([key, c]) => ({ field: FIELD_MATCH_LABELS[key] || key, ...c }));
}

export type ThemeRow = { label: string; count: number };

// regex-based "themes" for rejection-comment free text, used to surface
// recurring reasons reviewers cite beyond the checklist
export const REJECTION_COMMENT_THEMES: { label: string; pattern: RegExp }[] = [
  { label: "Image quality (blurry/dark/unclear)", pattern: /\b(blurry|blur|dark|unclear|resolution|low.?quality|glare|out of focus|illegible)\b/i },
  { label: "Government warning", pattern: /\b(government warning|surgeon general|warning statement)\b/i },
  { label: "Alcohol content", pattern: /\b(alcohol|abv|proof)\b/i },
  { label: "Net contents / volume", pattern: /\b(net contents?|volume|fl\.?\s?oz|\bml\b|gallon|quart|pint)\b/i },
  { label: "Brand / label name", pattern: /\b(brand|label name|misspell|spelling)\b/i },
  { label: "Producer / address", pattern: /\b(address|producer|bottle[rd]|located)\b/i },
  { label: "Appellation / origin / country", pattern: /\b(appellation|origin|country)\b/i },
  { label: "Missing or mismatched info", pattern: /\b(missing|incorrect|incomplete|doesn'?t match|does not match|mismatch)\b/i },
];

// counts how many rejection comments mention each theme (a single comment
// may match multiple themes); returns only themes that matched at least once,
// plus the count of commented rejections that matched none of the themes
export function buildRejectionCommentThemes(rejected: any[]): { totalWithComment: number; themes: ThemeRow[]; other: number } {
  const withComment = rejected.filter((f) => (f.rejection_comment || "").trim().length > 0);
  const themes = REJECTION_COMMENT_THEMES
    .map((theme) => ({ label: theme.label, count: withComment.filter((f) => theme.pattern.test(f.rejection_comment)).length }))
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count);
  const other = withComment.filter((f) => !REJECTION_COMMENT_THEMES.some((theme) => theme.pattern.test(f.rejection_comment))).length;
  return { totalWithComment: withComment.length, themes, other };
}

const STOPWORDS = new Set([
  "the", "and", "for", "this", "that", "with", "from", "have", "has", "was", "were", "are", "but", "not",
  "you", "your", "please", "label", "submission", "form", "their", "they", "them", "into", "also", "than",
  "does", "did", "doesn't", "didn't", "been", "being", "will", "would", "could", "should", "must", "need",
  "needs", "needed", "again", "any", "all", "out", "our", "ours", "its", "it's", "such", "more", "most",
  "which", "what", "when", "where", "while", "these", "those", "there",
]);

export type KeywordRow = { word: string; count: number };

// simple word-frequency analysis over rejection comments (lowercased,
// punctuation stripped, stopwords removed, 4+ letter words only) - surfaces
// recurring terms that aren't covered by the fixed theme list above
export function buildRejectionCommentKeywords(rejected: any[], limit = 10): KeywordRow[] {
  const counts = new Map<string, number>();
  for (const f of rejected) {
    const comment = (f.rejection_comment || "").toLowerCase();
    const words = comment.match(/[a-z']+/g) || [];
    for (const word of words) {
      if (word.length < 4 || STOPWORDS.has(word)) continue;
      counts.set(word, (counts.get(word) || 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export const isRejected = (f: any) => f.status === SUBMISSION_STATUSES.REJECTED;
