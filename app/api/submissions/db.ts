import { sql } from "@vercel/postgres";
import { EMPLOYEES } from "../../../components/ui/employees";

// extra Class/Type-specific label fields (see UploadForm.tsx TYPE_FIELD_CONFIG)
const EXTRA_FIELD_COLUMNS = [
  "is_imported",
  "age_statement",
  "color_disclosure",
  "sulfite_aspartame",
  "sulfite_declaration",
  "commodity_statement",
  "appellation_of_origin",
  "percentage_foreign_wine",
  "alcohol_unit",
  "net_contents_unit",
  "net_contents_secondary",
];

// TTB COLA IDs are 14-digit numbers - mimic that format with a 2-digit
// filing year followed by a 12-digit serial number
export function generateSubmissionId(): string {
  const year = new Date().getFullYear().toString().slice(-2);
  const serial = Math.floor(Math.random() * 1e12).toString().padStart(12, "0");
  return `${year}${serial}`;
}

// demo "round robin" - randomly hands each new submission to one of the
// fixed reviewers in EMPLOYEES (by employee ID) so the gov queue can be
// filtered per-person
export function assignReviewer(): string {
  return EMPLOYEES[Math.floor(Math.random() * EMPLOYEES.length)].id;
}

// official-looking alphanumeric serial stamped on the approval/rejection
// certificate so a decision can be traced back to this record
export function generateCertificateNumber(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // omit easily-confused chars (0/O, 1/I)
  let serial = "";
  for (let i = 0; i < 10; i++) {
    serial += chars[Math.floor(Math.random() * chars.length)];
  }
  return `TTB-${serial.slice(0, 5)}-${serial.slice(5)}`;
}

export async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS submissions (
      id TEXT PRIMARY KEY,
      brand TEXT,
      type_designation TEXT,
      alcohol_content TEXT,
      net_contents TEXT,
      producer TEXT,
      country TEXT,
      warning TEXT,
      assessment_score INTEGER,
      image_url TEXT,
      status TEXT NOT NULL DEFAULT 'Submitted',
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  for (const col of EXTRA_FIELD_COLUMNS) {
    await sql.query(`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS ${col} TEXT`);
  }

  await sql`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS rejection_reasons JSONB`;
  await sql`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS rejection_comment TEXT`;
  await sql`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS assigned_to TEXT`;
  await sql`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS decided_by TEXT`;
  await sql`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS certificate_number TEXT`;

  // older deployments created `id`/`submission_id` as UUID - widen to TEXT so
  // the new numeric TTB-style IDs can be stored. The FK is dropped since a
  // UUID/TEXT pair can't share an index for referential checks.
  await sql`ALTER TABLE assessments DROP CONSTRAINT IF EXISTS assessments_submission_id_fkey`;
  await sql`ALTER TABLE submissions ALTER COLUMN id TYPE TEXT`;

  await sql`
    CREATE TABLE IF NOT EXISTS assessments (
      submission_id TEXT PRIMARY KEY REFERENCES submissions(id),
      blurry BOOLEAN,
      flash BOOLEAN,
      warning_present BOOLEAN,
      surgeon_general BOOLEAN,
      ocr_confidence INTEGER,
      assessment_score INTEGER,
      field_matches JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await sql`ALTER TABLE assessments ALTER COLUMN submission_id TYPE TEXT`;
}

// approved/rejected submissions are moved here (and removed from `submissions`)
// once a government reviewer makes a decision, so they fall out of the
// current queue while remaining available for historical/audit reporting
const HISTORY_COLUMNS_SQL = `
  id TEXT PRIMARY KEY,
  brand TEXT,
  type_designation TEXT,
  alcohol_content TEXT,
  net_contents TEXT,
  producer TEXT,
  country TEXT,
  warning TEXT,
  assessment_score INTEGER,
  image_url TEXT,
  status TEXT NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL,
  is_imported TEXT,
  age_statement TEXT,
  color_disclosure TEXT,
  sulfite_aspartame TEXT,
  sulfite_declaration TEXT,
  commodity_statement TEXT,
  appellation_of_origin TEXT,
  percentage_foreign_wine TEXT,
  alcohol_unit TEXT,
  net_contents_unit TEXT,
  net_contents_secondary TEXT,
  rejection_reasons JSONB,
  rejection_comment TEXT,
  assigned_to TEXT,
  decided_by TEXT,
  certificate_number TEXT,
  assessment_blurry BOOLEAN,
  assessment_flash BOOLEAN,
  assessment_warning_present BOOLEAN,
  assessment_surgeon_general BOOLEAN,
  assessment_ocr_confidence INTEGER,
  assessment_field_matches JSONB,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now()
`;

export const APPROVED_TABLE = "approved_submissions";
export const REJECTED_TABLE = "rejected_submissions";

export async function ensureHistoryTables() {
  await sql.query(`CREATE TABLE IF NOT EXISTS ${APPROVED_TABLE} (${HISTORY_COLUMNS_SQL})`);
  await sql.query(`CREATE TABLE IF NOT EXISTS ${REJECTED_TABLE} (${HISTORY_COLUMNS_SQL})`);

  // older deployments created `id` as UUID - widen to TEXT for the new
  // numeric TTB-style IDs
  await sql.query(`ALTER TABLE ${APPROVED_TABLE} ALTER COLUMN id TYPE TEXT`);
  await sql.query(`ALTER TABLE ${REJECTED_TABLE} ALTER COLUMN id TYPE TEXT`);

  await sql.query(`ALTER TABLE ${APPROVED_TABLE} ADD COLUMN IF NOT EXISTS assigned_to TEXT`);
  await sql.query(`ALTER TABLE ${REJECTED_TABLE} ADD COLUMN IF NOT EXISTS assigned_to TEXT`);

  await sql.query(`ALTER TABLE ${APPROVED_TABLE} ADD COLUMN IF NOT EXISTS decided_by TEXT`);
  await sql.query(`ALTER TABLE ${REJECTED_TABLE} ADD COLUMN IF NOT EXISTS decided_by TEXT`);
  await sql.query(`ALTER TABLE ${APPROVED_TABLE} ADD COLUMN IF NOT EXISTS certificate_number TEXT`);
  await sql.query(`ALTER TABLE ${REJECTED_TABLE} ADD COLUMN IF NOT EXISTS certificate_number TEXT`);
}

export const SUBMISSION_WITH_ASSESSMENT_SELECT = `
  SELECT s.*,
    a.blurry AS assessment_blurry,
    a.flash AS assessment_flash,
    a.warning_present AS assessment_warning_present,
    a.surgeon_general AS assessment_surgeon_general,
    a.ocr_confidence AS assessment_ocr_confidence,
    a.field_matches AS assessment_field_matches,
    NULL::timestamptz AS decided_at
  FROM submissions s
  LEFT JOIN assessments a ON a.submission_id = s.id
`;

// shared column set across the active queue (joined with its assessment) and
// the approved/rejected history tables, so all three can be combined with UNION
export const SUBMISSION_COLUMNS = [
  "id", "brand", "type_designation", "alcohol_content", "net_contents", "producer", "country", "warning",
  "assessment_score", "image_url", "status", "submitted_at", "is_imported", "age_statement", "color_disclosure",
  "sulfite_aspartame", "sulfite_declaration", "commodity_statement", "appellation_of_origin", "percentage_foreign_wine",
  "alcohol_unit", "net_contents_unit", "net_contents_secondary", "rejection_reasons", "rejection_comment",
  "assessment_blurry", "assessment_flash", "assessment_warning_present", "assessment_surgeon_general",
  "assessment_ocr_confidence", "assessment_field_matches", "decided_at", "assigned_to", "decided_by", "certificate_number",
];

// every submission regardless of status: pending ones from `submissions`
// (joined with their assessment) plus the approved/rejected history tables
export const ALL_SUBMISSIONS_QUERY = `
  SELECT ${SUBMISSION_COLUMNS.join(", ")} FROM (${SUBMISSION_WITH_ASSESSMENT_SELECT}) AS sub
  UNION ALL
  SELECT ${SUBMISSION_COLUMNS.join(", ")} FROM ${APPROVED_TABLE}
  UNION ALL
  SELECT ${SUBMISSION_COLUMNS.join(", ")} FROM ${REJECTED_TABLE}
  ORDER BY submitted_at DESC
`;
