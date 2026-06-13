import { TYPE_DESIGNATIONS, ALCOHOL_UNITS, NET_CONTENTS_UNITS } from "@/lib/constants/units";
import { MAX_IMAGES_PER_ROW } from "@/lib/domain/bulkUploadFormatSpec";
import US_STATES from "@/lib/data/usStates.json";

// hand-rolled RFC4180-subset CSV parser (no npm dependency): comma-separated,
// double-quote wrapped fields supporting embedded commas/newlines/escaped
// quotes (""), CRLF or LF line endings, and a leading BOM.
export function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const records: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === ',') { row.push(field); field = ""; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') {
      row.push(field);
      field = "";
      records.push(row);
      row = [];
      continue;
    }
    field += ch;
  }
  // last field/row (file may or may not end with a newline)
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    records.push(row);
  }

  // drop fully-empty trailing rows (e.g. trailing blank line)
  while (records.length > 0 && records[records.length - 1].every((f) => f === "")) {
    records.pop();
  }

  if (records.length === 0) return { headers: [], rows: [] };

  const headers = records[0].map((h) => h.trim());
  const rows = records.slice(1).map((record) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = (record[i] ?? "").trim(); });
    return obj;
  });

  return { headers, rows };
}

// columns that are mapped straight through to `submissions` table columns
// of the same name
const PASSTHROUGH_COLUMNS = [
  "brand", "type_designation", "alcohol_content", "alcohol_unit",
  "net_contents", "net_contents_unit", "net_contents_secondary",
  "producer", "producer_city", "producer_state", "country", "is_imported", "warning",
  "age_statement", "color_disclosure", "sulfite_aspartame",
  "sulfite_declaration", "commodity_statement", "appellation_of_origin",
  "percentage_foreign_wine",
];

// validates a single CSV row (mapped 1:1 to a submission + up to
// MAX_IMAGES_PER_ROW images) and maps it to `submissions` column values.
// Returns per-row errors instead of throwing so the caller can report
// partial-batch validation results.
export function mapCsvRowToSubmissionFields(row: Record<string, string>): { values: Record<string, string>; images: string[]; errors: string[] } {
  const errors: string[] = [];
  const values: Record<string, string> = {};

  for (const col of PASSTHROUGH_COLUMNS) values[col] = (row[col] || "").trim();

  const images = (row.image || "").split(";").map((s) => s.trim()).filter(Boolean);
  if (images.length === 0) errors.push("Missing required field: image");
  else if (images.length > MAX_IMAGES_PER_ROW) errors.push(`Too many images (${images.length}) - a maximum of ${MAX_IMAGES_PER_ROW} images per row is allowed`);
  values.image = images.join(";");

  if (!values.brand) errors.push("Missing required field: brand");
  if (!values.producer) errors.push("Missing required field: producer");

  if (!values.producer_city) errors.push("Missing required field: producer_city");
  if (!values.producer_state) errors.push("Missing required field: producer_state");
  else if (!US_STATES.includes(values.producer_state)) {
    errors.push(`Invalid producer_state "${values.producer_state}" (expected one of: ${US_STATES.join(", ")})`);
  }

  if (!values.type_designation) errors.push("Missing required field: type_designation");
  else if (!TYPE_DESIGNATIONS.includes(values.type_designation)) {
    errors.push(`Invalid type_designation "${values.type_designation}" (expected one of: ${TYPE_DESIGNATIONS.join(", ")})`);
  }

  if (!values.alcohol_content) errors.push("Missing required field: alcohol_content");
  if (!values.alcohol_unit) errors.push("Missing required field: alcohol_unit");
  else if (!ALCOHOL_UNITS.includes(values.alcohol_unit)) {
    errors.push(`Invalid alcohol_unit "${values.alcohol_unit}" (expected one of: ${ALCOHOL_UNITS.join(", ")})`);
  }

  if (!values.net_contents) errors.push("Missing required field: net_contents");
  if (!values.net_contents_unit) errors.push("Missing required field: net_contents_unit");
  else if (!NET_CONTENTS_UNITS.includes(values.net_contents_unit)) {
    errors.push(`Invalid net_contents_unit "${values.net_contents_unit}" (expected one of: ${NET_CONTENTS_UNITS.join(", ")})`);
  }

  if (!values.is_imported) errors.push("Missing required field: is_imported");
  else if (values.is_imported !== "Yes" && values.is_imported !== "No") {
    errors.push(`Invalid is_imported "${values.is_imported}" (expected "Yes" or "No")`);
  }

  if (values.is_imported === "Yes" && !values.country) {
    errors.push("Missing required field: country (required when is_imported = Yes)");
  }
  if (values.is_imported !== "Yes") values.country = "";

  // age statement is required for Distilled Spirits (per TYPE_FIELD_CONFIG)
  if (values.type_designation === "Distilled Spirits" && !values.age_statement) {
    errors.push("Missing required field: age_statement (required for Distilled Spirits)");
  }

  return { values, images, errors };
}
