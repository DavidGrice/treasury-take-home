"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardBox from "../../../components/ui/DashboardBox";
import SectionTitle from "../../../components/ui/SectionTitle";
import Button from "../../../components/ui/Button";
import Modal from "../../../components/ui/Modal";
import MessageBox from "../../../components/ui/MessageBox";
import { BULK_UPLOAD_FORMAT_SPEC, EXAMPLE_ROW, buildCsvTemplate } from "@/lib/domain/bulkUploadFormatSpec";

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
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ batch_id: string; count: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);

  const csvInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const setCsv = (file: File | null) => {
    setCsvFile(file);
    setResult(null);
    setUploadResult(null);
    setError(null);
  };

  const setPhotos = (files: File[]) => {
    setPhotoFiles(files);
    setResult(null);
    setUploadResult(null);
    setError(null);
  };

  const removePhoto = (index: number) => {
    setPhotos(photoFiles.filter((_, i) => i !== index));
  };

  useEffect(() => {
    const urls = photoFiles.map((f) => URL.createObjectURL(f));
    setPhotoPreviews(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [photoFiles]);

  const onCsvChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCsv(e.target.files?.[0] || null);
  };

  const addPhotos = (files: File[]) => {
    if (files.length === 0) return;
    const existingNames = new Set(photoFiles.map((f) => f.name));
    const merged = [...photoFiles, ...files.filter((f) => !existingNames.has(f.name))];
    setPhotos(merged);
  };

  const onPhotosChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    addPhotos(e.target.files ? Array.from(e.target.files) : []);
    e.target.value = "";
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const onCsvDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) setCsv(file);
  };

  const onPhotosDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
    addPhotos(files);
  };

  const downloadTemplate = () => {
    const blob = new Blob([buildCsvTemplate()], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bulk-upload-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const validate = async () => {
    if (!csvFile) {
      setError("Please choose a CSV file.");
      return;
    }
    setError(null);
    setUploadResult(null);

    const { parseCSV, mapCsvRowToSubmissionFields } = await import("@/lib/domain/csvParser");
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
    setUploadError(null);
    setUploadProgress({ done: 0, total: result.validRows.length });
    setShowUploadModal(true);
    try {
      const formData = new FormData();
      formData.append("rows", JSON.stringify(result.validRows));
      const photosByName = new Map(photoFiles.map((f) => [f.name, f]));
      for (const row of result.validRows) {
        const file = photosByName.get(row.filename);
        if (file) formData.append("files", file);
      }

      const res = await fetch("/api/submissions/batch", { method: "POST", body: formData });
      if (!res.ok || !res.body) throw new Error(`Request failed: ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalResult: { batch_id: string; count: number } | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newlineIdx;
        while ((newlineIdx = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, newlineIdx).trim();
          buffer = buffer.slice(newlineIdx + 1);
          if (!line) continue;
          const msg = JSON.parse(line);
          if (msg.type === "progress") {
            setUploadProgress({ done: msg.done, total: msg.total });
          } else if (msg.type === "done") {
            finalResult = { batch_id: msg.batch_id, count: msg.count };
          } else if (msg.type === "error") {
            throw new Error(msg.error);
          }
        }
      }

      if (!finalResult) throw new Error("Upload did not complete");
      setUploadResult(finalResult);
      setResult(null);
      setCsvFile(null);
      setPhotoFiles([]);
    } catch (err) {
      console.error("Bulk upload failed:", err);
      setUploadError("Failed to upload batch. Please try again.");
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
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
            <Button type="button" variant="secondary" onClick={() => setShowGuide(true)} style={{ background: "#fef9c3", border: "1px solid #fde047", color: "#000" }}>
              Format guide
            </Button>
          </div>

          <div className="form-row" style={{ marginTop: 32 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label style={{ fontSize: 16, fontWeight: 700 }}>CSV file</label>
              <Button type="button" variant="secondary" onClick={downloadTemplate} style={{ background: "#dcfce7", border: "1px solid #86efac", color: "#000", padding: "4px 10px", fontSize: 13 }}>
                ⬇ Download CSV template
              </Button>
            </div>
            <div className="upload-area upload-area--compact" onDrop={onCsvDrop} onDragOver={onDragOver}>
              {csvFile ? (
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontWeight: 600, wordBreak: "break-all" }}>{csvFile.name}</div>
                  <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 10 }}>
                    <Button type="button" variant="secondary" onClick={() => csvInputRef.current?.click()}>Replace file</Button>
                    <Button type="button" variant="secondary" onClick={() => setCsv(null)}>Remove</Button>
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: "center" }}>
                  <div className="upload-drop">Drop a CSV file here or</div>
                  <div style={{ marginTop: 10 }}>
                    <Button type="button" variant="secondary" onClick={() => csvInputRef.current?.click()}>Browse files</Button>
                  </div>
                </div>
              )}
              <input ref={csvInputRef} type="file" accept=".csv,text/csv" onChange={onCsvChange} style={{ display: "none" }} />
            </div>
          </div>

          <div className="form-row">
            <label style={{ fontSize: 16, fontWeight: 700 }}>Label photos</label>
            <div className="upload-area upload-area--compact" onDrop={onPhotosDrop} onDragOver={onDragOver}>
              {photoFiles.length > 0 ? (
                <div style={{ textAlign: "center", width: "100%" }}>
                  <div style={{ fontWeight: 600 }}>{photoFiles.length} photo(s) selected</div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", maxHeight: 220, overflowY: "auto", marginTop: 10, padding: 4 }}>
                    {photoFiles.map((f, i) => (
                      <div key={`${f.name}-${i}`} style={{ position: "relative", width: 84 }}>
                        <div style={{ position: "relative", width: 84, height: 84, borderRadius: 6, overflow: "hidden", border: "1px solid #ddd" }}>
                          <img src={photoPreviews[i]} alt={f.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          <button
                            type="button"
                            onClick={() => removePhoto(i)}
                            aria-label={`Remove ${f.name}`}
                            style={{
                              position: "absolute", top: 2, right: 2, width: 18, height: 18, lineHeight: "16px",
                              borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.6)", color: "#fff",
                              fontSize: 12, cursor: "pointer", padding: 0,
                            }}
                          >
                            ×
                          </button>
                        </div>
                        <div style={{ fontSize: 11, color: "#555", wordBreak: "break-all", marginTop: 4 }}>{f.name}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 10 }}>
                    <Button type="button" variant="secondary" onClick={() => photoInputRef.current?.click()}>Add more photos</Button>
                    <Button type="button" variant="secondary" onClick={() => setPhotos([])}>Remove all</Button>
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: "center" }}>
                  <div className="upload-drop">Drop label photos here or</div>
                  <div style={{ marginTop: 10 }}>
                    <Button type="button" variant="secondary" onClick={() => photoInputRef.current?.click()}>Browse files</Button>
                  </div>
                </div>
              )}
              <input ref={photoInputRef} type="file" accept="image/*" multiple onChange={onPhotosChange} style={{ display: "none" }} />
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 24 }}>
            <Button onClick={validate} disabled={!csvFile || uploading}>Validate</Button>
            {result && result.validRows.length > 0 && (
              <Button onClick={upload} disabled={uploading}>
                {uploading ? "Uploading..." : `Upload ${result.validRows.length} valid row(s)`}
              </Button>
            )}
          </div>

          {error && (
            <MessageBox variant="error" style={{ marginTop: 16, color: "#991b1b" }}>
              {error}
            </MessageBox>
          )}

          {result && (
            <div style={{ marginTop: 16 }}>
              <MessageBox variant="success">
                {result.validRows.length} valid row(s) ready to queue.
              </MessageBox>
              {result.invalidRows.length > 0 && (
                <MessageBox variant="error" style={{ marginTop: 12 }}>
                  <strong>{result.invalidRows.length} row(s) skipped — fix and re-upload separately:</strong>
                  <ul style={{ marginTop: 8, marginBottom: 0 }}>
                    {result.invalidRows.map((r, i) => (
                      <li key={i} style={{ marginBottom: 4 }}>
                        <strong>{r.filename}</strong>: {r.errors.join("; ")}
                      </li>
                    ))}
                  </ul>
                </MessageBox>
              )}
            </div>
          )}

        </div>
      </DashboardBox>

      {showUploadModal && (
        <Modal
          className="modal-content--narrow"
          onClose={() => {
            if (uploading) return;
            setShowUploadModal(false);
            setUploadError(null);
          }}
        >
          {uploading ? (
            <div className="spinner-container">
              <div className="spinner" />
              <div>
                Uploading batch...
                {uploadProgress && uploadProgress.total > 0 && ` ${uploadProgress.done} of ${uploadProgress.total}`}
              </div>
              {uploadProgress && uploadProgress.total > 0 && (
                <div style={{ width: "100%", maxWidth: 240, height: 8, background: "#e5e7eb", borderRadius: 4, overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      background: "#0b5fff",
                      width: `${Math.round((uploadProgress.done / uploadProgress.total) * 100)}%`,
                      transition: "width 150ms ease",
                    }}
                  />
                </div>
              )}
            </div>
          ) : uploadError ? (
            <div style={{ textAlign: "center", padding: "8px 4px" }}>
              <SectionTitle>Upload Failed</SectionTitle>
              <p style={{ color: "#991b1b" }}>{uploadError}</p>
              <div style={{ marginTop: 16 }}>
                <Button
                  onClick={() => {
                    setShowUploadModal(false);
                    setUploadError(null);
                  }}
                >
                  Close
                </Button>
              </div>
            </div>
          ) : uploadResult ? (
            <div style={{ textAlign: "center", padding: "8px 4px" }}>
              <SectionTitle>Upload Complete</SectionTitle>
              <p>
                Queued {uploadResult.count} application(s) in batch {uploadResult.batch_id}.
              </p>
              <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
                <Button onClick={() => router.push(`/client/batch-review?batch_id=${uploadResult.batch_id}`)}>
                  Go to Batch Review
                </Button>
                <Button variant="secondary" onClick={() => setShowUploadModal(false)}>
                  Close
                </Button>
              </div>
            </div>
          ) : null}
        </Modal>
      )}

      {showGuide && (
        <Modal onClose={() => setShowGuide(false)} className="modal-content--wide">
          <SectionTitle>Bulk Upload Format Guide</SectionTitle>

          <div style={{ background: "#eef4ff", borderLeft: "4px solid #0b5fff", borderRadius: 4, padding: "8px 12px", marginTop: 16 }}>
            <h3 style={{ margin: 0 }}>CSV columns</h3>
          </div>
          <div style={{ padding: "12px 4px 24px" }}>
            <p className="text-sm" style={{ color: "#555", marginTop: 0 }}>
              The first row of the CSV must contain these column names exactly. One row = one application = one label photo.
            </p>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>
                    <th style={{ padding: "6px 8px" }}>Column</th>
                    <th style={{ padding: "6px 8px" }}>Required?</th>
                    <th style={{ padding: "6px 8px" }}>Allowed values / notes</th>
                  </tr>
                </thead>
                <tbody>
                  {BULK_UPLOAD_FORMAT_SPEC.csvColumns.map((col) => (
                    <tr key={col.name} style={{ borderBottom: "1px solid #f2f2f2" }}>
                      <td style={{ padding: "6px 8px", fontFamily: "monospace", whiteSpace: "nowrap" }}>{col.name}</td>
                      <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                        {col.required === true ? "Required" : col.required === "conditional" ? "Conditional" : "Optional"}
                      </td>
                      <td style={{ padding: "6px 8px" }}>
                        {col.allowedValues && (
                          <div>One of: {col.allowedValues.join(", ")}</div>
                        )}
                        {col.appliesTo && (
                          <div>Applies to: {col.appliesTo.join(", ")}</div>
                        )}
                        {col.description && <div>{col.description}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 16, padding: 12, background: "#f9fafb", border: "1px solid #eee", borderRadius: 6 }}>
              <strong className="text-sm">Example row</strong>
              <p className="text-sm" style={{ color: "#555", marginTop: 4 }}>
                Here's what a single filled-in CSV row looks like (also included in the downloadable template):
              </p>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <tbody>
                    {BULK_UPLOAD_FORMAT_SPEC.csvColumns.map((col) => (
                      <tr key={col.name} style={{ borderBottom: "1px solid #f2f2f2" }}>
                        <td style={{ padding: "4px 8px", fontFamily: "monospace", whiteSpace: "nowrap", color: "#555" }}>{col.name}</td>
                        <td style={{ padding: "4px 8px", fontFamily: "monospace" }}>{EXAMPLE_ROW[col.name] || <span style={{ color: "#aaa" }}>(blank)</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div style={{ background: "#eef4ff", borderLeft: "4px solid #0b5fff", borderRadius: 4, padding: "8px 12px" }}>
            <h3 style={{ margin: 0 }}>Label photos</h3>
          </div>
          <div style={{ padding: "12px 4px 4px" }}>
            <p className="text-sm" style={{ color: "#555", marginTop: 0 }}>
              {BULK_UPLOAD_FORMAT_SPEC.photos.accepted}
              <br />
              {BULK_UPLOAD_FORMAT_SPEC.photos.matching}
            </p>
            <div style={{ marginTop: 8, padding: 12, background: "#f9fafb", border: "1px solid #eee", borderRadius: 6 }}>
              <strong className="text-sm">Example</strong>
              <p className="text-sm" style={{ color: "#555", marginTop: 4, marginBottom: 0 }}>
                The example row above has <code>image</code> = <code>{EXAMPLE_ROW.image}</code>, so one of your
                uploaded photos must be named exactly <code>{EXAMPLE_ROW.image}</code> (matching is case-sensitive).
              </p>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
