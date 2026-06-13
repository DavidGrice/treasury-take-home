"use client";
import React from "react";
import SectionTitle from "./SectionTitle";
import FieldRow from "./FieldRow";
import MessageBox from "./MessageBox";
import CertificateBlock from "./CertificateBlock";
import { getImageUrls } from "@/lib/domain/submissionFields";

export default function AcceptedReviewModal({ submission }: { submission: any }) {
  const imageUrls = getImageUrls(submission);

  return (
    <div style={{ padding: 8, display: "flex", flexDirection: "column", height: "75vh" }}>
      <SectionTitle>Approved Submission</SectionTitle>
      <div style={{ overflowY: "auto", flex: 1 }}>
        <MessageBox variant="success" style={{ marginBottom: 16 }}>
          <p style={{ margin: 0, fontWeight: 600 }}>Status: Approved</p>
          <p style={{ margin: "6px 0 0" }}>
            This Certificate of Label Approval (COLA) has been reviewed and approved by TTB. The label may be used as submitted.
          </p>
        </MessageBox>

        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 280px" }}>
            <div className="fields-area">
              <FieldRow label="TTB ID" value={submission.id} />
              <FieldRow label="Status" value="Approved" />
              <FieldRow label="Approval Date" value={submission.decided_at ? new Date(submission.decided_at).toLocaleString() : undefined} />
              <FieldRow label="Brand Name" value={submission.brand} />
              <FieldRow label="Class / Type" value={submission.type_designation} />
              <FieldRow label="Qualifications" value="None" />
            </div>
          </div>
          <div style={{ flex: "1 1 280px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {imageUrls.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
                {imageUrls.map((url, i) => (
                  <img
                    key={url + i}
                    src={url}
                    alt={`Approved label ${i + 1}`}
                    style={{ maxWidth: imageUrls.length > 1 ? 260 : "100%", maxHeight: 420, objectFit: "contain", borderRadius: 8, border: "1px solid #eee" }}
                  />
                ))}
              </div>
            ) : (
              <div style={{ color: "#666" }}>No image uploaded.</div>
            )}
          </div>
        </div>

        {imageUrls.length > 0 && (
          <div style={{ marginTop: 12, textAlign: "center", display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
            {imageUrls.map((url, i) => (
              <a
                key={url + i}
                href={url}
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
                {imageUrls.length > 1 ? `Download photo ${i + 1}` : "Click to download printable version"}
              </a>
            ))}
          </div>
        )}

        <CertificateBlock submission={submission} style={{ marginTop: 20 }} />
      </div>
    </div>
  );
}
