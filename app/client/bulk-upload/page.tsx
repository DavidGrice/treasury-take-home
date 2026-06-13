"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import DashboardBox from "../../../components/ui/DashboardBox";
import SectionTitle from "../../../components/ui/SectionTitle";
import Button from "../../../components/ui/Button";

type ValidRow = { filename: string; fields: Record<string, string> };
type InvalidRow = { filename: string; errors: string[] };

type ParseResult = {
  validRows: ValidRow[];
  invalidRows: InvalidRow[];
};

export default function BulkUploadPage() {
  const router = useRouter();
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ batch_id: string; count: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onCsvChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCsvFile(e.target.files?.[0] || null);
    setResult(null);
    setUploadResult(null);
    setError(null);
  };

  const onPhotosChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhotoFiles(e.target.files ? Array.from(e.target.files) : []);
    setResult(null);
    setUploadResult(null);
    setError(null);
  };

  const validate = async () => {
    if (!csvFile) {
      setError("Please choose a CSV file.");
      return;
    }
    setError(null);
    setUploadResult(null);

    const { parseCSV, mapCsvRowToSubmissionFields } = await import("../../../components/ui/csvParser");
    const text = await csvFile.text();
    const { rows } = parseCSV(text);

    if (rows.length === 0) {
      setError("CSV has no data rows.");
      return;
    }

    const photoNames = new Set(photoFiles.map((f) => f.name));
    const validRows: ValidRow[] = [];
    const invalidRows: InvalidRow[] = [];

    rows.forEach((row, i) => {
      const filename = (row.image || "").trim();
      const { values, errors } = mapCsvRowToSubmissionFields(row);

      if (filename && !photoNames.has(filename)) {
        errors.push(`No uploaded photo matches filename "${filename}"`);
      }

      if (errors.length > 0) {
        invalidRows.push({ filename: filename || `(row ${i + 2})`, errors });
      } else {
        validRows.push({ filename, fields: values });
      }
    });

    setResult({ validRows, invalidRows });
  };

  const upload = async () => {
    if (!result || result.validRows.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("rows", JSON.stringify(result.validRows));
      const photosByName = new Map(photoFiles.map((f) => [f.name, f]));
      for (const row of result.validRows) {
        const file = photosByName.get(row.filename);
        if (file) formData.append("files", file);
      }

      const res = await fetch("/api/submissions/batch", { method: "POST", body: formData });
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      const data = await res.json();
      setUploadResult({ batch_id: data.batch_id, count: data.count });
      setResult(null);
      setCsvFile(null);
      setPhotoFiles([]);
    } catch (err) {
      console.error("Bulk upload failed:", err);
      setError("Failed to upload batch. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ width: "100%", maxWidth: 1200, display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <Button variant="secondary" onClick={() => router.push("/client/dashboard")}>
          ← Back to Dashboard
        </Button>
      </div>
      <DashboardBox>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <SectionTitle>Bulk Upload</SectionTitle>
          <p className="text-sm" style={{ textAlign: "center", color: "#555" }}>
            Upload a CSV of applications (one row per application) along with the label photos.
            Each row's <code>image</code> column must match a photo's filename exactly (case-sensitive).
          </p>

          <div className="form-row" style={{ marginTop: 16 }}>
            <label className="text-sm">CSV file</label>
            <input type="file" accept=".csv,text/csv" onChange={onCsvChange} />
          </div>

          <div className="form-row">
            <label className="text-sm">Label photos</label>
            <input type="file" accept="image/*" multiple onChange={onPhotosChange} />
            {photoFiles.length > 0 && (
              <div className="text-sm" style={{ color: "#555", marginTop: 4 }}>{photoFiles.length} photo(s) selected</div>
            )}
          </div>

          <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
            <Button onClick={validate} disabled={!csvFile || uploading}>Validate</Button>
            {result && result.validRows.length > 0 && (
              <Button onClick={upload} disabled={uploading}>
                {uploading ? "Uploading..." : `Upload ${result.validRows.length} valid row(s)`}
              </Button>
            )}
          </div>

          {error && (
            <div style={{ marginTop: 16, padding: 12, background: "#fff5f5", border: "1px solid #fecaca", borderRadius: 6, color: "#991b1b" }}>
              {error}
            </div>
          )}

          {result && (
            <div style={{ marginTop: 16 }}>
              <div style={{ padding: 12, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 6, color: "#166534" }}>
                {result.validRows.length} valid row(s) ready to queue.
              </div>
              {result.invalidRows.length > 0 && (
                <div style={{ marginTop: 12, padding: 12, background: "#fff5f5", border: "1px solid #fecaca", borderRadius: 6 }}>
                  <strong>{result.invalidRows.length} row(s) skipped — fix and re-upload separately:</strong>
                  <ul style={{ marginTop: 8, marginBottom: 0 }}>
                    {result.invalidRows.map((r, i) => (
                      <li key={i} style={{ marginBottom: 4 }}>
                        <strong>{r.filename}</strong>: {r.errors.join("; ")}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {uploadResult && (
            <div style={{ marginTop: 16, padding: 16, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 6, color: "#166534" }}>
              <p style={{ margin: 0, fontWeight: 600 }}>
                Queued {uploadResult.count} application(s) in batch {uploadResult.batch_id}.
              </p>
              <div style={{ marginTop: 12 }}>
                <Button onClick={() => router.push(`/client/batch-review?batch_id=${uploadResult.batch_id}`)}>
                  Go to Batch Review
                </Button>
              </div>
            </div>
          )}
        </div>
      </DashboardBox>
    </div>
  );
}
