import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { ensureTable, ensureHistoryTables, APPROVED_TABLE, REJECTED_TABLE } from "../db";

export async function GET() {
  await ensureTable();
  await ensureHistoryTables();

  const queued = await sql`SELECT COUNT(*)::int AS count FROM submissions WHERE status = 'Submitted'`;
  const approved = await sql.query(`SELECT COUNT(*)::int AS count FROM ${APPROVED_TABLE}`);
  const rejected = await sql.query(`SELECT COUNT(*)::int AS count FROM ${REJECTED_TABLE}`);

  return NextResponse.json({
    queued: queued.rows[0].count,
    approved: approved.rows[0].count,
    rejected: rejected.rows[0].count,
  });
}
