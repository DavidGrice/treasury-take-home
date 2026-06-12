"use client";
import React from "react";
import SectionTitle from "./SectionTitle";
import { getEmployeeName } from "./employees";

export default function AcceptedReviewModal({ submission }: { submission: any }) {
  return (
    <div style={{ padding: 8, display: "flex", flexDirection: "column", height: "75vh" }}>
      <SectionTitle>Approved Submission</SectionTitle>
      <div style={{ overflowY: "auto", flex: 1 }}>
        <div style={{ padding: 12, marginBottom: 16, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 6, color: "#166534" }}>
          <p style={{ margin: 0, fontWeight: 600 }}>Status: Approved</p>
          <p style={{ margin: "6px 0 0" }}>
            This Certificate of Label Approval (COLA) has been reviewed and approved by TTB. The label may be used as submitted.
          </p>
        </div>

        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 280px" }}>
            <div className="fields-area">
              <div className="field-row">
                <label className="field-label">TTB ID</label>
                <div className="field-input" style={{ background: "#f9f9f9" }}>{submission.id}</div>
              </div>
              <div className="field-row">
                <label className="field-label">Status</label>
                <div className="field-input" style={{ background: "#f9f9f9" }}>Approved</div>
              </div>
              <div className="field-row">
                <label className="field-label">Approval Date</label>
                <div className="field-input" style={{ background: "#f9f9f9" }}>
                  {submission.decided_at ? new Date(submission.decided_at).toLocaleString() : "—"}
                </div>
              </div>
              <div className="field-row">
                <label className="field-label">Brand Name</label>
                <div className="field-input" style={{ background: "#f9f9f9" }}>{submission.brand || "—"}</div>
              </div>
              <div className="field-row">
                <label className="field-label">Class / Type</label>
                <div className="field-input" style={{ background: "#f9f9f9" }}>{submission.type_designation || "—"}</div>
              </div>
              <div className="field-row">
                <label className="field-label">Qualifications</label>
                <div className="field-input" style={{ background: "#f9f9f9" }}>None</div>
              </div>
            </div>
          </div>
          <div style={{ flex: "1 1 280px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {submission.image_url ? (
              <img
                src={submission.image_url}
                alt="Approved label"
                style={{ maxWidth: "100%", maxHeight: 420, objectFit: "contain", borderRadius: 8, border: "1px solid #eee" }}
              />
            ) : (
              <div style={{ color: "#666" }}>No image uploaded.</div>
            )}
          </div>
        </div>

        {submission.image_url && (
          <div style={{ marginTop: 12, textAlign: "center" }}>
            <a
              href={submission.image_url}
              target="_blank"
              rel="noopener noreferrer"
              download
              className="btn"
              style={{
                display: "inline-block",
                padding: "10px 18px",
                background: "#1e3a8a",
                border: "1px solid #1e3a8a",
                borderRadius: 6,
                color: "#ffffff",
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              Click to download printable version
            </a>
          </div>
        )}

        <div style={{ marginTop: 20, padding: 16, border: "1px solid #d1d5db", borderRadius: 6, background: "#f9fafb" }}>
          <p style={{ margin: "0 0 10px", fontWeight: 700, color: "#374151", textTransform: "uppercase", fontSize: 12, letterSpacing: "0.05em" }}>
            Certificate of Authenticity
          </p>
          <div className="fields-area">
            <div className="field-row">
              <label className="field-label">Certified By</label>
              <div className="field-input" style={{ background: "#fff" }}>{getEmployeeName(submission.decided_by)}</div>
            </div>
            <div className="field-row">
              <label className="field-label">Employee ID</label>
              <div className="field-input" style={{ background: "#fff" }}>{submission.decided_by || "—"}</div>
            </div>
            <div className="field-row">
              <label className="field-label">Certificate No.</label>
              <div className="field-input" style={{ background: "#fff", fontFamily: "monospace" }}>{submission.certificate_number || "—"}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
