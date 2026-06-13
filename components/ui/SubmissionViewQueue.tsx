"use client";

import React, { useState } from "react";
import Button from "./Button";
import SecondaryButton from "./SecondaryButton";
import SectionTitle from "./SectionTitle";

// Generic read-only Prev/Next browser over a list of submissions, used for
// "View All" buttons on filtered tabs (gov queue / client dashboard). Unlike
// GovReviewQueue, items here are never removed from the list - reviewing one
// just moves on to the next.
export default function SubmissionViewQueue({
  submissions,
  startIndex = 0,
  onClose,
  renderItem,
}: {
  submissions: any[];
  startIndex?: number;
  onClose: () => void;
  renderItem: (submission: any) => React.ReactNode;
}) {
  const [index, setIndex] = useState(Math.min(Math.max(startIndex, 0), Math.max(submissions.length - 1, 0)));

  if (submissions.length === 0) {
    return (
      <div style={{ width: "100%", textAlign: "center", padding: 8 }}>
        <SectionTitle>View All</SectionTitle>
        <p className="text-sm" style={{ color: "#555" }}>No submissions to show.</p>
        <div style={{ marginTop: 16 }}>
          <Button onClick={onClose}>Close</Button>
        </div>
      </div>
    );
  }

  const safeIndex = Math.min(index, submissions.length - 1);
  const current = submissions[safeIndex];

  const goPrev = () => setIndex((i) => Math.max(0, i - 1));
  const goNext = () => setIndex((i) => Math.min(submissions.length - 1, i + 1));

  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        {safeIndex > 0 ? <SecondaryButton onClick={goPrev}>← Previous</SecondaryButton> : <span />}
        <span className="text-sm" style={{ color: "#555" }}>
          Viewing {safeIndex + 1} of {submissions.length}
        </span>
        {safeIndex < submissions.length - 1 ? <SecondaryButton onClick={goNext}>Next →</SecondaryButton> : <span />}
      </div>

      {renderItem(current)}
    </div>
  );
}
