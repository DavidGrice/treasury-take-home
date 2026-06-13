"use client";
import React, { useState } from "react";
import Button from "@/components/ui/Button";
import SecondaryButton from "@/components/ui/SecondaryButton";
import { BASE_FIELDS, IMAGE_QUALITY_FIELDS, applicableExtraFields, fieldValue, getImageUrls } from "@/lib/domain/submissionFields";
import SectionTitle from "@/components/ui/SectionTitle";
import FieldRow from "@/components/ui/FieldRow";
import ImageGallery from "@/components/ui/ImageGallery";
import ChecklistGroup from "@/components/ui/ChecklistGroup";
import { SUBMISSION_STATUSES } from "@/lib/constants/statuses";

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

  const imageUrls = getImageUrls(submission);

  const allFields = [...BASE_FIELDS, ...applicableExtraFields(submission)];
  const rejectionFields = [...allFields, ...IMAGE_QUALITY_FIELDS];

  const updateStatus = async (status: typeof SUBMISSION_STATUSES.APPROVED | typeof SUBMISSION_STATUSES.REJECTED, extra?: any) => {
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
    updateStatus(SUBMISSION_STATUSES.REJECTED, { rejectionReasons, rejectionComment: comment });
  };

  if (showReject) {
    return (
      <div style={{ padding: 8 }}>
        <h3 style={{ marginTop: 0 }}>Reasons for Rejection</h3>
        <p style={{ color: "#666", fontSize: 13 }}>Select the fields that caused this submission to be rejected.</p>
        <ChecklistGroup
          items={allFields}
          selected={reasons}
          onToggle={(key, checked) => setReasons((s) => ({ ...s, [key]: checked }))}
        />

        <ChecklistGroup
          title="Image quality"
          items={IMAGE_QUALITY_FIELDS}
          selected={reasons}
          onToggle={(key, checked) => setReasons((s) => ({ ...s, [key]: checked }))}
        />
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
              <FieldRow key={f.key} label={f.label} value={fieldValue(submission, f.key)} />
            ))}
          </div>
        </div>
        <div style={{ flex: "1 1 280px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
          <ImageGallery imageUrls={imageUrls} altPrefix="Submitted label" enlargeable gap={12} />
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 20 }}>
        <Button onClick={() => updateStatus(SUBMISSION_STATUSES.APPROVED)} disabled={submitting} style={{ background: "#16a34a", border: "none" }}>
          Approve
        </Button>
        <Button onClick={() => setShowReject(true)} disabled={submitting} style={{ background: "#ef4444", color: "white", border: "none" }}>
          Reject
        </Button>
      </div>
    </div>
  );
}
