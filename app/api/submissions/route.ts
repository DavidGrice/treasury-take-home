import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { sql } from "@vercel/postgres";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

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

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS submissions (
      id UUID PRIMARY KEY,
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

  await sql`
    CREATE TABLE IF NOT EXISTS assessments (
      submission_id UUID PRIMARY KEY REFERENCES submissions(id),
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
}

const SUBMISSION_WITH_ASSESSMENT_SELECT = `
  SELECT s.*,
    a.blurry AS assessment_blurry,
    a.flash AS assessment_flash,
    a.warning_present AS assessment_warning_present,
    a.surgeon_general AS assessment_surgeon_general,
    a.ocr_confidence AS assessment_ocr_confidence,
    a.field_matches AS assessment_field_matches
  FROM submissions s
  LEFT JOIN assessments a ON a.submission_id = s.id
`;

export async function GET() {
  await ensureTable();
  const { rows } = await sql.query(`${SUBMISSION_WITH_ASSESSMENT_SELECT} ORDER BY s.submitted_at DESC`);
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  await ensureTable();

  const form = await request.formData();
  const id = String(form.get("id") || crypto.randomUUID());
  const brand = String(form.get("brand") || "");
  const typeDesignation = String(form.get("typeDesignation") || "");
  const alcoholContent = String(form.get("alcoholContent") || "");
  const alcoholUnit = String(form.get("alcoholUnit") || "");
  const netContents = String(form.get("netContents") || "");
  const netContentsUnit = String(form.get("netContentsUnit") || "");
  const netContentsSecondary = String(form.get("netContentsSecondary") || "");
  const producer = String(form.get("producer") || "");
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

  let imageUrl: string | null = null;
  const file = form.get("file");
  if (file instanceof File && file.size > 0) {
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        const blob = await put(`images/${id}-${file.name}`, file, {
          access: "public",
          addRandomSuffix: true,
          token: process.env.BLOB_READ_WRITE_TOKEN,
        });
        imageUrl = blob.url;
      } catch (err) {
        console.warn("Vercel Blob upload failed, falling back to local disk:", err);
      }
    }
    if (!imageUrl) {
      // local-disk fallback for environments without a working Blob store
      const uploadsDir = path.join(process.cwd(), "public", "uploads");
      await mkdir(uploadsDir, { recursive: true });
      const safeName = `${id}-${file.name}`.replace(/[^a-zA-Z0-9._-]/g, "_");
      const buffer = Buffer.from(await file.arrayBuffer());
      await writeFile(path.join(uploadsDir, safeName), buffer);
      imageUrl = `/uploads/${safeName}`;
    }
  }

  await sql`
    INSERT INTO submissions (
      id, brand, type_designation, alcohol_content, net_contents,
      producer, country, warning, assessment_score, image_url,
      is_imported, age_statement, color_disclosure, sulfite_aspartame,
      sulfite_declaration, commodity_statement, appellation_of_origin, percentage_foreign_wine,
      alcohol_unit, net_contents_unit, net_contents_secondary
    ) VALUES (
      ${id}, ${brand}, ${typeDesignation}, ${alcoholContent}, ${netContents},
      ${producer}, ${country}, ${warning}, ${assessmentScore}, ${imageUrl},
      ${isImported}, ${ageStatement}, ${colorDisclosure}, ${sulfiteAspartame},
      ${sulfiteDeclaration}, ${commodityStatement}, ${appellationOfOrigin}, ${percentageForeignWine},
      ${alcoholUnit}, ${netContentsUnit}, ${netContentsSecondary}
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
