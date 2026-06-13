import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { ensureTable, ensureHistoryTables, SUBMISSION_WITH_ASSESSMENT_SELECT, APPROVED_TABLE, REJECTED_TABLE, generateCertificateNumber } from "../db";
import { BATCH_STATUSES, STALE_CLAIM_MS } from "../../../../components/ui/batchStatus";

const BATCH_INPLACE_STATUSES: string[] = [
  BATCH_STATUSES.PROCESSING, BATCH_STATUSES.READY, BATCH_STATUSES.NEEDS_REVIEW, "Submitted",
];

// columns the "Batch Needs Review" correction form is allowed to update -
// validated against this allowlist before being interpolated into the
// dynamic UPDATE below
const CORRECTABLE_FIELDS = [
  "brand", "type_designation", "alcohol_content", "alcohol_unit",
  "net_contents", "net_contents_unit", "net_contents_secondary",
  "producer", "country", "is_imported", "warning",
  "age_statement", "color_disclosure", "sulfite_aspartame",
  "sulfite_declaration", "commodity_statement", "appellation_of_origin",
  "percentage_foreign_wine",
];

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await ensureTable();
  await ensureHistoryTables();

  const { id } = await params;
  const body = await request.json();
  const status = String(body.status || "");

  // bulk-upload batch rows are updated in place (no history-table move) -
  // claiming for processing, recording assessment results, or resubmitting
  // after a "Batch Needs Review" correction
  if (BATCH_INPLACE_STATUSES.includes(status)) {
    return handleBatchStatusUpdate(id, status, body);
  }

  if (!["Approved", "Rejected"].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const { rows } = await sql.query(`${SUBMISSION_WITH_ASSESSMENT_SELECT} WHERE s.id = $1`, [id]);
  if (rows.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const row = rows[0];

  const rejectionReasons = status === "Rejected" ? JSON.stringify(body.rejectionReasons || []) : null;
  const rejectionComment = status === "Rejected" ? String(body.rejectionComment || "") : null;
  const fieldMatches = row.assessment_field_matches === null || row.assessment_field_matches === undefined
    ? null
    : JSON.stringify(row.assessment_field_matches);
  const imageUrls = row.image_urls === null || row.image_urls === undefined
    ? null
    : JSON.stringify(row.image_urls);

  const targetTable = status === "Approved" ? APPROVED_TABLE : REJECTED_TABLE;

  // the assigned reviewer signs off on the decision and is stamped with an
  // official-looking certificate number for traceability
  const decidedBy = row.assigned_to;
  const certificateNumber = generateCertificateNumber();

  await sql.query(
    `INSERT INTO ${targetTable} (
      id, brand, type_designation, alcohol_content, net_contents, producer, country, warning,
      assessment_score, image_url, image_urls, status, submitted_at, is_imported, age_statement, color_disclosure,
      sulfite_aspartame, sulfite_declaration, commodity_statement, appellation_of_origin, percentage_foreign_wine,
      alcohol_unit, net_contents_unit, net_contents_secondary, rejection_reasons, rejection_comment,
      assessment_blurry, assessment_flash, assessment_warning_present, assessment_surgeon_general,
      assessment_ocr_confidence, assessment_field_matches, assigned_to, decided_by, certificate_number, batch_id
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8,
      $9, $10, $11::jsonb, $12, $13, $14, $15, $16,
      $17, $18, $19, $20, $21,
      $22, $23, $24, $25::jsonb, $26,
      $27, $28, $29, $30,
      $31, $32::jsonb, $33, $34, $35, $36
    )`,
    [
      row.id, row.brand, row.type_designation, row.alcohol_content, row.net_contents, row.producer, row.country, row.warning,
      row.assessment_score, row.image_url, imageUrls, status, row.submitted_at, row.is_imported, row.age_statement, row.color_disclosure,
      row.sulfite_aspartame, row.sulfite_declaration, row.commodity_statement, row.appellation_of_origin, row.percentage_foreign_wine,
      row.alcohol_unit, row.net_contents_unit, row.net_contents_secondary, rejectionReasons, rejectionComment,
      row.assessment_blurry, row.assessment_flash, row.assessment_warning_present, row.assessment_surgeon_general,
      row.assessment_ocr_confidence, fieldMatches, row.assigned_to, decidedBy, certificateNumber, row.batch_id,
    ]
  );

  // remove from the active queue now that it's been moved to the history table
  await sql`DELETE FROM assessments WHERE submission_id = ${id}`;
  await sql`DELETE FROM submissions WHERE id = ${id}`;

  return NextResponse.json({
    ...row,
    status,
    rejection_reasons: body.rejectionReasons || null,
    rejection_comment: rejectionComment,
    decided_at: new Date().toISOString(),
    decided_by: decidedBy,
    certificate_number: certificateNumber,
  });
}

// in-place status/assessment updates for bulk-upload batch rows (no
// history-table move - these stay in `submissions` until "Submitted")
async function handleBatchStatusUpdate(id: string, status: string, body: any) {
  if (status === BATCH_STATUSES.PROCESSING) {
    // claim a "Batch Queued" row, or reclaim one whose claim has gone stale
    // (e.g. the tab that claimed it was closed mid-processing)
    const staleThreshold = new Date(Date.now() - STALE_CLAIM_MS).toISOString();
    const result = await sql`
      UPDATE submissions SET status = ${BATCH_STATUSES.PROCESSING}, batch_claimed_at = now()
      WHERE id = ${id}
        AND (status = ${BATCH_STATUSES.QUEUED}
          OR (status = ${BATCH_STATUSES.PROCESSING} AND batch_claimed_at < ${staleThreshold}))
    `;
    if (result.rowCount === 0) {
      return NextResponse.json({ claimed: false }, { status: 409 });
    }
    return NextResponse.json({ claimed: true });
  }

  if (status === BATCH_STATUSES.READY || status === BATCH_STATUSES.NEEDS_REVIEW) {
    const a = body.assessment || {};
    const score = a.score ?? null;
    const fieldMatchesJson = a.fieldMatches ? JSON.stringify(a.fieldMatches) : null;

    await sql`UPDATE submissions SET status = ${status}, assessment_score = ${score} WHERE id = ${id}`;
    await sql`
      UPDATE assessments SET
        blurry = ${a.blurry ?? null},
        flash = ${a.flash ?? null},
        warning_present = ${a.warningPresent ?? null},
        surgeon_general = ${a.surgeonGeneral ?? null},
        ocr_confidence = ${a.ocrConfidence ?? null},
        assessment_score = ${score},
        field_matches = ${fieldMatchesJson}::jsonb,
        ocr_raw = ${a.ocrRaw ?? null}
      WHERE submission_id = ${id}
    `;
  } else if (status === "Submitted") {
    // resubmit from "Batch Needs Review": optionally apply corrected field
    // values + recomputed assessment alongside the status change
    const fields = body.fields || {};
    const a = body.assessment;

    const correctedEntries = Object.entries(fields).filter(([key]) => CORRECTABLE_FIELDS.includes(key));
    if (correctedEntries.length > 0) {
      const setClauses: string[] = [];
      const values: any[] = [];
      for (const [key, value] of correctedEntries) {
        setClauses.push(`${key} = $${values.length + 1}`);
        values.push(value);
      }
      values.push(id);
      await sql.query(`UPDATE submissions SET ${setClauses.join(", ")} WHERE id = $${values.length}`, values);
    }

    if (a) {
      const score = a.score ?? null;
      const fieldMatchesJson = a.fieldMatches ? JSON.stringify(a.fieldMatches) : null;
      await sql`UPDATE submissions SET assessment_score = ${score} WHERE id = ${id}`;
      await sql`
        UPDATE assessments SET
          blurry = ${a.blurry ?? null},
          flash = ${a.flash ?? null},
          warning_present = ${a.warningPresent ?? null},
          surgeon_general = ${a.surgeonGeneral ?? null},
          ocr_confidence = ${a.ocrConfidence ?? null},
          assessment_score = ${score},
          field_matches = ${fieldMatchesJson}::jsonb,
          ocr_raw = ${a.ocrRaw ?? null}
        WHERE submission_id = ${id}
      `;
    }

    await sql`UPDATE submissions SET status = 'Submitted' WHERE id = ${id}`;
  }

  const { rows } = await sql.query(`${SUBMISSION_WITH_ASSESSMENT_SELECT} WHERE s.id = $1`, [id]);
  if (rows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(rows[0]);
}
