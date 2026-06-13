// always-shown label fields, keyed to the submissions table columns
export const BASE_FIELDS: { key: string; label: string }[] = [
  { key: "brand", label: "Brand name" },
  { key: "type_designation", label: "Class / Type designation" },
  { key: "alcohol_content", label: "Alcohol content" },
  { key: "net_contents", label: "Net contents" },
  { key: "producer", label: "Bottler/producer (Name, City, State)" },
  { key: "country", label: "Country of origin" },
];

// Class/Type-specific fields - only shown (and offered as a rejection reason)
// when the submission actually has a value for them
export const EXTRA_FIELDS: { key: string; label: string }[] = [
  { key: "age_statement", label: "Age statement" },
  { key: "color_disclosure", label: "Color additive / ingredient disclosure" },
  { key: "sulfite_aspartame", label: "Sulfite and aspartame declarations" },
  { key: "sulfite_declaration", label: "Sulfite declaration" },
  { key: "commodity_statement", label: "Commodity statement" },
  { key: "appellation_of_origin", label: "Appellation of origin" },
  { key: "percentage_foreign_wine", label: "% foreign wine" },
  { key: "warning", label: "Government warning" },
];

// maps a submissions-table column key (used above) to the camelCase field
// key used by CHECKLIST_FIELD_MAP in checklistData.ts
export const DB_TO_CHECKLIST_KEY: Record<string, string> = {
  brand: "brand",
  type_designation: "typeDesignation",
  alcohol_content: "alcoholContent",
  net_contents: "netContents",
  producer: "producer",
  country: "country",
  age_statement: "ageStatement",
  color_disclosure: "colorDisclosure",
  sulfite_aspartame: "sulfiteAspartame",
  sulfite_declaration: "sulfiteDeclaration",
  commodity_statement: "commodityStatement",
  appellation_of_origin: "appellationOfOrigin",
  percentage_foreign_wine: "percentageForeignWine",
};

export const applicableExtraFields = (submission: any) =>
  EXTRA_FIELDS.filter((f) => (submission[f.key] || "").toString().trim().length > 0);

// image-quality issues flagged by the automated assessment - offered as
// rejection reasons (in addition to label-content fields) when flagged
export const IMAGE_QUALITY_FIELDS: { key: string; label: string }[] = [
  { key: "assessment_blurry", label: "Blurry image" },
  { key: "assessment_flash", label: "Flash detected" },
];

export const netContentsDisplay = (submission: any) => {
  const sec = submission.net_contents_secondary;
  const secDisplay = sec && Number(sec) > 0 ? ` ${sec} Fl. Oz` : "";
  return `${submission.net_contents || ""} ${submission.net_contents_unit || ""}${secDisplay}`.trim();
};

export const fieldValue = (submission: any, key: string) => {
  if (key === "alcohol_content") {
    return submission.alcohol_content ? `${submission.alcohol_content}% ${submission.alcohol_unit || ""}`.trim() : "";
  }
  if (key === "net_contents") return netContentsDisplay(submission);
  if (key === "country") return submission.is_imported === "Yes" ? submission.country || "" : "N/A (domestic)";
  if (key === "producer") {
    return [submission.producer, submission.producer_city, submission.producer_state].filter(Boolean).join(", ");
  }
  return submission[key] || "";
};

// a submission may have multiple photos (image_urls) or a single legacy
// photo (image_url) - normalize to an array for display
export const getImageUrls = (submission: any): string[] =>
  Array.isArray(submission.image_urls) && submission.image_urls.length > 0
    ? submission.image_urls
    : (submission.image_url ? [submission.image_url] : []);

export const scoreLabel = (f: any) =>
  f.assessment_score === null || f.assessment_score === undefined ? "N/A" : `${f.assessment_score}%`;

// populates the ID/Brand/Score/Date column filter dropdowns with only the
// values present within the currently selected status tab
export const deriveFilterOptions = (forms: any[]) => {
  const idOptions = Array.from(new Set(forms.map((f) => String(f.id)))).sort();
  const brandOptions = Array.from(new Set(forms.map((f) => f.brand || "(no brand)"))).sort();
  const scoreOptions = Array.from(new Set(forms.map(scoreLabel))).sort((a, b) => {
    if (a === "N/A") return 1;
    if (b === "N/A") return -1;
    return parseInt(b) - parseInt(a);
  });
  const dateOptions = Array.from(new Set(forms.map((f) => new Date(f.submitted_at).toLocaleDateString())))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  return { idOptions, brandOptions, scoreOptions, dateOptions };
};
