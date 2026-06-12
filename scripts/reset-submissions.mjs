// One-off maintenance script: clears all submission rows and their uploaded
// label images, so the table can be repopulated cleanly under the new schema.
import { config } from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, "..", ".env.local") });

const { sql } = await import("@vercel/postgres");
const { list, del } = await import("@vercel/blob");

const { rowCount } = await sql`DELETE FROM submissions`;
console.log(`Deleted ${rowCount} submission row(s).`);

let cursor;
let totalBlobs = 0;
do {
  const result = await list({ prefix: "submissions/", cursor, limit: 1000 });
  if (result.blobs.length > 0) {
    await del(result.blobs.map((b) => b.url));
    totalBlobs += result.blobs.length;
  }
  cursor = result.cursor;
} while (cursor);

console.log(`Deleted ${totalBlobs} blob(s) under submissions/.`);
