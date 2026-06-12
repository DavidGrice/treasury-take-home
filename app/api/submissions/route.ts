import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { sql } from "@vercel/postgres";

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
}

export async function GET() {
  await ensureTable();
  const { rows } = await sql`
    SELECT * FROM submissions ORDER BY submitted_at DESC
  `;
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  await ensureTable();

  const form = await request.formData();
  const id = String(form.get("id") || crypto.randomUUID());
  const brand = String(form.get("brand") || "");
  const typeDesignation = String(form.get("typeDesignation") || "");
  const alcoholContent = String(form.get("alcoholContent") || "");
  const netContents = String(form.get("netContents") || "");
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

  let imageUrl: string | null = null;
  const file = form.get("file");
  if (file instanceof File && file.size > 0) {
    const blob = await put(`submissions/${id}-${file.name}`, file, {
      access: "public",
      addRandomSuffix: true,
    });
    imageUrl = blob.url;
  }

  const { rows } = await sql`
    INSERT INTO submissions (
      id, brand, type_designation, alcohol_content, net_contents,
      producer, country, warning, assessment_score, image_url,
      is_imported, age_statement, color_disclosure, sulfite_aspartame,
      sulfite_declaration, commodity_statement, appellation_of_origin, percentage_foreign_wine
    ) VALUES (
      ${id}, ${brand}, ${typeDesignation}, ${alcoholContent}, ${netContents},
      ${producer}, ${country}, ${warning}, ${assessmentScore}, ${imageUrl},
      ${isImported}, ${ageStatement}, ${colorDisclosure}, ${sulfiteAspartame},
      ${sulfiteDeclaration}, ${commodityStatement}, ${appellationOfOrigin}, ${percentageForeignWine}
    )
    RETURNING *
  `;

  return NextResponse.json(rows[0], { status: 201 });
}
