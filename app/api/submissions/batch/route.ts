import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { ensureTable, SUBMISSION_WITH_ASSESSMENT_SELECT, generateSubmissionId, assignReviewer } from "../db";
import { uploadImages } from "../storage";
import { BATCH_STATUSES } from "../../../../components/ui/batchStatus";

// columns mapped 1:1 from CSV via mapCsvRowToSubmissionFields
const ROW_FIELDS = [
  "brand", "type_designation", "alcohol_content", "alcohol_unit",
  "net_contents", "net_contents_unit", "net_contents_secondary",
  "producer", "country", "is_imported", "warning",
  "age_statement", "color_disclosure", "sulfite_aspartame",
  "sulfite_declaration", "commodity_statement", "appellation_of_origin",
  "percentage_foreign_wine",
];

// POST: create a new batch from pre-validated rows. Each row maps to one
// uploaded file (matched by filename) and becomes a "Batch Queued" submission.
export async function POST(request: NextRequest) {
  await ensureTable();

  const form = await request.formData();
  const rowsRaw = form.get("rows");
  if (typeof rowsRaw !== "string") {
    return NextResponse.json({ error: "Missing 'rows' field" }, { status: 400 });
  }

  let rows: Array<{ filename: string; fields: Record<string, string> }>;
  try {
    rows = JSON.parse(rowsRaw);
  } catch {
    return NextResponse.json({ error: "'rows' is not valid JSON" }, { status: 400 });
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "'rows' must be a non-empty array" }, { status: 400 });
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const filesByName = new Map(files.map((f) => [f.name, f]));

  const batchId = crypto.randomUUID();
  const ids: string[] = [];

  for (const row of rows) {
    const file = filesByName.get(row.filename);
    if (!file) {
      return NextResponse.json({ error: `No uploaded file matches filename "${row.filename}"` }, { status: 400 });
    }

    const id = generateSubmissionId();
    const assignedTo = assignReviewer();
    const imageUrls = await uploadImages(id, [file]);
    const imageUrl = imageUrls[0] ?? null;

    const values: Record<string, string> = {};
    for (const key of ROW_FIELDS) values[key] = row.fields[key] || "";

    await sql`
      INSERT INTO submissions (
        id, brand, type_designation, alcohol_content, net_contents,
        producer, country, warning, image_url, image_urls,
        is_imported, age_statement, color_disclosure, sulfite_aspartame,
        sulfite_declaration, commodity_statement, appellation_of_origin, percentage_foreign_wine,
        alcohol_unit, net_contents_unit, net_contents_secondary, assigned_to,
        status, batch_id
      ) VALUES (
        ${id}, ${values.brand}, ${values.type_designation}, ${values.alcohol_content}, ${values.net_contents},
        ${values.producer}, ${values.country}, ${values.warning}, ${imageUrl}, ${JSON.stringify(imageUrls)}::jsonb,
        ${values.is_imported}, ${values.age_statement}, ${values.color_disclosure}, ${values.sulfite_aspartame},
        ${values.sulfite_declaration}, ${values.commodity_statement}, ${values.appellation_of_origin}, ${values.percentage_foreign_wine},
        ${values.alcohol_unit}, ${values.net_contents_unit}, ${values.net_contents_secondary}, ${assignedTo},
        ${BATCH_STATUSES.QUEUED}, ${batchId}
      )
    `;

    await sql`
      INSERT INTO assessments (submission_id) VALUES (${id})
    `;

    ids.push(id);
  }

  return NextResponse.json({ batch_id: batchId, count: ids.length, ids }, { status: 201 });
}

// PATCH { ids: string[], status: "Submitted" } : bulk-flip "Batch Ready" rows
// to "Submitted" in one action (rows not currently "Batch Ready" are skipped)
export async function PATCH(request: NextRequest) {
  await ensureTable();

  const body = await request.json();
  const ids: string[] = Array.isArray(body.ids) ? body.ids.map(String) : [];
  const status = String(body.status || "");

  if (status !== "Submitted" || ids.length === 0) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const result = await sql.query(
    `UPDATE submissions SET status = 'Submitted' WHERE id = ANY($1) AND status = $2`,
    [ids, BATCH_STATUSES.READY]
  );

  return NextResponse.json({ updated: result.rowCount });
}

// GET ?batch_id=...&status=a,b,c : list rows for a batch, optionally filtered
// by a comma-separated list of statuses
export async function GET(request: NextRequest) {
  await ensureTable();

  const { searchParams } = new URL(request.url);
  const batchId = searchParams.get("batch_id");
  const statusParam = searchParams.get("status");

  if (!batchId) {
    return NextResponse.json({ error: "Missing 'batch_id' query parameter" }, { status: 400 });
  }

  let query = `${SUBMISSION_WITH_ASSESSMENT_SELECT} WHERE s.batch_id = $1`;
  const params: any[] = [batchId];

  if (statusParam) {
    const statuses = statusParam.split(",").map((s) => s.trim()).filter(Boolean);
    if (statuses.length > 0) {
      query += ` AND s.status = ANY($2)`;
      params.push(statuses);
    }
  }

  query += ` ORDER BY s.submitted_at ASC`;

  const { rows } = await sql.query(query, params);
  return NextResponse.json(rows);
}
