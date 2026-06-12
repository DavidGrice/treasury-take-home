import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { ensureTable, ensureHistoryTables, ALL_SUBMISSIONS_QUERY } from "../db";

// returns every submission regardless of status (pending + approved + rejected),
// for clients to see the full history of their uploads
export async function GET() {
  await ensureTable();
  await ensureHistoryTables();
  const { rows } = await sql.query(ALL_SUBMISSIONS_QUERY);
  return NextResponse.json(rows);
}
