"use client";
import React from "react";
import { BASE_FIELDS, DB_TO_CHECKLIST_KEY, IMAGE_QUALITY_FIELDS, applicableExtraFields, fieldValue, getImageUrls } from "@/lib/domain/submissionFields";
import { getChecklistItems } from "@/lib/data/checklistData";
import SectionTitle from "./SectionTitle";
import MessageBox from "./MessageBox";
import CertificateBlock from "./CertificateBlock";

export default function RejectionReviewModal({ submission }: { submission: any }) {
  const rejectedLabels: string[] = Array.isArray(submission.rejection_reasons) ? submission.rejection_reasons : [];
  const imageUrls = getImageUrls(submission);
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
                      <MessageBox variant="error" style={{ padding: 8, fontSize: 12, color: "#555" }}>
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
                      </MessageBox>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div style={{ flex: "1 1 280px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {imageUrls.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
                {imageUrls.map((url, i) => (
                  <img
                    key={url + i}
                    src={url}
                    alt={`Submitted label ${i + 1}`}
                    style={{ maxWidth: imageUrls.length > 1 ? 260 : "100%", maxHeight: 420, objectFit: "contain", borderRadius: 8, border: "1px solid #eee" }}
                  />
                ))}
              </div>
            ) : (
              <div style={{ color: "#666" }}>No image uploaded.</div>
            )}
          </div>
        </div>

        {rejectedImageQualityFields.length > 0 && (
          <MessageBox variant="error" style={{ marginTop: 16 }}>
            <strong>Image quality issues:</strong>
            <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
              {rejectedImageQualityFields.map((f) => (
                <div key={f.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span className="status-icon status-false">✖</span>
                  {f.label}
                </div>
              ))}
            </div>
          </MessageBox>
        )}

        {submission.rejection_comment && (
          <MessageBox variant="error" style={{ marginTop: 16 }}>
            <strong>Reviewer comments:</strong>
            <p style={{ margin: "6px 0 0" }}>{submission.rejection_comment}</p>
          </MessageBox>
        )}

        <CertificateBlock submission={submission} />
      </div>
    </div>
  );
}
