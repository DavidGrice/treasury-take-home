"use client";

import React, { useState } from "react";
import Button from "../../../components/ui/Button";

export default function ClientUploadPage() {
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    // TODO: replace with API upload
    await new Promise((r) => setTimeout(r, 700));
    console.log("upload", { name, file });
    setSubmitting(false);
    alert("Submitted (placeholder)");
  };

  return (
    <div className="auth-layout">
      <div className="card">
        <h1 style={{ marginTop: 0 }}>Client Upload</h1>
        <p className="text-lg">Use this page to upload or fill client forms.</p>

        <form onSubmit={handleSubmit} style={{ marginTop: 16 }}>
          <div className="form-row">
            <label className="text-sm">Full name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Citizen" />
          </div>

          <div className="form-row">
            <label className="text-sm">Form file</label>
            <input
              type="file"
              onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)}
            />
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Submitting..." : "Upload and Continue"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => { setName(""); setFile(null); }}>Clear</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
