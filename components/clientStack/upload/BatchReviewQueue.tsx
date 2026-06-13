"use client";

import React, { useState } from "react";
import Button from "@/components/ui/Button";
import SecondaryButton from "@/components/ui/SecondaryButton";
import SectionTitle from "@/components/ui/SectionTitle";
import BatchCorrectionForm from "./BatchCorrectionForm";

// Drives the "Batch Needs Review" correction flow for a set of rows: lets a
// reviewer either step through every row that needs review ("Review All" -
// each Resubmit automatically advances to the next one) or browse freely via
// Previous/Next, e.g. when opened from a single row in the table.
export default function BatchReviewQueue({
  rows,
  startIndex = 0,
  onClose,
  onRowDone,
}: {
  rows: any[];
  startIndex?: number;
  onClose: () => void;
  onRowDone: (rowId: string) => void;
}) {
  const [queue, setQueue] = useState(rows);
  const [index, setIndex] = useState(Math.min(Math.max(startIndex, 0), Math.max(rows.length - 1, 0)));

  if (queue.length === 0) {
    return (
      <div style={{ width: "100%", textAlign: "center", padding: 8 }}>
        <SectionTitle>Batch Review</SectionTitle>
        <p className="text-sm" style={{ color: "#555" }}>All rows in this batch have been reviewed.</p>
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

  // called after a row is successfully resubmitted: drop it from the queue
  // and either move on to the next row (review-all flow) or close if it was
  // the only/last one left
  const handleRowDone = () => {
    onRowDone(current.id);
    const next = queue.filter((r) => r.id !== current.id);
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

      <BatchCorrectionForm key={current.id} row={current} onDone={handleRowDone} />
    </div>
  );
}
