import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { ensureTable, ensureHistoryTables, SUBMISSION_WITH_ASSESSMENT_SELECT, APPROVED_TABLE, REJECTED_TABLE, generateCertificateNumber } from "../db";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await ensureTable();
  await ensureHistoryTables();

  const { id } = await params;
  const body = await request.json();
  const status = String(body.status || "");

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

  const targetTable = status === "Approved" ? APPROVED_TABLE : REJECTED_TABLE;

  // the assigned reviewer signs off on the decision and is stamped with an
  // official-looking certificate number for traceability
  const decidedBy = row.assigned_to;
  const certificateNumber = generateCertificateNumber();

  await sql.query(
    `INSERT INTO ${targetTable} (
      id, brand, type_designation, alcohol_content, net_contents, producer, country, warning,
      assessment_score, image_url, status, submitted_at, is_imported, age_statement, color_disclosure,
      sulfite_aspartame, sulfite_declaration, commodity_statement, appellation_of_origin, percentage_foreign_wine,
      alcohol_unit, net_contents_unit, net_contents_secondary, rejection_reasons, rejection_comment,
      assessment_blurry, assessment_flash, assessment_warning_present, assessment_surgeon_general,
      assessment_ocr_confidence, assessment_field_matches, assigned_to, decided_by, certificate_number
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8,
      $9, $10, $11, $12, $13, $14, $15,
      $16, $17, $18, $19, $20,
      $21, $22, $23, $24::jsonb, $25,
      $26, $27, $28, $29,
      $30, $31::jsonb, $32, $33, $34
    )`,
    [
      row.id, row.brand, row.type_designation, row.alcohol_content, row.net_contents, row.producer, row.country, row.warning,
      row.assessment_score, row.image_url, status, row.submitted_at, row.is_imported, row.age_statement, row.color_disclosure,
      row.sulfite_aspartame, row.sulfite_declaration, row.commodity_statement, row.appellation_of_origin, row.percentage_foreign_wine,
      row.alcohol_unit, row.net_contents_unit, row.net_contents_secondary, rejectionReasons, rejectionComment,
      row.assessment_blurry, row.assessment_flash, row.assessment_warning_present, row.assessment_surgeon_general,
      row.assessment_ocr_confidence, fieldMatches, row.assigned_to, decidedBy, certificateNumber,
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
