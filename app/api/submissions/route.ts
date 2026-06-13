import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { ensureTable, SUBMISSION_WITH_ASSESSMENT_SELECT, generateSubmissionId, assignReviewer } from "./db";
import { uploadImages } from "./storage";

export async function GET() {
  await ensureTable();
  const { rows } = await sql.query(`${SUBMISSION_WITH_ASSESSMENT_SELECT} ORDER BY s.submitted_at DESC`);
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  await ensureTable();

  const form = await request.formData();
  const id = String(form.get("id") || generateSubmissionId());
  const assignedTo = assignReviewer();
  const brand = String(form.get("brand") || "");
  const typeDesignation = String(form.get("typeDesignation") || "");
  const alcoholContent = String(form.get("alcoholContent") || "");
  const alcoholUnit = String(form.get("alcoholUnit") || "");
  const netContents = String(form.get("netContents") || "");
  const netContentsUnit = String(form.get("netContentsUnit") || "");
  const netContentsSecondary = String(form.get("netContentsSecondary") || "");
  const producer = String(form.get("producer") || "");
  const producerCity = String(form.get("producerCity") || "");
  const producerState = String(form.get("producerState") || "");
  const country = String(form.get("country") || "");
  const warning = String(form.get("warning") || "");
  const assessmentScoreRaw = form.get("assessmentScore");
  const assessmentScore = assessmentScoreRaw === null || assessmentScoreRaw === "" ? null : Number(assessmentScoreRaw);

  const isImported = String(form.get("isImported") || "");
  const ageStatement = String(form.get("ageStatement") || "");
  const colorDisclosure = String(form.get("colorDisclosure") || "");
  const sulfiteAspartame = String(form.get("sulfiteAspartame") || "");
  const sulfiteDeclaration = String(form.get("sulfiteDeclaration") || "");
  const commodityStatement = String(form.get("commodityStatement") || "");
  const appellationOfOrigin = String(form.get("appellationOfOrigin") || "");
  const percentageForeignWine = String(form.get("percentageForeignWine") || "");

  const parseBool = (v: FormDataEntryValue | null) => (v === null || v === "" ? null : v === "true");
  const blurry = parseBool(form.get("blurry"));
  const flash = parseBool(form.get("flash"));
  const warningPresent = parseBool(form.get("warningPresent"));
  const surgeonGeneral = parseBool(form.get("surgeonGeneral"));
  const ocrConfidenceRaw = form.get("ocrConfidence");
  const ocrConfidence = ocrConfidenceRaw === null || ocrConfidenceRaw === "" ? null : Number(ocrConfidenceRaw);
  const fieldMatchesRaw = form.get("fieldMatches");
  const fieldMatchesJson = fieldMatchesRaw ? String(fieldMatchesRaw) : null;

  // accept multiple photos under the repeated "files" key, falling back to
  // the legacy single "file" key for older clients
  const uploadFiles = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (uploadFiles.length === 0) {
    const legacyFile = form.get("file");
    if (legacyFile instanceof File && legacyFile.size > 0) uploadFiles.push(legacyFile);
  }

  const imageUrls = await uploadImages(id, uploadFiles);
  const imageUrl = imageUrls[0] ?? null;

  await sql`
    INSERT INTO submissions (
      id, brand, type_designation, alcohol_content, net_contents,
      producer, country, warning, assessment_score, image_url, image_urls,
      is_imported, producer_city, producer_state, age_statement, color_disclosure, sulfite_aspartame,
      sulfite_declaration, commodity_statement, appellation_of_origin, percentage_foreign_wine,
      alcohol_unit, net_contents_unit, net_contents_secondary, assigned_to
    ) VALUES (
      ${id}, ${brand}, ${typeDesignation}, ${alcoholContent}, ${netContents},
      ${producer}, ${country}, ${warning}, ${assessmentScore}, ${imageUrl}, ${JSON.stringify(imageUrls)}::jsonb,
      ${isImported}, ${producerCity}, ${producerState}, ${ageStatement}, ${colorDisclosure}, ${sulfiteAspartame},
      ${sulfiteDeclaration}, ${commodityStatement}, ${appellationOfOrigin}, ${percentageForeignWine},
      ${alcoholUnit}, ${netContentsUnit}, ${netContentsSecondary}, ${assignedTo}
    )
  `;

  await sql`
    INSERT INTO assessments (
      submission_id, blurry, flash, warning_present, surgeon_general,
      ocr_confidence, assessment_score, field_matches
    ) VALUES (
      ${id}, ${blurry}, ${flash}, ${warningPresent}, ${surgeonGeneral},
      ${ocrConfidence}, ${assessmentScore}, ${fieldMatchesJson}::jsonb
    )
  `;

  // return the full row, including the joined assessment fields, so the
  // client can immediately render "View" without a page refresh
  const { rows } = await sql.query(`${SUBMISSION_WITH_ASSESSMENT_SELECT} WHERE s.id = $1`, [id]);

  return NextResponse.json(rows[0], { status: 201 });
}
