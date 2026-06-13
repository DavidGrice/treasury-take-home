import { TYPE_DESIGNATIONS } from "@/lib/constants/units";

// Reference data describing the Bulk Upload CSV/photo format - shown to
// users via a "Format guide" modal on the Bulk Upload page (not exposed as a
// raw downloadable file, since most non-technical users won't know what to
// do with a .json file).
export type FormatColumn = {
  name: string;
  required: true | false | "conditional";
  allowedValues?: string[];
  appliesTo?: string[];
  description?: string;
};

export const BULK_UPLOAD_FORMAT_SPEC: { csvColumns: FormatColumn[]; photos: { accepted: string; matching: string } } = {
  csvColumns: [
    {
      name: "image",
      required: true,
      description: "Filename of this row's label photo. Must exactly match (case-sensitive) the filename of one of the uploaded photos.",
    },
    {
      name: "brand",
      required: true,
      description: "Brand name.",
    },
    {
      name: "type_designation",
      required: true,
      allowedValues: TYPE_DESIGNATIONS,
      description: "Determines which extra fields below apply.",
    },
    {
      name: "alcohol_content",
      required: true,
      description: "Numeric alcohol content (e.g. \"5.2\").",
    },
    {
      name: "alcohol_unit",
      required: true,
      allowedValues: ["Alc./Vol.", "Alc./Wt."],
    },
    {
      name: "net_contents",
      required: true,
      description: "Numeric net contents (e.g. \"12\").",
    },
    {
      name: "net_contents_unit",
      required: true,
      allowedValues: ["Fl. Oz", "Pint", "Quart", "Gallon", "mL", "L"],
    },
    {
      name: "net_contents_secondary",
      required: false,
      description: "Optional remainder fluid ounces (e.g. 1 Pint 4 Fl. Oz -> net_contents=1, net_contents_secondary=4). Only used when net_contents_unit is Pint, Quart, or Gallon. Leave blank or 0 to omit.",
    },
    {
      name: "producer",
      required: true,
      description: "Name and address of bottler/producer.",
    },
    {
      name: "is_imported",
      required: true,
      allowedValues: ["Yes", "No"],
    },
    {
      name: "country",
      required: "conditional",
      description: "Country of origin. Required when is_imported = Yes; ignored otherwise.",
    },
    {
      name: "warning",
      required: false,
      description: "Government warning statement text, if applicable.",
    },
    {
      name: "age_statement",
      required: "conditional",
      description: "Required when type_designation = Distilled Spirits. Otherwise optional.",
    },
    {
      name: "color_disclosure",
      required: false,
      appliesTo: TYPE_DESIGNATIONS,
      description: "Color additive / ingredient disclosure.",
    },
    {
      name: "sulfite_aspartame",
      required: false,
      appliesTo: ["Malt Beverage"],
      description: "Sulfite and aspartame declarations.",
    },
    {
      name: "sulfite_declaration",
      required: false,
      appliesTo: ["Wine"],
      description: "Sulfite declaration.",
    },
    {
      name: "commodity_statement",
      required: false,
      appliesTo: ["Distilled Spirits"],
      description: "Commodity statement.",
    },
    {
      name: "appellation_of_origin",
      required: false,
      appliesTo: ["Wine"],
    },
    {
      name: "percentage_foreign_wine",
      required: false,
      appliesTo: ["Wine"],
      description: "% foreign wine.",
    },
  ],
  photos: {
    accepted: "Any common image file type (JPEG, PNG, WEBP, etc.)",
    matching: "Each photo's filename must exactly match (case-sensitive) the \"image\" value of one CSV row. Unmatched rows or photos are reported and skipped.",
  },
};

// sample values for the downloadable CSV template's one example row -
// illustrates the expected format without users needing to guess
export const EXAMPLE_ROW: Record<string, string> = {
  image: "example-label.jpg",
  brand: "Example Brand",
  type_designation: "Malt Beverage",
  alcohol_content: "5.0",
  alcohol_unit: "Alc./Vol.",
  net_contents: "12",
  net_contents_unit: "Fl. Oz",
  net_contents_secondary: "",
  producer: "Example Producer, Anytown, ST",
  is_imported: "No",
  country: "",
  warning: "",
  age_statement: "",
  color_disclosure: "",
  sulfite_aspartame: "",
  sulfite_declaration: "",
  commodity_statement: "",
  appellation_of_origin: "",
  percentage_foreign_wine: "",
};

// quotes a CSV field per RFC4180 (wrap + escape) only when needed
function csvField(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

// builds a downloadable CSV template: a header row matching the column
// order above, followed by one filled-in example row
export function buildCsvTemplate(): string {
  const names = BULK_UPLOAD_FORMAT_SPEC.csvColumns.map((c) => c.name);
  const header = names.map(csvField).join(",");
  const example = names.map((n) => csvField(EXAMPLE_ROW[n] ?? "")).join(",");
  return `${header}\r\n${example}\r\n`;
}
