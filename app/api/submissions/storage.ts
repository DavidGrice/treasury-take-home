import { put } from "@vercel/blob";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

// uploads each file to Vercel Blob (if configured), falling back to local
// disk under public/uploads otherwise. Returns the public URL for each file
// in the same order as `files`.
export async function uploadImages(id: string, files: File[]): Promise<string[]> {
  const imageUrls: string[] = [];
  for (const uploadFile of files) {
    let url: string | null = null;
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        const blob = await put(`images/${id}-${uploadFile.name}`, uploadFile, {
          access: "public",
          addRandomSuffix: true,
          token: process.env.BLOB_READ_WRITE_TOKEN,
        });
        url = blob.url;
      } catch (err) {
        console.warn("Vercel Blob upload failed, falling back to local disk:", err);
      }
    }
    if (!url) {
      const uploadsDir = path.join(process.cwd(), "public", "uploads");
      await mkdir(uploadsDir, { recursive: true });
      const safeName = `${id}-${files.indexOf(uploadFile)}-${uploadFile.name}`.replace(/[^a-zA-Z0-9._-]/g, "_");
      const buffer = Buffer.from(await uploadFile.arrayBuffer());
      await writeFile(path.join(uploadsDir, safeName), buffer);
      url = `/uploads/${safeName}`;
    }
    imageUrls.push(url);
  }
  return imageUrls;
}
