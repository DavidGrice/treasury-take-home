"use client";

import React, { useState } from "react";
import Button from "@/components/ui/Button";
import SecondaryButton from "@/components/ui/SecondaryButton";
import SectionTitle from "@/components/ui/SectionTitle";
import GovReviewModal from "./GovReviewModal";

// Drives the "In Queue" review flow for a set of submitted forms: lets a
// reviewer either step through the whole queue ("Continue Queue" - each
// Approve/Reject automatically advances to the next submission) or browse
// freely via Previous/Next, e.g. when opened from a single row in the table.
export default function GovReviewQueue({
  submissions,
  startIndex = 0,
  onClose,
  onUpdated,
}: {
  submissions: any[];
  startIndex?: number;
  onClose: () => void;
  onUpdated: (updated: any) => void;
}) {
  const [queue, setQueue] = useState(submissions);
  const [index, setIndex] = useState(Math.min(Math.max(startIndex, 0), Math.max(submissions.length - 1, 0)));

  if (queue.length === 0) {
    return (
      <div style={{ width: "100%", textAlign: "center", padding: 8 }}>
        <SectionTitle>Review Queue</SectionTitle>
        <p className="text-sm" style={{ color: "#555" }}>All submissions in the queue have been reviewed.</p>
        <div style={{ marginTop: 16 }}>
          <Button onClick={onClose}>Close</Button>
        </div>
      </div>
    );
  }

  const safeIndex = Math.min(index, queue.length - 1);
  const current = queue[safeIndex];

  const goPrev = () => setIndex((i) => Math.max(0, i - 1));
  const goNext = () => setIndex((i) => Math.min(queue.length - 1, i + 1));

  // called after a submission is successfully approved/rejected: drop it
  // from the queue and either move on to the next one (continue-queue flow)
  // or close if it was the only/last one left
  const handleUpdated = (updated: any) => {
    onUpdated(updated);
    const next = queue.filter((s) => s.id !== current.id);
    if (next.length === 0) {
      onClose();
      return;
    }
    setQueue(next);
    setIndex((i) => Math.min(i, next.length - 1));
  };

  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        {safeIndex > 0 ? <SecondaryButton onClick={goPrev}>← Previous</SecondaryButton> : <span />}
        <span className="text-sm" style={{ color: "#555" }}>
          Reviewing {safeIndex + 1} of {queue.length}
        </span>
        {safeIndex < queue.length - 1 ? <SecondaryButton onClick={goNext}>Next →</SecondaryButton> : <span />}
      </div>

      <GovReviewModal key={current.id} submission={current} onClose={() => {}} onUpdated={handleUpdated} />
    </div>
  );
}
