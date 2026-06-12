"use client";
import React, { useState } from "react";
import Button from "./Button";
import SecondaryButton from "./SecondaryButton";
import { BASE_FIELDS, IMAGE_QUALITY_FIELDS, applicableExtraFields, fieldValue } from "./submissionFields";
import SectionTitle from "./SectionTitle";

export default function GovReviewModal({
  submission,
  onClose,
  onUpdated,
}: {
  submission: any;
  onClose: () => void;
  onUpdated: (s: any) => void;
}) {
  const [showReject, setShowReject] = useState(false);
  const [reasons, setReasons] = useState<Record<string, boolean>>({});
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const allFields = [...BASE_FIELDS, ...applicableExtraFields(submission)];
  const rejectionFields = [...allFields, ...IMAGE_QUALITY_FIELDS];

  const updateStatus = async (status: "Approved" | "Rejected", extra?: any) => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/submissions/${submission.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, ...extra }),
      });
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      const updated = await res.json();
      onUpdated(updated);
      onClose();
    } catch (err) {
      console.error("Failed to update submission status:", err);
      alert("Failed to update status. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmReject = () => {
    const rejectionReasons = rejectionFields.filter((f) => reasons[f.key]).map((f) => f.label);
    updateStatus("Rejected", { rejectionReasons, rejectionComment: comment });
  };

  if (showReject) {
    return (
      <div style={{ padding: 8 }}>
        <h3 style={{ marginTop: 0 }}>Reasons for Rejection</h3>
        <p style={{ color: "#666", fontSize: 13 }}>Select the fields that caused this submission to be rejected.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
          {allFields.map((f) => (
            <label key={f.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={!!reasons[f.key]}
                onChange={(e) => setReasons((s) => ({ ...s, [f.key]: e.target.checked }))}
              />
              {f.label}
            </label>
          ))}
        </div>

        <p style={{ color: "#666", fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Image quality</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
          {IMAGE_QUALITY_FIELDS.map((f) => (
            <label key={f.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={!!reasons[f.key]}
                onChange={(e) => setReasons((s) => ({ ...s, [f.key]: e.target.checked }))}
              />
              {f.label}
            </label>
          ))}
        </div>
        <div className="field-row">
          <label className="field-label">Additional comments</label>
          <textarea
            className="field-input"
            rows={4}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Explain what needs to be corrected..."
          />
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 16 }}>
          <SecondaryButton onClick={() => setShowReject(false)} disabled={submitting}>
            Back
          </SecondaryButton>
          <Button
            onClick={handleConfirmReject}
            disabled={submitting || (Object.values(reasons).every((v) => !v) && !comment.trim())}
            style={{ background: "#ef4444", border: "none" }}
          >
            Confirm Rejection
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 8 }}>
      <SectionTitle>Label Review</SectionTitle>
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 280px" }}>
          <div className="fields-area">
            {allFields.map((f) => (
              <div className="field-row" key={f.key}>
                <label className="field-label">{f.label}</label>
                <div className="field-input" style={{ background: "#f9f9f9" }}>{fieldValue(submission, f.key) || "—"}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ flex: "1 1 280px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
          {submission.image_url ? (
            <>
              <img
                src={submission.image_url}
                alt="Submitted label"
                style={{ maxWidth: "100%", maxHeight: 420, objectFit: "contain", borderRadius: 8, border: "1px solid #eee" }}
              />
              <SecondaryButton onClick={() => setExpanded(true)}>
                Expand Image
              </SecondaryButton>
            </>
          ) : (
            <div style={{ color: "#666" }}>No image uploaded.</div>
          )}
        </div>
      </div>

      {expanded && submission.image_url && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", cursor: "zoom-out" }}
          onClick={() => setExpanded(false)}
        >
          <img
            src={submission.image_url}
            alt="Submitted label (expanded)"
            style={{ maxWidth: "95vw", maxHeight: "95vh", objectFit: "contain", borderRadius: 8 }}
          />
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 20 }}>
        <Button onClick={() => updateStatus("Approved")} disabled={submitting} style={{ background: "#16a34a", border: "none" }}>
          Approve
        </Button>
        <Button onClick={() => setShowReject(true)} disabled={submitting} style={{ background: "#ef4444", color: "white", border: "none" }}>
          Reject
        </Button>
      </div>
    </div>
  );
}
