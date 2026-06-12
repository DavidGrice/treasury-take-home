"use client";
import React from "react";
import { BASE_FIELDS, DB_TO_CHECKLIST_KEY, IMAGE_QUALITY_FIELDS, applicableExtraFields, fieldValue } from "./submissionFields";
import { getChecklistItems } from "./checklistData";
import SectionTitle from "./SectionTitle";
import { getEmployeeName } from "./employees";

export default function RejectionReviewModal({ submission }: { submission: any }) {
  const rejectedLabels: string[] = Array.isArray(submission.rejection_reasons) ? submission.rejection_reasons : [];
  const allFields = [...BASE_FIELDS, ...applicableExtraFields(submission)];
  const rejectedImageQualityFields = IMAGE_QUALITY_FIELDS.filter((f) => rejectedLabels.includes(f.label));

  return (
    <div style={{ padding: 8, display: "flex", flexDirection: "column", height: "75vh" }}>
      <SectionTitle>Rejected Submission</SectionTitle>
      <div style={{ overflowY: "auto", flex: 1 }}>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 280px" }}>
            <div className="fields-area">
              {allFields.map((f) => {
                const isRejected = rejectedLabels.includes(f.label);
                const items = isRejected ? getChecklistItems(submission.type_designation, DB_TO_CHECKLIST_KEY[f.key]) : [];
                return (
                  <div className="field-row" key={f.key}>
                    <label className="field-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {isRejected && <span className="status-icon status-false">✖</span>}
                      {f.label}
                    </label>
                    <div className="field-input" style={{ background: "#f9f9f9" }}>{fieldValue(submission, f.key) || "—"}</div>
                    {isRejected && items.length > 0 && (
                      <div style={{ fontSize: 12, color: "#555", padding: 8, background: "#fff5f5", border: "1px solid #fecaca", borderRadius: 6 }}>
                        {items.map((item) => (
                          <div key={item.mandatory_item_name} style={{ marginBottom: 4 }}>
                            <strong>{item.regulatory_citation}:</strong> {item.description}
                            <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 4 }}>
                              {item.link_to_citation.map((link) => (
                                <a key={link} href={link} target="_blank" rel="noopener noreferrer">{link}</a>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div style={{ flex: "1 1 280px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {submission.image_url ? (
              <img
                src={submission.image_url}
                alt="Submitted label"
                style={{ maxWidth: "100%", maxHeight: 420, objectFit: "contain", borderRadius: 8, border: "1px solid #eee" }}
              />
            ) : (
              <div style={{ color: "#666" }}>No image uploaded.</div>
            )}
          </div>
        </div>

        {rejectedImageQualityFields.length > 0 && (
          <div style={{ marginTop: 16, padding: 12, background: "#fff5f5", border: "1px solid #fecaca", borderRadius: 6 }}>
            <strong>Image quality issues:</strong>
            <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
              {rejectedImageQualityFields.map((f) => (
                <div key={f.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span className="status-icon status-false">✖</span>
                  {f.label}
                </div>
              ))}
            </div>
          </div>
        )}

        {submission.rejection_comment && (
          <div style={{ marginTop: 16, padding: 12, background: "#fff5f5", border: "1px solid #fecaca", borderRadius: 6 }}>
            <strong>Reviewer comments:</strong>
            <p style={{ margin: "6px 0 0" }}>{submission.rejection_comment}</p>
          </div>
        )}

        <div style={{ marginTop: 16, padding: 16, border: "1px solid #d1d5db", borderRadius: 6, background: "#f9fafb" }}>
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
