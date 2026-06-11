import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { sql } from "@vercel/postgres";

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
      producer, country, warning, assessment_score, image_url
    ) VALUES (
      ${id}, ${brand}, ${typeDesignation}, ${alcoholContent}, ${netContents},
      ${producer}, ${country}, ${warning}, ${assessmentScore}, ${imageUrl}
    )
    RETURNING *
  `;

  return NextResponse.json(rows[0], { status: 201 });
}
